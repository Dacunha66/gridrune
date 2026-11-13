// Collection League ("Rangliste") against the computer. Same rules the online league will use:
// deck limits, seeded fair runner, rock cells, two rounds with swapped start and a decider. Signed in, the server hands out the match and checks it; a won match unlocks the rarest new discovery.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameIcon } from '../components/GameIcon';
import { ResultIcon } from '../components/ResultIcon';
import { Card } from '../components/Card';
import { CARDS, RARITY_LABEL, RARITY_ORDER, Rarity, cardPower, getCard, ownedActiveIds } from '../game/cards';
import { Outcome, Side } from '../game/battle';
import { COLLECTION_LEAGUE_RULES, OwnedCounts, autoDeck, countCards, rarityCounts, validateDeck } from '../game/rules';
import { deriveRng, matchCode, newMatchSeed } from '../game/league';
import { MatchProgress, emptyMatch, nextStep, recordRound, wins } from '../game/match';
import { Pick } from '../game/runner';
import { SaveData } from '../game/storage';
import { Header } from './Header';
import { Battle } from './Battle';
import { Online } from './Online';
import { RuneMatchup } from '../components/RuneBadge';
import { findRune } from '../game/runes';
import { DuelLog, LeagueTicket, handPicks, leagueCpuHand, leagueCpuRune, leagueRound } from '../game/verify';
import { LadderChange, ladderStatusRemote } from '../game/adventureApi';
import { LadderConfig, LadderState, ladderLevel } from '../game/ladder';
import { LadderPanel, LadderResult } from '../components/Ladder';
import { nightmareTicket } from '../game/nightmare';
import { LEVEL_LABEL } from '../game/stats';
import { Reward } from '../game/rewards';
import { CloudSave } from '../game/cloudSave';
import { finishLeagueRemote, readPending, startLeague, writePending } from '../game/adventureApi';
import { RevealItem, RewardReveal } from '../components/RewardReveal';
import { Coin } from '../components/Coin';

const RULES = COLLECTION_LEAGUE_RULES;

interface Props {
  save: SaveData;
  reducedMotion: boolean;
  skin: [string, string, string];
  /** Runes in play for this player (null = not released): the equipped rune if allowed in the league. */
  runes?: { player: string | null; equipped: string | null } | null;
  onSaveDeck: (deck: string[]) => void;
  onExit: () => void;
  /** Signed in: the server hands out the match and checks it; a won match unlocks a card. null = guest (no reward). */
  account?: { uid: string; adopt: (c: CloudSave) => void } | null;
  /** Online ranked matches (accounts): reload the save after a duel (coins). null = only against the computer. */
  online?: { onFinished: () => void } | null;
}

type Payout = { status: 'checking' | 'paid' | 'pending' | 'rejected' | 'guest' | 'lost'; reward?: Reward; ladder?: LadderChange | null };

/** Offline test: every owned card counts as two copies (online, real copies will count). */
function ownedCounts(save: SaveData): OwnedCounts {
  return Object.fromEntries(ownedActiveIds(save.unlocked).map((id) => [id, RULES.deck.maxCopies]));
}

export function League({ save, reducedMotion, runes = null, onSaveDeck, onExit, account = null, online = null }: Props) {
  const owned = useMemo(() => ownedCounts(save), [save]);
  const savedDeck = save.leagueDeck.length ? save.leagueDeck : autoDeck(RULES.deck, owned);
  const [stage, setStage] = useState<'ladder' | 'deck' | 'online' | 'intro' | 'run' | 'match' | 'done'>('ladder');
  // Ranglisten-Ligen (accounts): the player's step; null while loading, 'offline' without a connection.
  const [ladder, setLadder] = useState<{ ladder: LadderState; config: LadderConfig } | null | 'offline'>(null);
  const [ladderLoads, setLadderLoads] = useState(0);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    void ladderStatusRemote().then((r) => { if (alive) setLadder((cur) => r ?? (cur && cur !== 'offline' ? cur : 'offline')); });
    return () => { alive = false; };
  }, [account?.uid, ladderLoads]);
  const toLadder = () => {
    setStage('ladder');
    setLadderLoads((n) => n + 1);
  };
  const [deck, setDeck] = useState<string[]>(savedDeck);
  const [seed, setSeed] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [match, setMatch] = useState<MatchProgress>(emptyMatch());
  const [roundScores, setRoundScores] = useState<string[]>([]);
  const [between, setBetween] = useState<string | null>(null);
  const [ticket, setTicket] = useState<LeagueTicket | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const roundLogs = useRef<DuelLog[]>([]);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);

  // The computer mirrors the league deck the match was started with (same rarities, other cards); signed in: the ticket's deck.
  const matchDeck = ticket?.deck ?? deck;
  // The computer's strength: from the ticket (the player's league); a guest plays like Bronze.
  const level = ticket?.level ?? ladderLevel(0);
  const guestNightmare = useMemo(() => nightmareTicket(), []);
  const nightmare = ticket ? ticket.nightmare : guestNightmare;
  const cpuHand = useMemo(() => (seed ? leagueCpuHand(seed, matchDeck, ticket ? ticket.level : level, nightmare) : []), [seed, matchDeck, ticket, level, nightmare]);
  // The computer's rune: one basic rune per match, fixed by the match seed (same in every round); signed in: from the server.
  const cpuRune = ticket ? ticket.cpuRune : seed ? leagueCpuRune(seed, !!runes) : null;
  const playerRune = ticket ? ticket.playerRune : runes?.player ?? null;
  const runeNote = runes && !runes.equipped
    ? 'Du hast noch keine Rune – Grundrunen spielst du in der Kampagne frei.'
    : runes && !runes.player
      ? `In der Rangliste sind nur die Grundrunen erlaubt – „${findRune(runes.equipped)?.name ?? 'deine Rune'}“ bleibt hier draußen. Ändern unter „Deck bearbeiten“ → „Rune“.`
      : 'Jede Rune einmal pro Duell (in jeder Runde neu). In der Rangliste nur Grundrunen, die du in der Kampagne freigespielt hast. Ändern unter „Deck bearbeiten“ → „Rune“.';

  async function startMatch() {
    let s = newMatchSeed();
    let t: LeagueTicket | null = null;
    if (account) {
      if (starting === '…') return;
      setStarting('…');
      const r = await startLeague(deck, runes?.player ?? null);
      if (r.kind !== 'ticket') {
        setStarting(r.kind === 'offline'
          ? 'Keine Verbindung – für ein Ranglisten-Match brauchst du kurz Internet.'
          : r.error === 'deck' ? 'Das Deck passt nicht zu den Ranglisten-Regeln oder deiner Sammlung.' : `Das Match konnte nicht gestartet werden (${r.error}).`);
        setStage('deck');
        return;
      }
      t = r.ticket;
      s = t.seed;
    }
    setStarting(null);
    setTicket(t);
    roundLogs.current = [];
    setPayout(null);
    setRevealOpen(false);
    setSeed(s);
    setMatch(emptyMatch());
    setRoundScores([]);
    setBetween(null);
    setStage('intro');
  }


  const step = nextStep(match);
  const stepRound = step.kind === 'round' ? step.round : 0;
  // Arena, rock, coin toss and the computer's random source of the current round – created once per round, so the
  // game uses exactly the sources the server replays with.
  const round = useMemo(() => (seed && stepRound ? leagueRound(seed, stepRound) : null), [seed, stepRound]);

  async function finishMatch(won: boolean) {
    if (!account || !ticket) {
      setPayout({ status: won ? 'guest' : 'lost' });
      return;
    }
    setPayout({ status: 'checking' });
    const log = { rounds: roundLogs.current };
    const r = await finishLeagueRemote(ticket.id, log);
    if (r.kind === 'paid') {
      account.adopt(r.cloud);
      setPayout({ status: r.won ? 'paid' : 'lost', reward: r.reward, ladder: r.ladder ?? null });
      if (r.ladder) setLadder((l) => (l && l !== 'offline' ? { ...l, ladder: r.ladder!.state } : l));
      if (r.won) setRevealOpen(true);
    } else if (r.kind === 'offline') {
      writePending(account.uid, [...readPending(account.uid), { kind: 'league', ticketId: ticket.id, log, at: new Date().toISOString() }]);
      setPayout({ status: 'pending' });
    } else {
      if (r.cloud) account.adopt(r.cloud);
      setPayout({ status: 'rejected' });
    }
  }

  function onRoundEnd(first: Side, result: Outcome, sc: { player: number; cpu: number }, duel?: DuelLog) {
    if (duel) roundLogs.current = [...roundLogs.current, duel];
    const winner: Side | 'draw' = result === 'win' ? 'player' : result === 'loss' ? 'cpu' : 'draw';
    const next = recordRound(match, first, winner);
    setMatch(next);
    const n = next.winners.length;
    setRoundScores([...roundScores, `${n > 2 ? 'Entscheidung' : `Runde ${n}`}: ${sc.player}:${sc.cpu} ${winner === 'player' ? '✓' : '✗'}`]);
    const after = nextStep(next);
    if (after.kind === 'done') {
      setStage('done');
      void finishMatch(after.winner === 'player');
    }
    else setBetween(after.decider ? `Stand ${wins(next, 'player')}:${wins(next, 'cpu')} – Entscheidungsduell! Ein neuer Münzwurf entscheidet, wer beginnt.` : `Stand ${wins(next, 'player')}:${wins(next, 'cpu')} – in Runde 2 beginnt ${after.first === 'player' ? 'du' : 'der Gegner'}.`);
  }

  if (stage === 'ladder') {
    const l = ladder && ladder !== 'offline' ? ladder : null;
    return (
      <main className="screen league">
        <Header title="Rangliste" onBack={onExit} />
        <div className="scroll">
          {account && !ladder && <p className="muted center">Liga wird geladen …</p>}
          {account && ladder === 'offline' && <p className="hint center">Keine Verbindung – für die Rangliste brauchst du kurz Internet.</p>}
          {l && <LadderPanel state={l.ladder} config={l.config} />}
          {!account && (
            <section className="runner-info">
              <h2>Ligen</h2>
              <p>Mit einem Konto steigst du von <b>Bronze</b> bis zum <b>Runenmeister</b> auf: 5 Siege = nächste Stufe, Safepoints schützen vor dem Abstieg, jeden Monat eine neue Saison mit Belohnungen.</p>
              <p className="muted small">Als Gast spielst du gegen den Computer auf „{LEVEL_LABEL[ladderLevel(0)]}“ – ohne Liga und Belohnung.</p>
            </section>
          )}
        </div>
        <footer className="bottombar">
          <button type="button" className="btn btn-primary btn-wide" disabled={!!account && !l} onClick={() => setStage('deck')}><GameIcon name="swords" /> Spielen</button>
        </footer>
      </main>
    );
  }

  // Online first: a player of a similar step; nobody there → the computer of the league.
  if (stage === 'online' && account && online) {
    return (
      <Online uid={account.uid} deck={deck} rune={runes?.player ?? null} reducedMotion={reducedMotion} onFinished={online.onFinished} onExit={onExit}
        ranked={{ onNoOpponent: () => { setStage('deck'); void startMatch(); }, onNext: toLadder }} />
    );
  }

  if (stage === 'deck') {
    return (
      <LeagueDeckEditor deck={deck} owned={owned} onChange={setDeck} onBack={() => setStage('ladder')} busy={starting === '…'} notice={starting && starting !== '…' ? starting : null}
        onPlay={() => { onSaveDeck(deck); if (account && online) setStage('online'); else void startMatch(); }} />
    );
  }

  if (stage === 'intro') {
    return (
      <main className="screen league">
        <Header title="Rangliste" onBack={() => setStage('deck')} />
        <div className="scroll league-intro">
          <section className="runner-info">
            <h2>Match {matchCode(seed)}</h2>
            <ul className="plain-list">
              <li><GameIcon name="cards" /> Du spielst mit deinem <b>Ranglisten-Deck</b>: Es wird gemischt, <b>5 Karten</b> hast du auf der Hand, vor jedem Zug ziehst du nach.</li>
              <li><GameIcon name="swords" /> <b>2 Runden</b> mit demselben Deck (jede Runde neu gemischt), der Start wird getauscht. 2:0 gewinnt, bei 1:1 folgt ein <b>Entscheidungsduell</b>.</li>
              <li><GameIcon name="bot" /> Der Computer spielt auf <b>{LEVEL_LABEL[level] ?? level}</b>{ticket?.step !== undefined ? <> – passend zu deiner Liga</> : null}. {level === 'easy' ? 'Sein Deck ist eine feste, eher schwache Mischung.' : level === 'medium' ? 'Sein Deck folgt deinem, aber eine Seltenheit schwächer.' : level === 'hard' ? <>Er spielt mit einem <b>Spiegel-Deck</b>: genauso viele Karten jeder Seltenheit wie dein Deck, aber andere Karten.</> : 'Seine Karten sind stärker als deine.'}</li>
              <li><GameIcon name="lock" /> In jedem Duell blockiert ein <b>Fels</b> ein Feld: 15 Felder, kein Unentschieden, kein Startvorteil.</li>
            </ul>
            {runes && <RuneMatchup player={playerRune} cpu={cpuRune} note={runeNote} />}
            <p className="league-prize"><GameIcon name="gift" /> <b>Gewinnst du das Match</b>, bekommst du eine <b>zufällige Karte, die du noch nicht hast</b>. Hast du schon alle, gibt es <Coin /> 50.</p>
            <p className="muted small">{account ? 'Match gegen den Computer – der Server prüft die Duelle, bevor die Belohnung gutgeschrieben wird.' : 'Als Gast spielst du ohne Belohnung – melde dich an, um Karten zu gewinnen.'}</p>
          </section>
        </div>
        <footer className="bottombar"><button type="button" className="btn btn-primary btn-wide" onClick={() => { setPicks(handPicks(deck)); setStage('match'); }}><GameIcon name="swords" /> Match starten</button></footer>
      </main>
    );
  }

  if (stage === 'match' && step.kind === 'round') {
    if (between) {
      return (
        <main className="screen league">
          <div className="admin-empty">
            <h2>Runde beendet</h2>
            <ul className="plain-list center">{roundScores.map((r) => <li key={r}>{r}</li>)}</ul>
            <p>{between}</p>
            <button type="button" className="btn btn-primary" onClick={() => setBetween(null)}>Weiter</button>
          </div>
        </main>
      );
    }
    if (!round) return null;
    return (
      <Battle
        key={`${seed}-${step.round}`}
        picks={picks}
        unlocked={save.unlocked}
        reducedMotion={reducedMotion}
        setup={{
          cpuHand: cpuHand.map((c) => ({ ...c })),
          first: step.first,
          arena: round.arena,
          rocks: round.rocks,
          label: `${step.decider ? 'Entscheidungsduell' : `Runde ${step.round} von 2`} · Stand ${wins(match, 'player')}:${wins(match, 'cpu')}`,
          tossRng: round.toss,
          rng: round.ai,
          deal: () => deriveRng(seed, `deal:${stepRound}`),
          finishLabel: 'Weiter',
          runes: { player: playerRune, cpu: cpuRune },
          ai: { level },
        }}
        onEnd={(result, sc, started, record) => onRoundEnd(started, result, sc, record ? { first: record.start.turn, moves: record.moves } : undefined)}
        onQuit={onExit}
      />
    );
  }

  const won = step.kind === 'done' && step.winner === 'player';
  const reward = payout?.reward;
  const reveal: RevealItem[] = reward?.newCard
    ? [{ kind: 'card', cardId: reward.newCard, source: 'Sieg in der Rangliste' }]
    : reward && reward.coins > 0 ? [{ kind: 'coins', amount: reward.coins, sources: ['Sieg in der Rangliste (keine neue Entdeckung)'] }] : [];
  const statusText = !payout ? '' : {
    checking: 'Match wird vom Server geprüft …',
    paid: reward?.newCard ? `✓ Geprüft – neue Karte: ${getCard(reward.newCard).name}` : `✓ Geprüft – keine neue Entdeckung, dafür 🪙 ${reward?.coins ?? 0}`,
    pending: 'Keine Verbindung – die Belohnung wird gutgeschrieben, sobald du wieder online bist (innerhalb von 24 Stunden).',
    rejected: 'Das Match konnte nicht bestätigt werden – es gibt keine Belohnung.',
    guest: 'Als Gast gibt es keine Belohnung – mit einem Konto gewinnst du hier Karten.',
    lost: 'Nur ein gewonnenes Match bringt eine neue Karte.',
  }[payout.status];
  return (
    <main className={`screen result ${won ? 'result-win' : 'result-loss'}`}>
      {revealOpen && reveal.length > 0 && <RewardReveal items={reveal} reducedMotion={reducedMotion} onClose={() => setRevealOpen(false)} />}
      <ResultIcon outcome={won ? 'win' : 'loss'} />
      <h1>{won ? 'Match gewonnen!' : 'Match verloren'}</h1>
      <p className="result-score"><span className="blue">{wins(match, 'player')}</span> : <span className="red">{wins(match, 'cpu')}</span></p>
      <div className="reward-box">
        <ul className="plain-list">{roundScores.map((r) => <li key={r}>{r}</li>)}</ul>
        {payout?.ladder && <LadderResult {...payout.ladder} />}
        {statusText && <p className={`result-status status-${payout?.status}`} role="status">{statusText.replace('🪙', '')}{payout?.status === 'paid' && !reward?.newCard && <> <Coin /></>}</p>}
        {reveal.length > 0 && payout?.status === 'paid' && !revealOpen && <button type="button" className="btn" onClick={() => setRevealOpen(true)}>🎁 Belohnung ansehen</button>}
        <p className="muted small">Match {matchCode(seed)}</p>
        <p className="muted small">Seed zum Nachprüfen: <span className="mono break">{seed}</span></p>
      </div>
      <div className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" disabled={payout?.status === 'checking' || starting === '…'} onClick={() => void startMatch()}>▶ Neues Match</button>
        <button type="button" className="btn" onClick={() => setStage('deck')}>Deck ändern</button>
        <button type="button" className="btn" onClick={toLadder}>Liga ansehen</button>
        <button type="button" className="btn" onClick={onExit}>Menü</button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- deck editor

function LeagueDeckEditor({ deck, owned, onChange, onBack, onPlay, busy = false, notice = null }: {
  deck: string[];
  owned: OwnedCounts;
  onChange: (d: string[]) => void;
  onBack: () => void;
  onPlay: () => void;
  busy?: boolean;
  notice?: string | null;
}) {
  const errors = validateDeck(deck, RULES.deck, owned);
  const counts = countCards(deck);
  const rc = rarityCounts(deck.filter((id) => CARDS.some((c) => c.id === id)));
  const list = useMemo(
    () => Object.keys(owned).map(getCard).sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || cardPower(b) - cardPower(a)),
    [owned],
  );
  const limit = (r: Rarity) => RULES.deck.rarityLimits[r];

  function add(id: string) {
    if (deck.length >= RULES.deck.size || (counts.get(id) ?? 0) >= RULES.deck.maxCopies) return;
    const r = getCard(id).rarity;
    const l = limit(r);
    if (l !== undefined && rc[r] >= l) return;
    onChange([...deck, id]);
  }
  function remove(id: string) {
    const i = deck.lastIndexOf(id);
    if (i >= 0) onChange(deck.filter((_, j) => j !== i));
  }

  return (
    <main className="screen league">
      <Header title="Dein Deck" onBack={onBack} right={<span className={`pill ${errors.length ? 'warn' : 'ok'}`}>{deck.length}/{RULES.deck.size}</span>} />
      <div className="limit-row">
        {(['mythic', 'legendary', 'epic'] as Rarity[]).map((r) => (
          <span key={r} className={`chip-mini ${rc[r] > (limit(r) ?? 99) ? 'warn' : ''}`}>
            <span className={`rarity-text rarity-${r}`}>{RARITY_LABEL[r]}</span> {rc[r]}/{limit(r)}
          </span>
        ))}
        <span className="chip-mini">max. {RULES.deck.maxCopies}× gleiche Karte</span>
      </div>
      <div className="deck-actions">
        <button type="button" className="btn btn-small" onClick={() => onChange(autoDeck(RULES.deck, owned))}>Automatisch</button>
        <button type="button" className="btn btn-small" onClick={() => onChange([])}>Leeren</button>
      </div>
      {errors.length > 0 && <ul className="admin-warning league-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="scroll">
        <ul className="admin-list">
          {list.map((c) => {
            const n = counts.get(c.id) ?? 0;
            return (
              <li key={c.id} className={`admin-row league-row ${n ? 'in-deck-row' : ''}`}>
                <span className="admin-thumb league-thumb"><Card id={c.id} size="sm" /></span>
                <span className="admin-row-main">
                  <strong>{c.name}</strong>
                  <span className="admin-row-meta"><span className={`rarity-text rarity-${c.rarity}`}>{RARITY_LABEL[c.rarity]}</span> · Σ {cardPower(c)}</span>
                </span>
                <span className="copy-stepper">
                  <button type="button" className="btn btn-step" aria-label={`${c.name} entfernen`} disabled={n === 0} onClick={() => remove(c.id)}>−</button>
                  <b>{n}</b>
                  <button type="button" className="btn btn-step" aria-label={`${c.name} hinzufügen`} onClick={() => add(c.id)}>+</button>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="muted small center">Jede Karte, die du besitzt, zählt als 2 Exemplare.</p>
      </div>
      <footer className="bottombar">
        {notice && <p className="league-notice" role="alert">{notice}</p>}
        <button type="button" className="btn btn-primary btn-wide" disabled={errors.length > 0 || busy} onClick={onPlay}>
          {errors.length ? 'Deck ist noch nicht gültig' : busy ? 'Match wird vorbereitet …' : <><GameIcon name="swords" /> Match starten</>}
        </button>
      </footer>
    </main>
  );
}
