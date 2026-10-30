// Online duel against a real player: choose 8 cards, then challenge a friend (invite code), enter a friend's
// code, or look for a random opponent. The server is the referee; this screen shows its view live.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Confetti } from '../components/Effects';
import { RuneBadge } from '../components/RuneBadge';
import { Header } from './Header';
import { Battle, BattleSetup } from './Battle';
import { CLASSIC_ARENA } from '../game/arenas';
import { BattleState, HAND_SIZE } from '../game/battle';
import { cardPower, getCard } from '../game/cards';
import { findRune, Action } from '../game/runes';
import { PVP_ABSENT_SECONDS, PVP_TURN_SECONDS, PVP_WIN_COINS, PvpView, normalizeCode } from '../game/pvp';
import { pvpErrorText, pvpFetch, pvpInvite, pvpJoin, pvpLeave, pvpMove, pvpPing, pvpQueue, pvpStats, pvpTick, pvpWatch } from '../game/pvpApi';
import { Pick } from '../game/runner';

interface Props {
  uid: string;
  /** The player's deck (20 cards) – the 8 duel cards are chosen from it. */
  deck: string[];
  /** Rune for online duels (league rules: owned basic runes), null = none. */
  rune: string | null;
  reducedMotion: boolean;
  /** A duel ended: the server may have paid coins – reload the account save. */
  onFinished: () => void;
  onExit: () => void;
}

const HAND_KEY = 'gridrune/pvp-hand';
const SITE = 'https://gridrune.netlify.app';

function strongest(deck: readonly string[]): string[] {
  return [...deck].sort((a, b) => cardPower(getCard(b)) - cardPower(getCard(a)) || a.localeCompare(b)).slice(0, HAND_SIZE);
}

function savedHand(deck: readonly string[]): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HAND_KEY) ?? '[]');
    if (Array.isArray(raw) && raw.length === HAND_SIZE && raw.every((id) => deck.includes(id)) && new Set(raw).size === HAND_SIZE) return raw;
  } catch {
    // no saved hand
  }
  return strongest(deck);
}

export function Online({ uid, deck, rune, reducedMotion, onFinished, onExit }: Props) {
  const [hand, setHand] = useState<string[]>(() => savedHand(deck));
  const [choosing, setChoosing] = useState(false);
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
    pvpStats().then(setStats);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(HAND_KEY, JSON.stringify(hand));
    } catch {
      // private mode
    }
  }, [hand]);

  // Only take newer views of the current match (live updates and replies can arrive out of order).
  const take = useCallback((v: PvpView | null | undefined) => {
    if (!v) return;
    setView((cur) => {
      if (cur && cur.matchId !== v.matchId) return v.status === 'playing' || v.status === 'waiting' ? v : cur;
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
    if (!matchId || (status !== 'waiting' && status !== 'playing')) return;
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
      pvpStats().then(setStats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function start(kind: 'invite' | 'join' | 'queue') {
    if (busy) return;
    if (kind === 'join' && normalizeCode(code).length !== 6) return setError('Bitte den 6-stelligen Code eingeben.');
    setBusy(true);
    setError('');
    setDuelDone(false);
    const r = kind === 'invite' ? await pvpInvite(hand, rune) : kind === 'join' ? await pvpJoin(code, hand, rune) : await pvpQueue(hand, rune);
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
          <div className="result-icon" aria-hidden="true">{r.outcome === 'win' ? '🏆' : r.outcome === 'draw' ? '🤝' : '💀'}</div>
          <h1>{title}</h1>
          <p className="muted">gegen {view.opponentName ?? 'Gegner'}</p>
          <p className="result-score"><span className="blue">{r.score.me}</span> : <span className="red">{r.score.opponent}</span></p>
          {why && <p className="small">{why}</p>}
          {r.outcome === 'win' && (
            <p className="reward-line">{r.coins > 0 ? `🪙 +${r.coins} gutgeschrieben` : 'Heute keine Münzen mehr gegen diesen Gegner (zählt aber in der Statistik).'}</p>
          )}
          {stats && <p className="muted small">Online-Bilanz: 🏆 {stats.wins} · 🤝 {stats.draws} · 💀 {stats.losses}</p>}
        </div>
        <div className="menu-buttons">
          <button type="button" className="btn btn-primary btn-big" onClick={() => { setView(null); setDuelDone(false); }}>⚔️ Neues Online-Duell</button>
          <button type="button" className="btn" onClick={onExit}>Zum Menü</button>
        </div>
      </main>
    );
  }

  // ---------- Waiting ----------
  if (view && view.status === 'waiting') {
    const link = view.code ? `${SITE}/?duell=${view.code}` : '';
    const text = view.code ? `Fordere mich in GridRune heraus! Öffne ${link} → „Online-Duell“ → Code ${view.code}` : '';
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
        <Header title="Online-Duell" onBack={leave} />
        <div className="scroll online-body">
          {view.kind === 'invite' ? (
            <section className="online-card">
              <p>Dein Einladungs-Code:</p>
              <p className="invite-code" aria-label={`Code ${view.code?.split('').join(' ')}`}>{view.code}</p>
              <button type="button" className="btn btn-primary" onClick={share}>📤 Einladung teilen</button>
              <p className="muted small">Dein Freund öffnet GridRune, meldet sich an, tippt auf „Online-Duell“ und gibt den Code ein. Das Duell startet automatisch.</p>
            </section>
          ) : (
            <section className="online-card">
              <p className="searching" aria-live="polite">🔎 Suche einen Gegner …</p>
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
  const toggle = (id: string) => {
    if (hand.includes(id)) setHand(hand.filter((h) => h !== id));
    else if (hand.length < HAND_SIZE) setHand([...hand, id]);
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    start('join');
  };
  const ready = hand.length === HAND_SIZE && !choosing;
  return (
    <main className="screen online">
      <Header title="Online-Duell" onBack={onExit} />
      <div className="scroll online-body">
        <p className="muted small">
          Ein Duell gegen einen echten Spieler. {PVP_TURN_SECONDS} Sekunden pro Zug – danach wird eine zufällige Karte gelegt.
          Ist ein Spieler {PVP_ABSENT_SECONDS} Sekunden nicht verbunden, gewinnt der andere. Ein Sieg bringt 🪙 {PVP_WIN_COINS}.
        </p>
        {stats && <p className="small">Deine Online-Bilanz: 🏆 {stats.wins} · 🤝 {stats.draws} · 💀 {stats.losses}</p>}

        <section className="brief-hand">
          <h2>Deine 8 Karten <span className="muted small">{hand.length}/{HAND_SIZE}</span></h2>
          <div className={`hand-grid ${choosing ? 'pool' : ''}`}>
            {(choosing ? deck : hand).map((id) => (
              <div key={id} className="hand-pick">
                <Card id={id} size="sm" selected={choosing && hand.includes(id)} onClick={choosing ? () => toggle(id) : undefined}
                  ariaLabel={`${getCard(id).name}${hand.includes(id) ? ', gewählt' : ''}`} />
              </div>
            ))}
          </div>
          {choosing ? (
            <div className="row-buttons">
              <button type="button" className="btn btn-small" onClick={() => setHand(strongest(deck))}>Vorschlag</button>
              <button type="button" className="btn btn-small" onClick={() => setChoosing(false)} disabled={hand.length !== HAND_SIZE}>Fertig</button>
            </div>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => setChoosing(true)}>Karten ändern</button>
          )}
          {runeDef && <p className="small rune-reward"><RuneBadge rune={runeDef} className="small" /> <span>Deine Rune: <b>{runeDef.name}</b></span></p>}
        </section>

        <section className="online-actions">
          <button type="button" className="btn btn-primary btn-big" disabled={!ready || busy} onClick={() => start('invite')}>🤝 Freund herausfordern</button>
          <form className="code-form" onSubmit={submitCode}>
            <input className="admin-input code-input" value={code} placeholder="CODE" inputMode="text" autoCapitalize="characters" autoComplete="off"
              aria-label="Einladungs-Code" maxLength={8} onChange={(e) => setCode(normalizeCode(e.target.value))} />
            <button type="submit" className="btn" disabled={!ready || busy}>Beitreten</button>
          </form>
          <button type="button" className="btn" disabled={!ready || busy} onClick={() => start('queue')}>🎲 Zufälligen Gegner suchen</button>
          {busy && <p className="muted small">☁️ Einen Moment …</p>}
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
  const [picks] = useState<Pick[]>(() => state.hands.player.map((c, i) => ({ cardId: c.cardId, kind: 'deck', gate: i, mod: 0 })));
  const [setup] = useState<BattleSetup>(() => ({
    cpuHand: [],
    first: state.turn,
    rocks: state.rocks,
    arena: { ...CLASSIC_ARENA, name: view.arenaName ?? CLASSIC_ARENA.name, cells: state.terrain },
    label: `⚔️ Online · ${view.opponentName ?? 'Gegner'}`,
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
  const online = useMemo(() => ({ state, deadline: view.status === 'playing' ? view.turnDeadline : null, opponentName: view.opponentName ?? 'Gegner', onAction: send }),
    [state, view.status, view.turnDeadline, view.opponentName, send]);
  return <Battle picks={picks} unlocked={[]} reducedMotion={reducedMotion} setup={setup} online={online} onEnd={onDone} onQuit={onQuit} />;
}
