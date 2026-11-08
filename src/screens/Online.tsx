// Online duel against a real player: choose 8 cards, then challenge a friend (invite code), enter a friend's
// code, or look for a random opponent. The server is the referee; this screen shows its view live.
import { Avatar } from '../components/Avatar';
import { Coin } from '../components/Coin';
import { GameIcon } from '../components/GameIcon';
import { ResultIcon } from '../components/ResultIcon';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Confetti } from '../components/Effects';
import { RuneBadge } from '../components/RuneBadge';
import { Header } from './Header';
import { Battle, BattleSetup } from './Battle';
import { CLASSIC_ARENA } from '../game/arenas';
import { BattleState, DRAW_HAND_SIZE } from '../game/battle';
import { DECK_SIZE } from '../game/cards';
import { findRune, Action } from '../game/runes';
import { PVP_ABSENT_SECONDS, PVP_TURN_SECONDS, PVP_WIN_COINS, PvpView, normalizeCode } from '../game/pvp';
import {
  PvpMode, pvpDeck, pvpErrorText, pvpFetch, pvpInvite, pvpJoin, pvpLeave, pvpMove, pvpPing, pvpQueue, pvpStats, pvpTick, pvpWatch,
} from '../game/pvpApi';
import { Pick } from '../game/runner';
import { DRAFT_DECK_SECONDS, DRAFT_PREPARE_SECONDS, DRAFT_WIN_COINS } from '../game/draft';
import { DraftDeckBuilder, poolPlanText, useSecondsLeft } from './Draft';

interface Props {
  uid: string;
  /** "duel": 8 own cards; "draft": Draft League (shared pool, deck of 20, run). */
  mode?: PvpMode;
  /** Runner skin colours (draft run). */
  skin?: [string, string, string];
  /** Draft: practice against the computer. */
  onPractice?: () => void;
  /** The player's deck (20 cards) – the 8 duel cards are chosen from it. */
  deck: string[];
  /** Rune for online duels (league rules: owned basic runes), null = none. */
  rune: string | null;
  reducedMotion: boolean;
  /** A duel ended: the server may have paid coins – reload the account save. */
  onFinished: () => void;
  onExit: () => void;
}

const SITE = typeof location !== 'undefined' ? location.origin : 'https://gridrune.pages.dev';

export function Online({ uid, mode = 'duel', onPractice, deck, rune, reducedMotion, onFinished, onExit }: Props) {
  const draftMode = mode === 'draft';
  const title = draftMode ? 'Draft-Liga' : 'Online-Duell';
  // Online duels are played with the whole deck (5 on the hand, the rest drawn).
  const hand = deck;
  const [code, setCode] = useState(() => normalizeCode(new URLSearchParams(location.search).get('duell') ?? ''));
  const [view, setView] = useState<PvpView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{ wins: number; draws: number; losses: number } | null>(null);
  /** The duel's board finished (Battle's "Ergebnis" pressed) – then the result is shown. */
  const [duelDone, setDuelDone] = useState(false);
  const matchId = view?.matchId ?? null;
  const status = view?.status ?? null;
  const runeDef = findRune(rune);

  useEffect(() => {
    pvpStats(mode).then(setStats);
  }, [mode]);

  // Only take newer views of the current match (live updates and replies can arrive out of order).
  const take = useCallback((v: PvpView | null | undefined) => {
    if (!v) return;
    setView((cur) => {
      if (cur && cur.matchId !== v.matchId) return v.status === 'playing' || v.status === 'waiting' || v.status === 'drafting' ? v : cur;
      if (cur && cur.status === 'finished' && v.status !== 'finished') return cur;
      const n = (x: PvpView | null) => (x?.state ? x.state.moveCount * 100 + x.state.log.length : -1);
      if (cur && cur.status === v.status && n(v) < n(cur)) return cur;
      return v;
    });
  }, []);

  // Live updates for this player.
  useEffect(() => pvpWatch(uid, take), [uid, take]);

  // Sign of life: while waiting a cheap ping (plus a look at the view), while playing a tick (also checks
  // time-outs and whether the opponent is still there).
  useEffect(() => {
    if (!matchId || (status !== 'waiting' && status !== 'playing' && status !== 'drafting')) return;
    const beat = () => {
      if (status === 'waiting') {
        pvpPing(matchId);
        pvpFetch(matchId, uid).then(take);
      } else pvpTick(matchId).then((r) => take(r.view));
    };
    beat();
    const t = setInterval(beat, 5000);
    return () => clearInterval(t);
  }, [matchId, status, uid, take]);

  useEffect(() => {
    if (status === 'finished') {
      onFinished();
      pvpStats(mode).then(setStats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function start(kind: 'invite' | 'join' | 'queue') {
    if (busy) return;
    if (kind === 'join' && normalizeCode(code).length !== 6) return setError('Bitte den 6-stelligen Code eingeben.');
    setBusy(true);
    setError('');
    setDuelDone(false);
    const h = draftMode ? null : hand;
    const r = kind === 'invite' ? await pvpInvite(mode, h, rune) : kind === 'join' ? await pvpJoin(mode, code, h, rune) : await pvpQueue(mode, h, rune);
    setBusy(false);
    if (r.ok) setView(r.view);
    else setError(pvpErrorText(r.error));
  }

  async function leave() {
    if (!matchId) return;
    const r = await pvpLeave(matchId);
    if (r.ok && r.view.status === 'finished') take(r.view);
    else {
      setView(null);
      setDuelDone(false);
    }
  }

  // ---------- Draft: deck building, run, waiting ----------
  if (view && view.status === 'drafting' && view.draft) {
    return <DraftPrep key={view.matchId} view={view} onView={take} onQuit={leave} />;
  }

  // ---------- Duel ----------
  if (view && view.state && (view.status === 'playing' || (view.status === 'finished' && !duelDone && view.result?.reason === 'normal'))) {
    return <OnlineDuel key={view.matchId} view={view} reducedMotion={reducedMotion} onView={take} onDone={() => setDuelDone(true)} onQuit={leave} />;
  }

  // ---------- Result ----------
  if (view && view.status === 'finished' && view.result) {
    const r = view.result;
    const title = r.outcome === 'win' ? 'Sieg!' : r.outcome === 'draw' ? 'Unentschieden' : 'Niederlage';
    const why = r.reason === 'absent'
      ? r.outcome === 'win' ? `${view.opponentName ?? 'Dein Gegner'} war über ${PVP_ABSENT_SECONDS} Sekunden nicht mehr verbunden.` : `Deine Verbindung war über ${PVP_ABSENT_SECONDS} Sekunden weg.`
      : r.reason === 'left'
        ? r.outcome === 'win' ? `${view.opponentName ?? 'Dein Gegner'} hat aufgegeben.` : 'Du hast aufgegeben.'
        : '';
    return (
      <main className={`screen result result-${r.outcome}`}>
        {r.outcome === 'win' && !reducedMotion && <Confetti count={60} />}
        <div className="scroll result-body">
          <ResultIcon outcome={r.outcome} />
          <h1>{title}</h1>
          <p className="muted">gegen {view.opponentAvatar && <Avatar id={view.opponentAvatar} size={24} />} {view.opponentName ?? 'Gegner'}{view.opponentTitle && <span className="opponent-title"> · {view.opponentTitle}</span>}</p>
          <p className="result-score"><span className="blue">{r.score.me}</span> : <span className="red">{r.score.opponent}</span></p>
          {why && <p className="small">{why}</p>}
          {r.outcome === 'win' && (
            <p className="reward-line">{r.coins > 0 ? <><Coin /> +{r.coins} gutgeschrieben</> : r.score.me + r.score.opponent === 0 ? 'Keine Münzen – das Duell hatte noch nicht begonnen.' : 'Heute keine Münzen mehr gegen diesen Gegner (zählt aber in der Statistik).'}</p>
          )}
          {stats && <p className="muted small">{draftMode ? 'Draft' : 'Online'}-Bilanz: <GameIcon name="crown" /> {stats.wins} · <GameIcon name="handshake" /> {stats.draws} · <GameIcon name="skull" /> {stats.losses}</p>}
        </div>
        <div className="menu-buttons">
          <button type="button" className="btn btn-primary btn-big" onClick={() => { setView(null); setDuelDone(false); }}>{draftMode ? 'Neuer Draft' : 'Neues Online-Duell'}</button>
          <button type="button" className="btn" onClick={onExit}>Zum Menü</button>
        </div>
      </main>
    );
  }

  // ---------- Waiting ----------
  if (view && view.status === 'waiting') {
    const link = view.code ? `${SITE}/?duell=${view.code}` : '';
    const text = view.code ? `Fordere mich in GridRune heraus! Öffne ${link} → „${title}“ → Code ${view.code}` : '';
    const share = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'GridRune-Duell', text });
        else {
          await navigator.clipboard.writeText(text);
          setError('Einladung kopiert ✓');
        }
      } catch {
        // share sheet closed
      }
    };
    return (
      <main className="screen online">
        <Header title={title} onBack={leave} />
        <div className="scroll online-body">
          {view.kind === 'invite' ? (
            <section className="online-card">
              <p>Dein Einladungs-Code:</p>
              <p className="invite-code" aria-label={`Code ${view.code?.split('').join(' ')}`}>{view.code}</p>
              <button type="button" className="btn btn-primary" onClick={share}><GameIcon name="share" /> Einladung teilen</button>
              <p className="muted small">Dein Freund öffnet GridRune, meldet sich an, tippt auf „{title}“ und gibt den Code ein. Das Duell startet automatisch.</p>
            </section>
          ) : (
            <section className="online-card">
              <p className="searching" aria-live="polite">Suche einen Gegner …</p>
              <p className="muted small">Sobald jemand anderes ebenfalls sucht, startet das Duell. Lass diese Seite dafür geöffnet.</p>
            </section>
          )}
          {error && <p className="hint">{error}</p>}
        </div>
        <button type="button" className="btn" onClick={leave}>Abbrechen</button>
      </main>
    );
  }

  // ---------- Lobby ----------
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    start('join');
  };
  const ready = draftMode || hand.length === DECK_SIZE;
  return (
    <main className="screen online">
      <Header title={title} onBack={onExit} />
      <div className="scroll online-body">
        {draftMode ? (
          <section className="online-card draft-intro">
            <p><b>So läuft ein Draft:</b></p>
            <ol className="draft-steps">
              <li>Beide bekommen denselben Pool aus 30 Karten ({poolPlanText()}). Deine Sammlung spielt keine Rolle.</li>
              <li>Du wählst in {Math.round(DRAFT_DECK_SECONDS / 60)} Minuten verdeckt 20 Karten für dein Draft-Deck.</li>
              <li>Duell mit deinem Draft-Deck: 5 Karten auf der Hand, vor jedem Zug ziehst du nach. {PVP_TURN_SECONDS} s pro Zug. Ein Sieg bringt <Coin /> {DRAFT_WIN_COINS}. Danach verfällt das Draft-Deck.</li>
            </ol>
          </section>
        ) : (
          <p className="muted small">
            Ein Duell gegen einen echten Spieler. {PVP_TURN_SECONDS} Sekunden pro Zug – danach wird eine zufällige Karte gelegt.
            Ist ein Spieler {PVP_ABSENT_SECONDS} Sekunden nicht verbunden, gewinnt der andere. Ein Sieg bringt <Coin /> {PVP_WIN_COINS}.
          </p>
        )}
        {stats && <p className="small">Deine {draftMode ? 'Draft' : 'Online'}-Bilanz: <GameIcon name="crown" /> {stats.wins} · <GameIcon name="handshake" /> {stats.draws} · <GameIcon name="skull" /> {stats.losses}</p>}

        {!draftMode && <section className="brief-hand">
          <h2>Dein Deck <span className="muted small">{hand.length}/{DECK_SIZE}</span></h2>
          <p className="muted small">Du spielst mit deinem ganzen Deck: gemischt, {DRAW_HAND_SIZE} Karten auf der Hand, vor jedem Zug ziehst du nach. Ändern unter „Deck bearbeiten“.</p>
          {runeDef && <p className="small rune-reward"><RuneBadge rune={runeDef} className="small" /> <span>Deine Rune: <b>{runeDef.name}</b></span></p>}
        </section>}
        {draftMode && runeDef && <p className="small rune-reward"><RuneBadge rune={runeDef} className="small" /> <span>Deine Rune: <b>{runeDef.name}</b></span></p>}

        <section className="online-actions">
          <button type="button" className="btn btn-primary btn-big" disabled={!ready || busy} onClick={() => start('invite')}>Freund herausfordern</button>
          <form className="code-form" onSubmit={submitCode}>
            <input className="admin-input code-input" value={code} placeholder="CODE" inputMode="text" autoCapitalize="characters" autoComplete="off"
              aria-label="Einladungs-Code" maxLength={8} onChange={(e) => setCode(normalizeCode(e.target.value))} />
            <button type="submit" className="btn" disabled={!ready || busy}>Beitreten</button>
          </form>
          <button type="button" className="btn" disabled={!ready || busy} onClick={() => start('queue')}><GameIcon name="dice" /> Zufälligen Gegner suchen</button>
          {onPractice && <button type="button" className="btn btn-ghost" onClick={onPractice}><GameIcon name="bot" /> Üben gegen die KI</button>}
          {busy && <p className="muted small">Einen Moment …</p>}
          {error && <p className="admin-warning" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}

/** The board of an online duel: Battle with the server's state; own actions go to the server one after another. */
function OnlineDuel({ view, reducedMotion, onView, onDone, onQuit }: {
  view: PvpView; reducedMotion: boolean; onView: (v: PvpView | undefined) => void; onDone: () => void; onQuit: () => void;
}) {
  const state = view.state as BattleState;
  const [picks] = useState<Pick[]>(() => state.hands.player.map((c, i) => ({ cardId: c.cardId, kind: 'deck', gate: i, mod: c.mod })));
  const [setup] = useState<BattleSetup>(() => ({
    cpuHand: [],
    first: state.turn,
    rocks: state.rocks,
    arena: { ...CLASSIC_ARENA, name: view.arenaName ?? CLASSIC_ARENA.name, cells: state.terrain },
    label: `Online · ${view.opponentName ?? 'Gegner'}`,
    tossRng: Math.random,
    finishLabel: 'Ergebnis',
  }));
  // Actions are sent strictly one after another (a rune and then a card in the same turn).
  const queue = useRef(Promise.resolve());
  const send = useCallback((action: Action, before: BattleState) => {
    queue.current = queue.current.then(async () => {
      const r = await pvpMove(view.matchId, action, before.moveCount);
      onView(r.view);
    });
  }, [view.matchId, onView]);
  const online = useMemo(() => ({ state, deadline: view.status === 'playing' ? view.turnDeadline : null, opponentName: `${view.opponentName ?? 'Gegner'}${view.opponentTitle ? ` (${view.opponentTitle})` : ''}`, onAction: send,
    myAvatar: view.myAvatar ?? null, opponentAvatar: view.opponentAvatar ?? null }),
    [state, view.status, view.turnDeadline, view.opponentName, view.opponentTitle, view.myAvatar, view.opponentAvatar, send]);
  return <Battle picks={picks} unlocked={[]} reducedMotion={reducedMotion} setup={setup} online={online} onEnd={onDone} onQuit={onQuit} />;
}

/** Draft preparation: build the deck, then wait for the opponent (the duel is played with the draft deck). */
function DraftPrep({ view, onView, onQuit }: {
  view: PvpView; onView: (v: PvpView | undefined) => void; onQuit: () => void;
}) {
  const d = view.draft!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareLeft = useSecondsLeft(d.deadline);
  // The deck must be ready a few minutes before the end of the preparation (the rest is for the run).
  const deckDeadline = d.deadline ? new Date(new Date(d.deadline).getTime() - (DRAFT_PREPARE_SECONDS - DRAFT_DECK_SECONDS) * 1000).toISOString() : null;
  const opponent = view.opponentName ?? 'Gegner';

  if (!d.deck) {
    return (
      <DraftDeckBuilder pool={d.pool} deadline={deckDeadline} busy={busy} title={`Draft gegen ${opponent}`} onBack={onQuit}
        onDone={async (deck) => {
          setBusy(true);
          const r = await pvpDeck(view.matchId, deck);
          setBusy(false);
          onView(r.view);
          if (!r.ok) setError(pvpErrorText(r.error));
        }} />
    );
  }
  return (
    <main className="screen online">
      <Header title="Draft-Liga" onBack={onQuit} />
      <div className="scroll online-body">
        <section className="online-card">
          <p className="searching" aria-live="polite">Warte auf {opponent} …</p>
          <ul className="draft-status">
            <li>Du: Deck {d.deck ? '✓' : '…'}</li>
            <li>{opponent}: Deck {d.opponentDeckDone ? '✓' : '…'}</li>
          </ul>
          {prepareLeft !== null && <p className="muted small">Spätestens in {Math.floor(prepareLeft / 60)}:{String(prepareLeft % 60).padStart(2, '0')} beginnt das Duell – wer dann nicht fertig ist, bekommt seine Karten automatisch.</p>}
          {error && <p className="admin-warning" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}
