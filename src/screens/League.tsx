// Collection League – test mode against the computer. Same rules the online league will use:
// deck limits, seeded fair runner, rock cells, two rounds with swapped start and a decider.
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { CARDS, RARITY_LABEL, RARITY_ORDER, Rarity, cardPower, getCard, ownedActiveIds } from '../game/cards';
import { Outcome, Side } from '../game/battle';
import { drawCpuHand } from '../game/ai';
import { COLLECTION_LEAGUE_RULES, OwnedCounts, autoDeck, countCards, rarityCounts, validateDeck } from '../game/rules';
import { deriveRng, leagueLayout, matchCode, newMatchSeed, roundRock, seedFingerprint } from '../game/league';
import { leagueArena } from '../game/arenas';
import { MatchProgress, emptyMatch, nextStep, recordRound, wins } from '../game/match';
import { Pick, RunInput, replayRun } from '../game/runner';
import { SaveData } from '../game/storage';
import { Header } from './Header';
import { Runner } from './Runner';
import { Battle } from './Battle';
import { RuneMatchup } from '../components/RuneBadge';
import { availableRunes, findRune } from '../game/runes';

const RULES = COLLECTION_LEAGUE_RULES;

interface Props {
  save: SaveData;
  reducedMotion: boolean;
  skin: [string, string, string];
  /** Runes in play for this player (null = not released): the equipped rune if allowed in the league. */
  runes?: { player: string | null; equipped: string | null } | null;
  onSaveDeck: (deck: string[]) => void;
  onExit: () => void;
}

/** Offline test: every owned card counts as two copies (online, real copies will count). */
function ownedCounts(save: SaveData): OwnedCounts {
  return Object.fromEntries(ownedActiveIds(save.unlocked).map((id) => [id, RULES.deck.maxCopies]));
}

export function League({ save, reducedMotion, skin, runes = null, onSaveDeck, onExit }: Props) {
  const owned = useMemo(() => ownedCounts(save), [save]);
  const savedDeck = save.leagueDeck.length ? save.leagueDeck : autoDeck(RULES.deck, owned);
  const [stage, setStage] = useState<'deck' | 'intro' | 'run' | 'match' | 'done'>('deck');
  const [deck, setDeck] = useState<string[]>(savedDeck);
  const [seed, setSeed] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [replayOk, setReplayOk] = useState<boolean | null>(null);
  const [match, setMatch] = useState<MatchProgress>(emptyMatch());
  const [roundScores, setRoundScores] = useState<string[]>([]);
  const [between, setBetween] = useState<string | null>(null);

  const layout = useMemo(() => (seed ? leagueLayout(seed, 'du', deck) : null), [seed, deck]);
  const cpuHand = useMemo(() => (seed ? drawCpuHand(deriveRng(seed, 'cpu-hand')) : []), [seed]);
  // The computer's rune: one basic rune per match, fixed by the match seed (same in every round).
  const cpuRune = useMemo(() => {
    if (!seed || !runes) return null;
    const basic = availableRunes('league', []);
    return basic.length ? basic[Math.floor(deriveRng(seed, 'cpu-rune')() * basic.length)].id : null;
  }, [seed, runes]);
  const runeNote = runes && runes.equipped && !runes.player
    ? `In der Liga sind nur die Grundrunen erlaubt – „${findRune(runes.equipped)?.name ?? 'deine Rune'}“ bleibt hier draußen. Ändern unter „Deck bearbeiten“ → „Rune“.`
    : 'Jede Rune einmal pro Duell (in jeder Runde neu). In der Liga nur Grundrunen – für alle gleich. Ändern unter „Deck bearbeiten“ → „Rune“.';

  function startMatch() {
    const s = newMatchSeed();
    setSeed(s);
    setFingerprint('');
    seedFingerprint(s).then(setFingerprint).catch(() => setFingerprint('–'));
    setMatch(emptyMatch());
    setRoundScores([]);
    setBetween(null);
    setStage('intro');
  }

  function onRunFinished(p: Pick[], inputs: RunInput[]) {
    // The same check the server will run: replay the inputs and compare.
    const replay = replayRun(layout!, inputs);
    setReplayOk(replay.error === null && JSON.stringify(replay.picks) === JSON.stringify(p));
    setPicks(p);
    setStage('match');
  }

  const step = nextStep(match);

  function onRoundEnd(first: Side, result: Outcome, sc: { player: number; cpu: number }) {
    const winner: Side | 'draw' = result === 'win' ? 'player' : result === 'loss' ? 'cpu' : 'draw';
    const next = recordRound(match, first, winner);
    setMatch(next);
    const n = next.winners.length;
    setRoundScores([...roundScores, `${n > 2 ? 'Entscheidung' : `Runde ${n}`}: ${sc.player}:${sc.cpu} ${winner === 'player' ? '✓' : '✗'}`]);
    const after = nextStep(next);
    if (after.kind === 'done') setStage('done');
    else setBetween(after.decider ? `Stand ${wins(next, 'player')}:${wins(next, 'cpu')} – Entscheidungsduell! Ein neuer Münzwurf entscheidet, wer beginnt.` : `Stand ${wins(next, 'player')}:${wins(next, 'cpu')} – in Runde 2 beginnt ${after.first === 'player' ? 'du' : 'der Gegner'}.`);
  }

  if (stage === 'deck') {
    return <LeagueDeckEditor deck={deck} owned={owned} onChange={setDeck} onBack={onExit} onPlay={() => { onSaveDeck(deck); startMatch(); }} />;
  }

  if (stage === 'intro') {
    return (
      <main className="screen league">
        <Header title="Collection League" onBack={() => setStage('deck')} right={<span className="pill">Test</span>} />
        <div className="scroll league-intro">
          <section className="runner-info">
            <h2>Match {matchCode(seed)}</h2>
            <p className="muted small">Fingerabdruck (vor dem Match festgelegt): <span className="mono break">{fingerprint || '…'}</span></p>
            <ul className="plain-list">
              <li>🏃 Lauf mit 8 Toren: je <b>2 Karten aus deinem Deck</b> und <b>1 neutrale Entdeckung</b> (für beide Spieler gleich).</li>
              <li>🪨 Stolpersteine: −1 für die nächste Karte. Kein Vorspulen, kein Überspringen.</li>
              <li>⚔️ <b>2 Runden</b> mit derselben Hand, der Start wird getauscht. 2:0 gewinnt, bei 1:1 folgt ein <b>Entscheidungsduell</b>.</li>
              <li>🪨 In jedem Duell blockiert ein <b>Fels</b> ein Feld: 15 Felder, kein Unentschieden, kein Startvorteil.</li>
            </ul>
            {runes && <RuneMatchup player={runes.player} cpu={cpuRune} note={runeNote} />}
            <p className="muted small">Testmodus gegen den Computer – ohne Belohnung und ohne Wertung.</p>
          </section>
        </div>
        <footer className="bottombar"><button type="button" className="btn btn-primary btn-wide" onClick={() => setStage('run')}>▶ Lauf starten</button></footer>
      </main>
    );
  }

  if (stage === 'run' && layout) {
    return <Runner key={seed} layout={layout} deck={deck} unlocked={save.unlocked} reducedMotion={reducedMotion} skin={skin} onFinish={onRunFinished} onQuit={onExit} />;
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
    return (
      <Battle
        key={`${seed}-${step.round}`}
        picks={picks}
        unlocked={save.unlocked}
        reducedMotion={reducedMotion}
        setup={{
          cpuHand: cpuHand.map((c) => ({ ...c })),
          first: step.first,
          arena: leagueArena(seed, step.round),
          rocks: [roundRock(seed, step.round, leagueArena(seed, step.round).cells)],
          label: `${step.decider ? 'Entscheidungsduell' : `Runde ${step.round} von 2`} · Stand ${wins(match, 'player')}:${wins(match, 'cpu')}`,
          tossRng: deriveRng(seed, `toss:${step.round}`),
          finishLabel: 'Weiter',
          runes: { player: runes?.player ?? null, cpu: runes ? cpuRune : null },
        }}
        onEnd={(result, sc, started) => onRoundEnd(started, result, sc)}
        onQuit={onExit}
      />
    );
  }

  const won = step.kind === 'done' && step.winner === 'player';
  return (
    <main className={`screen result ${won ? 'result-win' : 'result-loss'}`}>
      <div className="result-icon" aria-hidden="true">{won ? '🏆' : '💀'}</div>
      <h1>{won ? 'Match gewonnen!' : 'Match verloren'}</h1>
      <p className="result-score"><span className="blue">{wins(match, 'player')}</span> : <span className="red">{wins(match, 'cpu')}</span></p>
      <div className="reward-box">
        <ul className="plain-list">{roundScores.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="muted small">Match {matchCode(seed)} · Lauf-Prüfung: {replayOk ? '✓ nachgespielt und bestätigt' : '⚠️ Abweichung'}</p>
        <p className="muted small">Seed zum Nachprüfen: <span className="mono break">{seed}</span></p>
      </div>
      <div className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" onClick={startMatch}>▶ Neues Match</button>
        <button type="button" className="btn" onClick={() => setStage('deck')}>Deck ändern</button>
        <button type="button" className="btn" onClick={onExit}>Hauptmenü</button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- deck editor

function LeagueDeckEditor({ deck, owned, onChange, onBack, onPlay }: {
  deck: string[];
  owned: OwnedCounts;
  onChange: (d: string[]) => void;
  onBack: () => void;
  onPlay: () => void;
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
      <Header title="Liga-Deck" onBack={onBack} right={<span className={`pill ${errors.length ? 'warn' : 'ok'}`}>{deck.length}/{RULES.deck.size}</span>} />
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
                <span className="admin-thumb"><Card id={c.id} size="xs" /></span>
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
        <p className="muted small center">Im Test zählt jede Karte, die du besitzt, als 2 Exemplare. Online zählen später deine echten Exemplare.</p>
      </div>
      <footer className="bottombar">
        <button type="button" className="btn btn-primary btn-wide" disabled={errors.length > 0} onClick={onPlay}>
          {errors.length ? 'Deck ist noch nicht gültig' : '▶ Match starten'}
        </button>
      </footer>
    </main>
  );
}
