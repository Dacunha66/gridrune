// Turm der Prüfungen: a permanent tower of floors, climbed one after the other with the own deck. Only with an
// account: the server hands out a ticket for each duel, replays it and only then unlocks the next floor and pays the
// floor's reward (once per account). Overview (the tower) → floor details → duel → result.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './Header';
import { DuelRecord } from './Battle';
import { BossIntro, MissionBattle, OpponentFace, TerrainMini } from './Campaign';
import { GameIcon } from '../components/GameIcon';
import { RewardIcon } from '../components/Coin';
import { ResultIcon } from '../components/ResultIcon';
import { Confetti } from '../components/Effects';
import { RevealItem, RewardReveal } from '../components/RewardReveal';
import { RuneMatchup } from '../components/RuneBadge';
import { ClassGlyph, TerrainGlyph } from '../components/GlyphIcons';
import { CLASSIC_ARENA } from '../game/arenas';
import { Outcome } from '../game/battle';
import { DECK_SIZE } from '../game/cards';
import { LEVEL_LABEL, RANK_LABEL, findArena, rewardText } from '../game/campaign';
import { GrantedReward } from '../game/campaignRewards';
import { TERRAIN_INFO } from '../game/effects';
import { findRune } from '../game/runes';
import { MissionLog, missionDeckPicks } from '../game/verify';
import { getDb } from '../game/cardStore';
import type { CloudSave } from '../game/cloudSave';
import {
  TowerTicket, finishTowerRemote, readPending, startTowerRemote, towerStatusRemote, writePending,
} from '../game/adventureApi';
import { loadFloors } from '../game/towerApi';
import { DIFFICULTY_LABEL, TowerFloor, floorMission, floorState, towerProgress, visibleFloors } from '../game/tower';

interface Props {
  deck: string[];
  unlocked: string[];
  reducedMotion: boolean;
  playerRune: string | null;
  runesOn: boolean;
  /** Signed in and synced; null = guest (the tower is only played with an account). */
  account: { uid: string; adopt: (c: CloudSave) => void } | null;
  /** Signed in (the account may still be loading). */
  signedIn: boolean;
  /** Admin test mode: drafts visible, every floor open, nothing is stored or paid. */
  test?: boolean;
  /** Admin test: open this floor right away. */
  startFloorId?: string;
  onDeck: () => void;
  onAccount: () => void;
  onExit: () => void;
}

type Status = 'checking' | 'paid' | 'pending' | 'rejected';
type View =
  | { k: 'tower' }
  | { k: 'floor'; id: string }
  | { k: 'intro'; id: string }
  | { k: 'battle'; id: string; ticket: TowerTicket; runId: number }
  | { k: 'result'; id: string; outcome: Outcome; score: { player: number; cpu: number }; status: Status; granted: GrantedReward[]; runId: number };

const START_ERROR: Record<string, string> = {
  deck: 'Dein Deck ist nicht gültig – bitte im Deck-Editor prüfen.',
  locked: 'Diese Etage ist noch gesperrt – schaffe zuerst die Etage darunter.',
  floor: 'Diese Etage gibt es nicht (mehr).',
};

export function Tower({ deck, unlocked, reducedMotion, playerRune, runesOn, account, signedIn, test = false, startFloorId, onDeck, onAccount, onExit }: Props) {
  const [all, setAll] = useState<TowerFloor[] | null>(null);
  const [cleared, setCleared] = useState<number | null>(null);
  const [rewarded, setRewarded] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<View>(() => (startFloorId ? { k: 'floor', id: startFloorId } : { k: 'tower' }));
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  // Admin test: progress only in memory (starts at 0, a win opens the next floor for the session).
  const [testCleared, setTestCleared] = useState(0);

  const load = async () => {
    setOffline(false);
    const [floors, status] = await Promise.all([getDb().then(loadFloors), account ? towerStatusRemote() : Promise.resolve(null)]);
    if (!floors || (account && !status)) {
      setOffline(true);
      return;
    }
    setAll(floors);
    if (status) {
      setCleared(status.cleared);
      setRewarded(status.rewarded);
    }
  };
  useEffect(() => {
    if (account) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.uid]);

  const floors = useMemo(() => visibleFloors(all ?? [], test), [all, test]);
  const done = test ? testCleared : cleared ?? 0;

  if (!account && signedIn) {
    return (
      <main className="screen tower">
        <Header title="Turm der Prüfungen" onBack={onExit} />
        <p className="muted center" role="status">Konto wird geladen …</p>
      </main>
    );
  }
  if (!account) {
    return (
      <main className="screen tower">
        <Header title="Turm der Prüfungen" onBack={onExit} />
        <div className="scroll tower-guest">
          <TowerArt />
          <h2>Nur mit Konto</h2>
          <p>Im Turm der Prüfungen steigst du Etage für Etage nach oben – jede Etage ein Duell gegen einen stärkeren Gegner, mit deinem eigenen Deck.</p>
          <p className="muted">Dein Fortschritt und die Belohnungen werden in deinem Konto gespeichert. Melde dich dafür an.</p>
          <button type="button" className="btn btn-primary btn-big" onClick={onAccount}><GameIcon name="user" /> Anmelden</button>
        </div>
      </main>
    );
  }
  if (offline) {
    return (
      <main className="screen tower">
        <Header title="Turm der Prüfungen" onBack={onExit} />
        <div className="scroll tower-guest">
          <p>Keine Verbindung zum Server – der Turm braucht kurz Internet.</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>Erneut versuchen</button>
        </div>
      </main>
    );
  }
  if (!all || cleared === null) {
    return (
      <main className="screen tower">
        <Header title="Turm der Prüfungen" onBack={onExit} />
        <p className="muted center" role="status">Turm wird geladen …</p>
      </main>
    );
  }

  const floor = 'id' in view ? floors.find((f) => f.id === view.id) ?? null : null;
  const toTower = () => {
    setNotice('');
    setView({ k: 'tower' });
  };

  if (view.k === 'tower' || !floor) {
    return <TowerOverview floors={floors} cleared={done} rewarded={rewarded} test={test} onOpen={(id) => setView({ k: 'floor', id })} onBack={onExit} />;
  }

  const begin = async () => {
    if (starting) return;
    setStarting(true);
    const r = await startTowerRemote(floor.id, deck, playerRune, test);
    setStarting(false);
    if (r.kind !== 'ticket') {
      setView({ k: 'floor', id: floor.id });
      setNotice(r.kind === 'offline' ? 'Keine Verbindung – zum Starten brauchst du kurz Internet.' : START_ERROR[r.error] ?? `Start nicht möglich (${r.error}).`);
      return;
    }
    setNotice('');
    setView({ k: 'battle', id: floor.id, ticket: r.ticket, runId: Date.now() });
  };

  if (view.k === 'floor') {
    return (
      <FloorDetail
        floor={floor} cleared={done} rewarded={rewarded.includes(floor.id)} deck={deck} test={test} playerRune={playerRune} runesOn={runesOn}
        notice={notice} starting={starting} onBack={toTower} onDeck={onDeck}
        onStart={() => (floor.opponent.intro ? setView({ k: 'intro', id: floor.id }) : void begin())}
      />
    );
  }
  const mission = floorMission(floor);
  if (view.k === 'intro') {
    return <BossIntro opponent={floor.opponent} mission={mission} reducedMotion={reducedMotion} onGo={() => void begin()} onBack={() => setView({ k: 'floor', id: floor.id })} />;
  }
  if (view.k === 'battle') {
    const { ticket, runId } = view;
    const finish = async (outcome: Outcome, score: { player: number; cpu: number }, _first: unknown, record: DuelRecord) => {
      setView({ k: 'result', id: floor.id, outcome, score, status: 'checking', granted: [], runId });
      const log: MissionLog = { run: null, duel: { first: record.start.turn, moves: record.moves } };
      const r = await finishTowerRemote(ticket.id, log);
      const update = (patch: Partial<Extract<View, { k: 'result' }>>) => setView((v) => (v.k === 'result' && v.runId === runId ? { ...v, ...patch } : v));
      if (r.kind === 'paid') {
        if (r.cloud) account.adopt(r.cloud);
        if (test) {
          if (r.won && floor.number > testCleared) setTestCleared(floor.number);
        } else {
          setCleared(r.cleared);
          if (r.rewarded) setRewarded((list) => [...new Set([...list, floor.id])]);
        }
        update({ outcome: r.outcome, score: { player: r.score.player, cpu: r.score.cpu }, status: 'paid', granted: r.granted });
      } else if (r.kind === 'offline') {
        if (!test) writePending(account.uid, [...readPending(account.uid), { kind: 'tower', ticketId: ticket.id, log, at: new Date().toISOString() }]);
        update({ status: 'pending' });
      } else {
        if (r.cloud) account.adopt(r.cloud);
        update({ status: 'rejected' });
      }
    };
    return (
      <MissionBattle key={runId} mission={mission} opponent={floor.opponent} picks={missionDeckPicks(mission, ticket.deck)} unlocked={unlocked}
        reducedMotion={reducedMotion} playerRune={playerRune} runesOn={runesOn} ticket={ticket} onEnd={finish} onQuit={() => setView({ k: 'floor', id: floor.id })} />
    );
  }
  const next = floors.find((f) => f.number > floor.number);
  return (
    <TowerResult
      floor={floor} view={view} test={test} reducedMotion={reducedMotion}
      onNext={next && view.outcome === 'win' && view.status === 'paid' ? () => setView({ k: 'floor', id: next.id }) : undefined}
      onAgain={() => setView({ k: 'floor', id: floor.id })}
      onDeck={onDeck}
      onTower={toTower}
    />
  );
}

// ---------- The tower ----------

function TowerArt() {
  return (
    <svg className="tower-art" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 60V24l-3-3V12h6v4h4v-4h10v4h4v-4h6v9l-3 3v36z" />
      <path d="M28 60V50a4 4 0 0 1 8 0v10M29 32h6M29 40h6" />
    </svg>
  );
}

function TowerOverview({ floors, cleared, rewarded, test, onOpen, onBack }: {
  floors: TowerFloor[]; cleared: number; rewarded: string[]; test: boolean; onOpen: (id: string) => void; onBack: () => void;
}) {
  const p = towerProgress(floors, cleared);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);
  // Top floor first: the tower is climbed from the bottom.
  const shown = [...floors].reverse();
  return (
    <main className="screen tower">
      <Header title="Turm der Prüfungen" onBack={onBack} />
      {test && <p className="test-banner">Testmodus – alle Etagen offen, nichts wird gespeichert</p>}
      <section className="tower-head">
        <p className="tower-section">{p.section || 'Turm der Prüfungen'}</p>
        {floors.length === 0 ? (
          <p className="muted">Noch keine Etagen – der Turm wird gerade gebaut.</p>
        ) : p.top ? (
          <p className="tower-pos"><b>Alle {floors.length} Etagen geschafft!</b> Neue Etagen folgen.</p>
        ) : (
          <p className="tower-pos"><b>Etage {p.sectionPos} von {p.sectionSize}</b></p>
        )}
        {floors.length > 0 && (
          <>
            <div className="tower-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.sectionSize} aria-valuenow={p.sectionDone} aria-label={`${p.sectionDone} von ${p.sectionSize} Etagen`}>
              <div style={{ width: `${p.sectionSize ? (p.sectionDone / p.sectionSize) * 100 : 0}%` }} />
            </div>
            <p className="muted small">{p.done} {p.done === 1 ? 'Etage' : 'Etagen'} abgeschlossen</p>
          </>
        )}
      </section>
      <div className="scroll tower-list">
        <ol className="tower-floors">
          {shown.map((f) => {
            const st = test ? (f.number <= cleared ? 'done' : 'current') : floorState(f, cleared);
            const isCurrent = !test && st === 'current';
            return (
              <li key={f.id}>
                <button
                  type="button" ref={isCurrent ? currentRef : undefined}
                  className={`tower-floor st-${st} diff-${f.difficulty} ${f.difficulty === 'boss' ? 'boss' : ''} ${f.status === 'draft' ? 'draft' : ''}`}
                  onClick={() => onOpen(f.id)}
                  aria-label={`Etage ${f.number}: ${f.name}, ${DIFFICULTY_LABEL[f.difficulty]}, ${st === 'done' ? 'geschafft' : st === 'current' ? 'aktuelle Etage' : 'gesperrt'}`}
                >
                  <span className="tf-num">{f.number}</span>
                  <span className="tf-main">
                    <span className="tf-name">{f.difficulty === 'boss' && <GameIcon name="crown" />} {f.name}{f.status === 'draft' && <span className="pill">Entwurf</span>}</span>
                    <span className="tf-sub">
                      {DIFFICULTY_LABEL[f.difficulty]}
                      {f.reward && <> · {rewarded.includes(f.id) ? <span className="tf-got">Belohnung erhalten</span> : <><RewardIcon type={f.reward.type} /> {rewardText(f.reward)}</>}</>}
                    </span>
                  </span>
                  <span className="tf-state" aria-hidden="true">
                    {st === 'done' ? <GameIcon name="check" /> : st === 'current' ? <GameIcon name="swords" /> : <GameIcon name="lock" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="tower-base" aria-hidden="true">Eingang</div>
      </div>
    </main>
  );
}

// ---------- One floor ----------

function FloorDetail({ floor, cleared, rewarded, deck, test, playerRune, runesOn, notice, starting, onBack, onDeck, onStart }: {
  floor: TowerFloor; cleared: number; rewarded: boolean; deck: string[]; test: boolean; playerRune: string | null; runesOn: boolean;
  notice: string; starting: boolean; onBack: () => void; onDeck: () => void; onStart: () => void;
}) {
  const st = test ? 'current' : floorState(floor, cleared);
  const o = floor.opponent;
  const arena = findArena(floor.arenaId) ?? CLASSIC_ARENA;
  const terrains = [...new Set(arena.cells)].filter((t) => t !== 'normal');
  const deckOk = deck.length === DECK_SIZE;
  return (
    <main className={`screen tower tower-detail ${floor.difficulty === 'boss' ? 'boss' : ''}`}>
      <Header title={`Etage ${floor.number}`} onBack={onBack} right={<span className={`pill diff-pill diff-${floor.difficulty}`}>{DIFFICULTY_LABEL[floor.difficulty]}</span>} />
      {test && <p className="test-banner">Testmodus – zählt nicht, keine Belohnung</p>}
      <div className="scroll brief-body">
        <h2 className="tower-floor-name">{floor.name}</h2>
        {floor.description && <p className="small">{floor.description}</p>}
        <section className={`brief-opponent rank-${o.rank}`}>
          <OpponentFace o={o} />
          <div>
            <p className="opp-name">{o.name} {o.rank !== 'normal' && <span className={`kind-pill kind-${o.rank}`}>{RANK_LABEL[o.rank]}</span>}</p>
            <p className="muted small">KI: {LEVEL_LABEL[o.level]}{o.prefer.length > 0 && <> · mag {o.prefer.map((c) => <ClassGlyph key={c} cls={c} />)}</>}</p>
            {o.description && <p className="small">{o.description}</p>}
          </div>
        </section>
        <section className="brief-arena">
          <TerrainMini cells={arena.cells} />
          <div>
            <p><b>{arena.name}</b></p>
            <p className="muted small">{terrains.length > 0 ? terrains.map((t, i) => <span key={t}>{i > 0 && ' · '}<TerrainGlyph terrain={t} /> {TERRAIN_INFO[t].label}</span>) : 'Keine Geländefelder'}</p>
          </div>
        </section>
        <section className="tower-reward">
          <h2>Belohnung</h2>
          {floor.reward ? (
            <p>
              <RewardIcon type={floor.reward.type} /> {rewardText(floor.reward)}{' '}
              {rewarded ? <span className="tf-got">– schon erhalten</span> : <span className="muted small">– einmalig beim ersten Sieg</span>}
            </p>
          ) : <p className="muted">Keine Belohnung</p>}
        </section>
        <section className="tower-status">
          <h2>Status</h2>
          <p>{st === 'done' ? '✓ Geschafft – du kannst die Etage jederzeit wiederholen.' : st === 'current' ? 'Deine nächste Etage.' : `Gesperrt – schaffe zuerst Etage ${floor.number - 1}.`}</p>
        </section>
        {runesOn && (
          <section className="brief-runes">
            <RuneMatchup player={playerRune} cpu={o.rune && findRune(o.rune) ? o.rune : null}
              note={playerRune ? 'Ändern unter „Deck bearbeiten“ → „Rune“.' : 'Du hast noch keine Rune – Runen spielst du in der Kampagne frei.'} />
          </section>
        )}
        <section className="tower-deck">
          <h2>Dein Deck</h2>
          <p>{deckOk ? `✓ ${deck.length} Karten – bereit.` : `Dein Deck hat ${deck.length} statt ${DECK_SIZE} Karten.`}</p>
          <button type="button" className="btn btn-small" onClick={onDeck}><GameIcon name="deck" /> Deck ändern</button>
        </section>
      </div>
      {notice && <p className="hint brief-notice" role="alert">{notice}</p>}
      <button type="button" className="btn btn-primary btn-big brief-start" disabled={starting || st === 'locked' || !deckOk} onClick={onStart}>
        {starting ? 'Wird gestartet …' : st === 'locked' ? <><GameIcon name="lock" /> Gesperrt</> : <><GameIcon name="swords" /> KAMPF STARTEN</>}
      </button>
    </main>
  );
}

// ---------- Result ----------

function TowerResult({ floor, view, test, reducedMotion, onNext, onAgain, onDeck, onTower }: {
  floor: TowerFloor; view: Extract<View, { k: 'result' }>; test: boolean; reducedMotion: boolean;
  onNext?: () => void; onAgain: () => void; onDeck: () => void; onTower: () => void;
}) {
  const { outcome, score, status, granted } = view;
  const won = outcome === 'win';
  const boss = floor.difficulty === 'boss';
  const coins = granted.reduce((n, g) => n + g.coins, 0);
  const reveal: RevealItem[] = status === 'paid' && coins > 0 ? [{ kind: 'coins', amount: coins, sources: granted.filter((g) => g.coins > 0).map((g) => `${g.source}: 🪙 ${g.coins}`) }] : [];
  const [revealOpen, setRevealOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (revealOpen === null && reveal.length > 0) setRevealOpen(true);
  }, [revealOpen, reveal.length]);
  const title = won ? (boss ? 'Wächter besiegt!' : 'Etage geschafft!') : outcome === 'draw' ? 'Unentschieden' : 'Niederlage';
  const text = won ? floor.opponent.winText : floor.opponent.loseText;
  return (
    <main className={`screen result tower-result result-${outcome}`}>
      {won && status !== 'rejected' && !reducedMotion && <Confetti count={boss ? 110 : 60} />}
      <div className="scroll result-body">
        <ResultIcon outcome={outcome} />
        <h1>{title}</h1>
        <p className="muted">Etage {floor.number} · {floor.name}</p>
        {text && <p className="boss-text">{text}</p>}
        <p className="result-score"><span className="blue">{score.player}</span> : <span className="red">{score.cpu}</span></p>
        <p className={`result-status status-${status}`} role="status">
          {status === 'checking' ? 'Ergebnis wird vom Server geprüft …'
            : status === 'paid' ? (test ? 'Geprüft (Testmodus – nichts gespeichert)' : won ? '✓ Geprüft – die nächste Etage ist offen.' : '✓ Geprüft')
              : status === 'pending' ? 'Keine Verbindung – das Ergebnis wird gewertet, sobald du wieder online bist (innerhalb von 24 Stunden).'
                : 'Das Ergebnis konnte nicht bestätigt werden – es zählt nicht.'}
        </p>
        {status === 'paid' && won && !test && floor.reward && coins === 0 && <p className="muted small">Die Belohnung dieser Etage hast du schon erhalten.</p>}
        {status === 'paid' && coins > 0 && (
          <div className="reward-box paid"><p><b>Gutgeschrieben</b></p><p><RewardIcon type="coins" /> {coins} Münzen</p></div>
        )}
        {!won && status !== 'checking' && <p className="small">Tipp: Stell dein Deck um oder wähle eine andere Rune – dann versuch es noch einmal.</p>}
      </div>
      {revealOpen && reveal.length > 0 && <RewardReveal items={reveal} reducedMotion={reducedMotion} guest={false} onClose={() => setRevealOpen(false)} />}
      <div className="menu-buttons">
        {revealOpen === false && reveal.length > 0 && <button type="button" className="btn btn-reward" onClick={() => setRevealOpen(true)}>🎁 Belohnung ansehen</button>}
        {won ? (
          <>
            {onNext && <button type="button" className="btn btn-primary btn-big" onClick={onNext}>▶ Nächste Etage</button>}
            <button type="button" className={`btn ${onNext ? '' : 'btn-primary'}`} onClick={onTower}>Zur Turmübersicht</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-big" onClick={onAgain}>↻ Erneut versuchen</button>
            <button type="button" className="btn" onClick={onDeck}><GameIcon name="deck" /> Deck bearbeiten</button>
            <button type="button" className="btn" onClick={onTower}>Zur Turmübersicht</button>
          </>
        )}
      </div>
    </main>
  );
}
