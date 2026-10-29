// Campaign for players: world selection → world map with stations → mission briefing → (run) → duel → stars.
// Progress stays on this device for now; rewards are shown as a preview until player accounts exist.
import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Confetti } from '../components/Effects';
import { DesignImage } from '../components/DesignArt';
import { Header } from './Header';
import { Battle, BattleSetup, DuelRecord } from './Battle';
import { Runner } from './Runner';
import { CLASSIC_ARENA } from '../game/arenas';
import { HAND_SIZE, Outcome, toHand } from '../game/battle';
import { getCard } from '../game/cards';
import { imageUrl } from '../game/catalog';
import { CLASS_INFO, TERRAIN_INFO, Terrain } from '../game/effects';
import { createRng } from '../game/rng';
import { Pick } from '../game/runner';
import {
  CampaignContent, ImageRef, KIND_LABEL, LEVEL_LABEL, Mission, MissionCard, Opponent, REWARD_ICON, RANK_LABEL, Reward, World, findArena,
  missionPool, rewardText, suggestHand, visibleWorlds, worldMissions,
} from '../game/campaign';
import { DuelStats, duelStats, goalProgress, goalText } from '../game/campaignGoals';
import {
  CampaignProgress, MissionResult, missionDone, missionUnlocked, nextMilestone, recordResult, starSlots, worldLockText, worldPercent, worldStars,
  worldUnlocked,
} from '../game/campaignProgress';

interface Props {
  content: CampaignContent;
  progress: CampaignProgress;
  onProgress: (p: CampaignProgress) => void;
  /** The player's deck (20 cards) – the cards for missions come from here. */
  deck: string[];
  unlocked: string[];
  reducedMotion: boolean;
  skin: [string, string, string];
  /** Admin test: drafts visible, everything open, nothing is saved. */
  preview?: boolean;
  /** Admin test: open this mission's briefing right away. */
  startMissionId?: string;
  /** Rune the player takes into missions (null = none / runes not released). */
  playerRune?: string | null;
  onExit: () => void;
}

type View =
  | { k: 'worlds' }
  | { k: 'world'; worldId: string }
  | { k: 'brief'; missionId: string }
  | { k: 'intro'; missionId: string; hand: MissionCard[] }
  | { k: 'runner'; missionId: string; runId: number }
  | { k: 'battle'; missionId: string; picks: Pick[]; stumbles: number | null; runId: number }
  | { k: 'result'; missionId: string; outcome: Outcome; score: { player: number; cpu: number }; stats: DuelStats; result: MissionResult; starsBefore: number };

const KIND_ICON: Record<Mission['kind'], string> = { tutorial: '📖', normal: '⚔️', special: '✴️', elite: '💀', boss: '👑' };

export function Campaign({ content, progress: saved, onProgress, deck, unlocked, reducedMotion, skin, preview, startMissionId, playerRune = null, onExit }: Props) {
  // In the admin test, progress lives only in memory.
  const [testProgress, setTestProgress] = useState<CampaignProgress>(saved);
  const progress = preview ? testProgress : saved;
  const save = (p: CampaignProgress) => (preview ? setTestProgress(p) : onProgress(p));
  const worlds = visibleWorlds(content, preview);
  const startMission = startMissionId ? content.missions.find((m) => m.id === startMissionId) : undefined;
  const [view, setView] = useState<View>(() =>
    startMission ? { k: 'brief', missionId: startMission.id } : worlds.length === 1 ? { k: 'world', worldId: worlds[0].id } : { k: 'worlds' },
  );
  const mission = 'missionId' in view ? content.missions.find((m) => m.id === view.missionId) ?? null : null;
  const opponent = mission ? content.opponents.find((o) => o.id === mission.opponentId) ?? null : null;
  const toWorld = (worldId: string) => setView(startMission ? { k: 'brief', missionId: startMission.id } : { k: 'world', worldId });

  if (view.k === 'worlds') {
    return <WorldList content={content} progress={progress} preview={!!preview} onOpen={(worldId) => setView({ k: 'world', worldId })} onBack={onExit} />;
  }
  if (view.k === 'world') {
    const world = content.worlds.find((w) => w.id === view.worldId);
    if (!world) return <WorldList content={content} progress={progress} preview={!!preview} onOpen={(worldId) => setView({ k: 'world', worldId })} onBack={onExit} />;
    return (
      <WorldMap
        world={world} content={content} progress={progress} preview={!!preview}
        onMission={(missionId) => setView({ k: 'brief', missionId })}
        onBack={() => (worlds.length > 1 ? setView({ k: 'worlds' }) : onExit())}
      />
    );
  }
  if (!mission || !opponent) {
    return (
      <main className="screen">
        <Header title="Kampagne" onBack={onExit} />
        <p className="muted">Diese Mission ist nicht vollständig (Gegner fehlt).</p>
      </main>
    );
  }
  const back = () => (startMission ? onExit() : toWorld(mission.worldId));
  const begin = (hand: MissionCard[]) => {
    if (mission.mode === 'runner') setView({ k: 'runner', missionId: mission.id, runId: Date.now() });
    else setView({ k: 'battle', missionId: mission.id, picks: hand.map((c, i) => ({ cardId: c.cardId, kind: 'deck', gate: i, mod: 0 })), stumbles: null, runId: Date.now() });
  };

  if (view.k === 'brief') {
    return (
      <Briefing
        mission={mission} opponent={opponent} content={content} progress={progress} deck={deck} preview={!!preview}
        onBack={back}
        onStart={(hand) => (opponent.intro ? setView({ k: 'intro', missionId: mission.id, hand }) : begin(hand))}
      />
    );
  }
  if (view.k === 'intro') {
    return <BossIntro opponent={opponent} mission={mission} reducedMotion={reducedMotion} onGo={() => begin(view.hand)} onBack={() => setView({ k: 'brief', missionId: mission.id })} />;
  }
  if (view.k === 'runner') {
    return (
      <Runner
        key={view.runId} deck={deck} unlocked={unlocked} reducedMotion={reducedMotion} skin={skin}
        onFinish={(picks) => setView({ k: 'battle', missionId: mission.id, picks, stumbles: picks.filter((p) => p.mod < 0).length, runId: Date.now() })}
        onQuit={() => setView({ k: 'brief', missionId: mission.id })}
      />
    );
  }
  if (view.k === 'battle') {
    const finish = (outcome: Outcome, score: { player: number; cpu: number }, _first: unknown, record: DuelRecord) => {
      const stats = duelStats(record.start, record.moves, view.stumbles);
      const starsBefore = worldStars(content, progress, mission.worldId, preview);
      const result = recordResult(progress, mission, stats);
      save(result.progress);
      setView({ k: 'result', missionId: mission.id, outcome, score, stats, result, starsBefore });
    };
    return (
      <MissionBattle key={view.runId} mission={mission} opponent={opponent} picks={view.picks} unlocked={unlocked} reducedMotion={reducedMotion} playerRune={playerRune}
        onEnd={finish} onQuit={() => setView({ k: 'brief', missionId: mission.id })} />
    );
  }
  const list = worldMissions(content, mission.worldId, preview);
  const next = list[list.findIndex((m) => m.id === mission.id) + 1];
  return (
    <MissionResultView
      mission={mission} opponent={opponent} world={content.worlds.find((w) => w.id === mission.worldId) ?? null} content={content}
      progress={progress} preview={!!preview} view={view} reducedMotion={reducedMotion}
      onAgain={() => setView({ k: 'brief', missionId: mission.id })}
      onNext={next && missionUnlocked(content, progress, next, preview) && !startMission ? () => setView({ k: 'brief', missionId: next.id }) : undefined}
      onMap={back}
    />
  );
}

// ---------- Small parts ----------

/** An uploaded campaign picture, positioned like in the editor. */
export function CampaignImage({ img, className = '' }: { img: ImageRef | null; className?: string }) {
  const src = img ? imageUrl(img.id) : undefined;
  if (!img || !src) return null;
  return <div className={`c-img ${className}`} aria-hidden="true"><DesignImage src={src} fit={img.fit} /></div>;
}

export function Stars({ earned, className = '', fresh = [] }: { earned: boolean[]; className?: string; fresh?: number[] }) {
  return (
    <span className={`stars ${className}`} aria-label={`${earned.filter(Boolean).length} von ${earned.length} Sternen`}>
      {earned.map((on, i) => (
        <span key={i} className={`star ${on ? 'on' : ''} ${fresh.includes(i) ? 'fresh' : ''}`} style={{ '--i': fresh.indexOf(i) } as CSSProperties}>★</span>
      ))}
    </span>
  );
}

export function TerrainMini({ cells }: { cells: readonly Terrain[] }) {
  return (
    <span className="terrain-mini" aria-hidden="true">
      {cells.map((t, i) => <i key={i} className={`tm-${t}`}>{TERRAIN_INFO[t].icon}</i>)}
    </span>
  );
}

function OpponentFace({ o, className = '' }: { o: Opponent; className?: string }) {
  return (
    <span className={`opp-face rank-${o.rank} ${className}`} aria-hidden="true">
      {o.avatar ? <CampaignImage img={o.avatar} /> : <span className="opp-emoji">{o.emoji}</span>}
    </span>
  );
}

function RewardLine({ reward, prefix }: { reward: Reward | null; prefix?: string }) {
  if (!reward) return null;
  return <span className="reward-line">{prefix}{REWARD_ICON[reward.type]} {rewardText(reward)}</span>;
}

function StarBar({ world, stars, max }: { world: World; stars: number; max: number }) {
  const next = nextMilestone(world, stars);
  return (
    <div className="star-bar">
      <div className="star-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={stars} aria-label={`${stars} von ${max} Sternen`}>
        <div className="star-bar-fill" style={{ width: `${max ? (stars / max) * 100 : 0}%` }} />
        {[...new Set(world.milestones.map((ms) => ms.stars))].map((n) => {
          const here = world.milestones.filter((ms) => ms.stars === n);
          return (
            <span key={n} className={`ms-tick ${stars >= n ? 'reached' : ''}`} style={{ left: `${Math.min(100, (n / Math.max(1, max)) * 100)}%` }} title={`${n} ★: ${here.map((ms) => rewardText(ms.reward)).join(' + ')}`}>
              {REWARD_ICON[here[0].reward.type]}
            </span>
          );
        })}
      </div>
      <p className="star-bar-text">
        <b>★ {stars}/{max}</b>
        {next ? <> · Nächster Meilenstein: {next.stars} ★ – {world.milestones.filter((ms) => ms.stars === next.stars).map((ms) => `${REWARD_ICON[ms.reward.type]} ${rewardText(ms.reward)}`).join(' + ')}</> : world.milestones.length > 0 ? ' · Alle Meilensteine erreicht!' : ''}
      </p>
    </div>
  );
}

const PREVIEW_NOTE = 'Belohnungen sind eine Vorschau – sie werden mit den Spielerkonten aktiviert.';

// ---------- World selection ----------

function WorldList({ content, progress, preview, onOpen, onBack }: { content: CampaignContent; progress: CampaignProgress; preview: boolean; onOpen: (id: string) => void; onBack: () => void }) {
  const worlds = visibleWorlds(content, preview);
  return (
    <main className="screen campaign">
      <Header title="Kampagne" onBack={onBack} />
      {preview && <p className="test-banner">🧪 Testmodus – zählt nicht für den Fortschritt</p>}
      <div className="scroll world-list">
        {worlds.length === 0 && <p className="muted">Noch keine Welt veröffentlicht.</p>}
        {worlds.map((w) => {
          const open = preview || worldUnlocked(content, progress, w);
          const stars = worldStars(content, progress, w.id, preview);
          const max = worldMissions(content, w.id, preview).reduce((n, m) => n + Math.min(3, m.goals.length), 0);
          return (
            <button key={w.id} type="button" className={`world-tile ${open ? '' : 'locked'}`} onClick={() => open && onOpen(w.id)} aria-disabled={!open}>
              <span className="world-tile-art">
                {w.tile ? <CampaignImage img={w.tile} /> : <span className="world-tile-fallback" aria-hidden="true">🌲🍄🌿</span>}
                {!open && <span className="lock-big" aria-hidden="true">🔒</span>}
                {w.status === 'draft' && <span className="status-pill status-draft">Entwurf</span>}
              </span>
              <span className="world-tile-body">
                <b className="world-name">{w.name}</b>
                <span className="world-desc">{w.description}</span>
                {open ? (
                  <span className="world-meta">★ {stars}/{max} · {worldPercent(content, progress, w.id, preview)} % geschafft</span>
                ) : (
                  <span className="world-meta">🔒 {worldLockText(content, w)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

// ---------- World map ----------

function WorldMap({ world, content, progress, preview, onMission, onBack }: {
  world: World; content: CampaignContent; progress: CampaignProgress; preview: boolean; onMission: (id: string) => void; onBack: () => void;
}) {
  const missions = worldMissions(content, world.id, preview);
  const stars = worldStars(content, progress, world.id, preview);
  const max = missions.reduce((n, m) => n + Math.min(3, m.goals.length), 0);
  const current = missions.find((m) => !missionDone(progress, m.id) && (preview || missionUnlocked(content, progress, m, preview)));
  const currentRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    try {
      currentRef.current?.scrollIntoView({ block: 'center' });
    } catch {
      /* old browsers */
    }
  }, []);
  const points = missions.map((m) => `${(m.pos.x * 100).toFixed(1)},${(m.pos.y * 100).toFixed(1)}`).join(' ');
  return (
    <main className="screen campaign world-screen">
      <Header title={world.name} onBack={onBack} right={<span className="pct">{worldPercent(content, progress, world.id, preview)} %</span>} />
      {preview && <p className="test-banner">🧪 Testmodus – alle Missionen offen, nichts wird gespeichert</p>}
      <StarBar world={world} stars={stars} max={max} />
      <div className="scroll map-scroll">
        <div className={`map-canvas ${world.map ? 'has-map' : ''}`}>
          {world.map && <CampaignImage img={world.map} className="map-bg" />}
          <svg className="map-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} />
          </svg>
          {missions.map((m, i) => {
            const done = missionDone(progress, m.id);
            const open = preview || missionUnlocked(content, progress, m, preview);
            const state = done ? 'done' : open ? 'open' : 'locked';
            return (
              <button
                key={m.id}
                ref={m === current ? currentRef : undefined}
                type="button"
                className={`station station-${state} kind-${m.kind} ${m === current ? 'current' : ''}`}
                style={{ left: `${m.pos.x * 100}%`, top: `${m.pos.y * 100}%` }}
                onClick={() => open && onMission(m.id)}
                aria-disabled={!open}
                aria-label={`${i + 1}. ${m.name}, ${KIND_LABEL[m.kind]}, ${done ? 'geschafft' : open ? 'verfügbar' : 'gesperrt'}`}
              >
                <span className="station-orb">
                  {state === 'locked' ? (
                    <span className="station-lock" aria-hidden="true">🔒</span>
                  ) : m.icon ? <CampaignImage img={m.icon} /> : <span className="station-icon">{KIND_ICON[m.kind]}</span>}
                  {done && <span className="station-check" aria-hidden="true">✓</span>}
                </span>
                <Stars earned={starSlots(progress, m)} className="station-stars" />
                <span className="station-name">{m.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ---------- Briefing ----------

function Briefing({ mission, opponent, content, progress, deck, preview, onBack, onStart }: {
  mission: Mission; opponent: Opponent; content: CampaignContent; progress: CampaignProgress; deck: string[]; preview: boolean;
  onBack: () => void; onStart: (hand: MissionCard[]) => void;
}) {
  const arena = findArena(mission.arenaId) ?? CLASSIC_ARENA;
  const slots = starSlots(progress, mission);
  const pool = useMemo(() => missionPool(mission, deck), [mission, deck]);
  const [hand, setHand] = useState<MissionCard[]>(() => suggestHand(mission, pool));
  const [choosing, setChoosing] = useState(false);
  const runner = mission.mode === 'runner';
  const toggle = (c: MissionCard) => {
    if (hand.includes(c)) setHand(hand.filter((h) => h !== c));
    else if (hand.length < HAND_SIZE) setHand([...hand, c]);
  };
  const terrains = [...new Set(arena.cells)].filter((t) => t !== 'normal');
  const world = content.worlds.find((w) => w.id === mission.worldId);
  return (
    <main className={`screen campaign briefing kind-${mission.kind}`}>
      <Header title={mission.name} onBack={onBack} right={<span className={`kind-pill kind-${mission.kind}`}>{KIND_LABEL[mission.kind]}</span>} />
      {preview && <p className="test-banner">🧪 Testmodus – zählt nicht für den Fortschritt</p>}
      <div className="scroll brief-body">
        <section className={`brief-opponent rank-${opponent.rank}`}>
          <OpponentFace o={opponent} />
          <div>
            <p className="opp-name">{opponent.name} {opponent.rank !== 'normal' && <span className={`kind-pill kind-${opponent.rank}`}>{RANK_LABEL[opponent.rank]}</span>}</p>
            <p className="muted small">KI: {LEVEL_LABEL[opponent.level]}{opponent.prefer.length > 0 && ` · mag ${opponent.prefer.map((c) => CLASS_INFO[c].icon).join(' ')}`}</p>
            <p className="small">{mission.description || opponent.description}</p>
          </div>
        </section>

        <section className="brief-arena">
          <TerrainMini cells={arena.cells} />
          <div>
            <p><b>{arena.name}</b></p>
            <p className="muted small">{terrains.length > 0 ? terrains.map((t) => `${TERRAIN_INFO[t].icon} ${TERRAIN_INFO[t].label}`).join(' · ') : 'Keine Geländefelder'}</p>
            {runner && <p className="small">🏃 Erst laufen, dann mit den gesammelten Karten kämpfen.</p>}
            {mission.onlyClass && <p className="small">Nur {CLASS_INFO[mission.onlyClass].icon} {CLASS_INFO[mission.onlyClass].label}-Karten erlaubt.</p>}
          </div>
        </section>

        <section className="brief-goals">
          <h2>Sterne-Ziele</h2>
          <ul>
            {mission.goals.map((g, i) => (
              <li key={g.id} className={slots[i] ? 'met' : ''}>
                <span className={`star ${slots[i] ? 'on' : ''}`} aria-hidden="true">★</span>
                <span className="goal-text">{goalText(g)}{slots[i] && <span className="sr-only"> (erreicht)</span>}</span>
                <RewardLine reward={mission.goalRewards[i]} />
              </li>
            ))}
          </ul>
          {mission.firstReward && <p className="small"><RewardLine reward={mission.firstReward} prefix="Erster Sieg: " /></p>}
          {(mission.firstReward || mission.goalRewards.some(Boolean) || (world?.milestones.length ?? 0) > 0) && <p className="muted small">🎁 {PREVIEW_NOTE}</p>}
        </section>

        {mission.tips.length > 0 && (
          <section className="brief-tips">
            <h2>So geht&apos;s</h2>
            <ol>{mission.tips.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
        )}

        {!runner && (
          <section className="brief-hand">
            <h2>Deine Karten <span className="muted small">{hand.length}/{HAND_SIZE}</span></h2>
            {!choosing ? (
              <>
                <div className="hand-grid">
                  {hand.map((c) => (
                    <div key={c.cardId} className="hand-pick">
                      <Card id={c.cardId} size="sm" />
                      {c.loan && <span className="loan-tag">Leihe</span>}
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-small" onClick={() => setChoosing(true)}>Karten ändern</button>
              </>
            ) : (
              <>
                <p className="muted small">Tippe Karten an, um sie zu wählen oder abzuwählen.{pool.some((c) => c.loan) && ' „Leihe“ = gewöhnliche Leihkarte nur für diese Mission.'}</p>
                <div className="hand-grid pool">
                  {pool.map((c) => (
                    <div key={c.cardId} className="hand-pick">
                      <Card id={c.cardId} size="sm" selected={hand.includes(c)} onClick={() => toggle(c)} ariaLabel={`${getCard(c.cardId).name}${c.loan ? ', Leihkarte' : ''}${hand.includes(c) ? ', gewählt' : ''}`} />
                      {c.loan && <span className="loan-tag">Leihe</span>}
                    </div>
                  ))}
                </div>
                <div className="row-buttons">
                  <button type="button" className="btn btn-small" onClick={() => setHand(suggestHand(mission, pool))}>Vorschlag</button>
                  <button type="button" className="btn btn-small" onClick={() => setChoosing(false)} disabled={hand.length !== HAND_SIZE}>Fertig</button>
                </div>
              </>
            )}
          </section>
        )}
        {runner && <p className="muted small">Hinweis: Fundkarten aus dem Lauf spielst du in diesem Duell mit – in deine Sammlung kommen sie in der Kampagne noch nicht.</p>}
      </div>
      <button type="button" className="btn btn-primary btn-big brief-start" disabled={!runner && (hand.length !== HAND_SIZE || choosing)} onClick={() => onStart(hand)}>
        {mission.kind === 'boss' ? '👑 Zum Boss' : runner ? '🏃 Lauf starten' : '⚔️ Duell starten'}
      </button>
    </main>
  );
}

// ---------- Boss ----------

function BossIntro({ opponent, mission, reducedMotion, onGo, onBack }: { opponent: Opponent; mission: Mission; reducedMotion: boolean; onGo: () => void; onBack: () => void }) {
  return (
    <main className={`screen boss-intro rank-${opponent.rank} ${reducedMotion ? 'still' : ''}`}>
      {opponent.background && <CampaignImage img={opponent.background} className="stage-bg" />}
      <div className="boss-stage">
        <p className="boss-kicker">{mission.kind === 'boss' ? 'Endboss' : RANK_LABEL[opponent.rank]}</p>
        <div className="boss-portrait">
          {opponent.portrait ? <CampaignImage img={opponent.portrait} /> : <span className="boss-emoji" aria-hidden="true">{opponent.emoji}</span>}
        </div>
        <h1 className="boss-name">{opponent.name}</h1>
        <p className="boss-text">{opponent.intro}</p>
        <div className="menu-buttons">
          <button type="button" className="btn btn-primary btn-big" onClick={onGo}>Kampf beginnen</button>
          <button type="button" className="btn" onClick={onBack}>Zurück</button>
        </div>
      </div>
    </main>
  );
}

function MissionBattle({ mission, opponent, picks, unlocked, reducedMotion, playerRune, onEnd, onQuit }: {
  mission: Mission; opponent: Opponent; picks: Pick[]; unlocked: string[]; reducedMotion: boolean; playerRune: string | null;
  onEnd: (outcome: Outcome, score: { player: number; cpu: number }, first: unknown, record: DuelRecord) => void; onQuit: () => void;
}) {
  const [setup] = useState<BattleSetup>(() => {
    const rng = createRng();
    return {
      cpuHand: toHand(opponent.deck),
      first: null,
      rocks: [],
      arena: findArena(mission.arenaId) ?? CLASSIC_ARENA,
      label: `${KIND_ICON[mission.kind]} ${mission.name} · ${opponent.emoji} ${opponent.name}`,
      tossRng: rng,
      finishLabel: 'Weiter',
      ai: { level: opponent.level, prefer: opponent.prefer },
      badgeText: '★',
      // The opponent brings its rune only while runes are in play for this player.
      runes: { player: playerRune, cpu: playerRune !== null ? opponent.rune ?? null : null },
    };
  });
  const boss = opponent.rank === 'boss';
  return (
    <div className={`campaign-stage ${boss ? 'boss' : ''}`}>
      {opponent.background && <CampaignImage img={opponent.background} className="stage-bg" />}
      <Battle picks={picks} unlocked={unlocked} reducedMotion={reducedMotion} setup={setup} onEnd={onEnd} onQuit={onQuit} />
    </div>
  );
}

// ---------- Result ----------

function MissionResultView({ mission, opponent, world, content, progress, preview, view, reducedMotion, onAgain, onNext, onMap }: {
  mission: Mission; opponent: Opponent; world: World | null; content: CampaignContent; progress: CampaignProgress; preview: boolean;
  view: Extract<View, { k: 'result' }>; reducedMotion: boolean; onAgain: () => void; onNext?: () => void; onMap: () => void;
}) {
  const { outcome, score, stats, result, starsBefore } = view;
  const slots = starSlots(progress, mission);
  const stars = world ? worldStars(content, progress, world.id, preview) : 0;
  const max = world ? worldMissions(content, world.id, preview).reduce((n, m) => n + Math.min(3, m.goals.length), 0) : 0;
  const reached = world ? world.milestones.filter((ms) => ms.stars > starsBefore && ms.stars <= stars) : [];
  const boss = opponent.rank === 'boss';
  const title = outcome === 'win' ? (boss ? 'Boss besiegt!' : 'Mission geschafft!') : outcome === 'draw' ? 'Unentschieden' : 'Niederlage';
  const text = boss ? (outcome === 'win' ? opponent.winText : opponent.loseText) : '';
  const newRewards = [
    ...(result.firstWin && mission.firstReward ? [mission.firstReward] : []),
    ...result.newStars.flatMap((i) => (mission.goalRewards[i] ? [mission.goalRewards[i]!] : [])),
    ...reached.map((ms) => ms.reward),
  ];
  return (
    <main className={`screen result campaign-result result-${outcome} ${boss ? 'boss-result' : ''}`}>
      {outcome === 'win' && !reducedMotion && <Confetti count={boss ? 110 : 60} />}
      {opponent.background && boss && <CampaignImage img={opponent.background} className="stage-bg" />}
      <div className="scroll result-body">
        {boss ? (
          <div className="boss-portrait small">{opponent.portrait ? <CampaignImage img={opponent.portrait} /> : <span className="boss-emoji" aria-hidden="true">{opponent.emoji}</span>}</div>
        ) : (
          <div className="result-icon" aria-hidden="true">{outcome === 'win' ? '🏆' : outcome === 'draw' ? '🤝' : '💀'}</div>
        )}
        <h1>{title}</h1>
        {text && <p className="boss-text">{text}</p>}
        <p className="result-score"><span className="blue">{score.player}</span> : <span className="red">{score.cpu}</span></p>
        <Stars earned={slots} fresh={result.newStars} className="result-stars" />
        {result.newStars.length > 0 && <p className="new-stars-text">+{result.newStars.length} neue{result.newStars.length === 1 ? 'r' : ''} Stern{result.newStars.length === 1 ? '' : 'e'}!</p>}
        <ul className="result-goals">
          {mission.goals.map((g, i) => (
            <li key={g.id} className={result.met[i] ? 'met' : slots[i] ? 'had' : ''}>
              <span aria-hidden="true">{result.met[i] ? '✅' : slots[i] ? '★' : '⬜'}</span>
              <span>{goalText(g)}</span>
              <span className="muted small">{goalProgress(g, stats)}</span>
            </li>
          ))}
        </ul>
        {world && <StarBar world={world} stars={stars} max={max} />}
        {newRewards.length > 0 && (
          <div className="reward-box">
            <p><b>Freigeschaltet</b></p>
            {newRewards.map((r, i) => <p key={i}><RewardLine reward={r} /></p>)}
            <p className="muted small">🎁 {PREVIEW_NOTE}</p>
          </div>
        )}
        {preview && <p className="test-banner">🧪 Testmodus – nichts wurde gespeichert</p>}
      </div>
      <div className="menu-buttons">
        {onNext && outcome === 'win' && <button type="button" className="btn btn-primary btn-big" onClick={onNext}>▶ Nächste Mission</button>}
        <button type="button" className={`btn ${onNext && outcome === 'win' ? '' : 'btn-primary'}`} onClick={onAgain}>↻ Nochmal</button>
        <button type="button" className="btn" onClick={onMap}>🗺️ Zur Karte</button>
      </div>
    </main>
  );
}
