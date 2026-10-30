// Campaign for players: world selection → world map with stations → mission briefing → (run) → duel → stars.
// Guests keep their progress on this device and see rewards as a preview. Signed-in players get a ticket from the
// server before each mission; the server replays the duel, stores the stars and pays coins, cards and packs.
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
import { RUNES, RuneDef, findRune } from '../game/runes';
import { MissionLog, MissionTicket, handPicks, missionRngs } from '../game/verify';
import { RevealItem, RewardReveal, runeFacts } from '../components/RewardReveal';
import { GrantedReward } from '../game/campaignRewards';
import { finishMissionRemote, readPending, startMission as startMissionRemote, writePending } from '../game/adventureApi';
import type { CloudSave } from '../game/cloudSave';
import { RuneBadge, RuneMatchup } from '../components/RuneBadge';
import { Pick } from '../game/runner';
import {
  CampaignContent, ImageRef, KIND_LABEL, LEVEL_LABEL, Mission, MissionCard, Opponent, REWARD_ICON, RANK_LABEL, Reward, World, findArena,
  missionPool, rewardText, suggestHand, visibleWorlds, worldMissions,
} from '../game/campaign';
import { DuelStats, duelStats, goalProgress, goalText } from '../game/campaignGoals';
import {
  CampaignProgress, MissionResult, missionDone, missionUnlocked, nextMilestone, recordResult, starSlots, totalStars, worldLockText, worldPercent, worldStars,
  worldUnlocked,
} from '../game/campaignProgress';

/** Runes a mission unlocks with its first win. */
function missionRunes(missionId: string): RuneDef[] {
  return RUNES.filter((r) => r.status === 'active' && r.unlock.kind === 'mission' && r.unlock.missionId === missionId);
}

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
  /** Runes are released for this player (opponents bring theirs, rune rewards are shown). */
  runesOn?: boolean;
  /** Signed in: missions are checked by the server, which stores the result and pays the rewards. */
  account?: { uid: string; adopt: (c: CloudSave) => void } | null;
  onExit: () => void;
}

type CheckStatus = 'checking' | 'paid' | 'pending' | 'rejected';

type View =
  | { k: 'worlds' }
  | { k: 'world'; worldId: string }
  | { k: 'brief'; missionId: string }
  | { k: 'intro'; missionId: string; hand: MissionCard[] }
  | { k: 'runner'; missionId: string; runId: number; ticket?: MissionTicket }
  | { k: 'battle'; missionId: string; picks: Pick[]; stumbles: number | null; runId: number; ticket?: MissionTicket; run?: MissionLog['run'] }
  | {
    k: 'result'; missionId: string; outcome: Outcome; score: { player: number; cpu: number }; stats: DuelStats; result: MissionResult; starsBefore: number;
    runId: number; status?: CheckStatus; granted?: GrantedReward[];
  };

const KIND_ICON: Record<Mission['kind'], string> = { tutorial: '📖', normal: '⚔️', special: '✴️', elite: '💀', boss: '👑' };

export function Campaign({
  content, progress: saved, onProgress, deck, unlocked, reducedMotion, skin, preview, startMissionId, playerRune = null, runesOn = false, account = null, onExit,
}: Props) {
  const server = preview ? null : account;
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
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
        world={world} content={content} progress={progress} preview={!!preview} runesOn={runesOn}
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
  const begin = async (hand: MissionCard[]) => {
    const ids = hand.map((c) => c.cardId);
    let ticket: MissionTicket | undefined;
    if (server) {
      // Signed in: the server checks the start and hands out the seed (toss and opponent follow from it).
      if (starting) return;
      setStarting(true);
      const r = await startMissionRemote(mission.id, deck, mission.mode === 'runner' ? null : ids, playerRune);
      setStarting(false);
      if (r.kind !== 'ticket') {
        setView({ k: 'brief', missionId: mission.id });
        setNotice(r.kind === 'offline' ? 'Keine Verbindung – zum Starten einer Mission mit deinem Konto brauchst du kurz Internet.'
          : `Die Mission konnte nicht gestartet werden (${r.error === 'deck' ? 'Deck ungültig – bitte im Deck-Editor prüfen' : r.error === 'mission' ? 'Mission noch gesperrt' : r.error}).`);
        return;
      }
      ticket = r.ticket;
    }
    setNotice('');
    if (mission.mode === 'runner') setView({ k: 'runner', missionId: mission.id, runId: Date.now(), ticket });
    else setView({ k: 'battle', missionId: mission.id, picks: handPicks(ticket?.hand ?? ids), stumbles: null, runId: Date.now(), ticket });
  };

  if (view.k === 'brief') {
    return (
      <Briefing
        mission={mission} opponent={opponent} content={content} progress={progress} deck={deck} preview={!!preview} playerRune={playerRune} runesOn={runesOn}
        paid={!!server} notice={notice} starting={starting}
        onBack={() => { setNotice(''); back(); }}
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
        key={view.runId} deck={view.ticket?.deck ?? deck} unlocked={unlocked} reducedMotion={reducedMotion} skin={skin} ticket={view.ticket}
        onFinish={(picks, inputs, skippedAt) => setView({
          k: 'battle', missionId: mission.id, picks, stumbles: picks.filter((p) => p.mod < 0).length, runId: Date.now(), ticket: view.ticket, run: { inputs, skippedAt },
        })}
        onQuit={() => setView({ k: 'brief', missionId: mission.id })}
      />
    );
  }
  if (view.k === 'battle') {
    const { ticket, run, runId } = view;
    const finish = async (outcome: Outcome, score: { player: number; cpu: number }, _first: unknown, record: DuelRecord) => {
      const stats = duelStats(record.start, record.moves, view.stumbles);
      const starsBefore = worldStars(content, progress, mission.worldId, preview);
      const result = recordResult(progress, mission, stats);
      if (!server || !ticket) {
        save(result.progress);
        setView({ k: 'result', missionId: mission.id, outcome, score, stats, result, starsBefore, runId });
        return;
      }
      // Signed in: show the result at once (not saved yet), the server replays the duel, stores it and pays out.
      setView({ k: 'result', missionId: mission.id, outcome, score, stats, result, starsBefore, runId, status: 'checking' });
      const log: MissionLog = { run: run ?? null, duel: { first: record.start.turn, moves: record.moves } };
      const r = await finishMissionRemote(ticket.id, log);
      const update = (patch: Partial<Extract<View, { k: 'result' }>>) => setView((v) => (v.k === 'result' && v.runId === runId ? { ...v, ...patch } : v));
      if (r.kind === 'paid') {
        server.adopt(r.cloud);
        update({
          outcome: r.outcome, score: { player: r.score.player, cpu: r.score.cpu }, status: 'paid', granted: r.granted,
          result: { progress: r.cloud.campaign, met: r.met, newStars: r.newStars, firstWin: r.firstWin },
        });
      } else if (r.kind === 'offline') {
        writePending(server.uid, [...readPending(server.uid), { kind: 'mission', ticketId: ticket.id, log, at: new Date().toISOString() }]);
        update({ status: 'pending' });
      } else {
        if (r.cloud) server.adopt(r.cloud);
        update({ status: 'rejected' });
      }
    };
    return (
      <MissionBattle key={view.runId} mission={mission} opponent={opponent} picks={view.picks} unlocked={unlocked} reducedMotion={reducedMotion} playerRune={playerRune} runesOn={runesOn}
        ticket={ticket} onEnd={finish} onQuit={() => setView({ k: 'brief', missionId: mission.id })} />
    );
  }
  const list = worldMissions(content, mission.worldId, preview);
  const next = list[list.findIndex((m) => m.id === mission.id) + 1];
  return (
    <MissionResultView
      mission={mission} opponent={opponent} world={content.worlds.find((w) => w.id === mission.worldId) ?? null} content={content}
      progress={view.status ? view.result.progress : progress} preview={!!preview} runesOn={runesOn} view={view} reducedMotion={reducedMotion}
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

const PAID_TYPES = new Set<Reward['type']>(['coins', 'card', 'pack']);

/** One paid reward: "Waldpfad – erster Sieg: 🪙 100 · 🃏 Mooswolf". */
function GrantedLine({ g }: { g: GrantedReward }) {
  const parts = [
    g.coins ? `🪙 ${g.coins}` : '',
    ...g.cards.map((id) => `🃏 ${getCard(id).name} (neu)`),
    g.duplicates.length ? `${g.duplicates.length} doppelte Karte${g.duplicates.length === 1 ? '' : 'n'} → Münzen` : '',
  ].filter(Boolean);
  return <span className="reward-line">{g.source}: {parts.join(' · ') || '–'}</span>;
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

const PREVIEW_NOTE = 'Belohnungen sind eine Vorschau – mit einem Konto werden Münzen, Karten und Booster gutgeschrieben.';
const PAID_NOTE = 'Münzen, Karten und Booster werden deinem Konto gutgeschrieben. Illustrationen, Rahmen und Titel sind noch eine Vorschau.';

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

function WorldMap({ world, content, progress, preview, runesOn, onMission, onBack }: {
  world: World; content: CampaignContent; progress: CampaignProgress; preview: boolean; runesOn: boolean; onMission: (id: string) => void; onBack: () => void;
}) {
  /** What the first win of a mission brings (shown on the map): its runes, else its first-win reward. */
  const loot = (m: Mission) => {
    const runes = runesOn ? missionRunes(m.id) : [];
    return { runes, reward: m.firstReward };
  };
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
      {current && (() => {
        const l = loot(current);
        if (!l.runes.length && !l.reward) return null;
        return (
          <button type="button" className="next-loot" onClick={() => onMission(current.id)}>
            {l.runes[0] ? <RuneBadge rune={l.runes[0]} className="small" /> : <span className="tile-icon">{REWARD_ICON[l.reward!.type]}</span>}
            <span>
              <small>Nächste Mission: {current.name}</small>
              <b>Erster Sieg: {[...l.runes.map((r) => r.name), ...(l.reward ? [rewardText(l.reward)] : [])].join(' + ')}</b>
            </span>
            <span aria-hidden="true">▶</span>
          </button>
        );
      })()}
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
                aria-label={`${i + 1}. ${m.name}, ${KIND_LABEL[m.kind]}, ${done ? 'geschafft' : open ? 'verfügbar' : 'gesperrt'}${!done && (loot(m).runes[0] || loot(m).reward) ? `, erster Sieg: ${[...loot(m).runes.map((r) => r.name), ...(loot(m).reward ? [rewardText(loot(m).reward!)] : [])].join(' und ')}` : ''}`}
              >
                <span className="station-orb">
                  {state === 'locked' ? (
                    <span className="station-lock" aria-hidden="true">🔒</span>
                  ) : m.icon ? <CampaignImage img={m.icon} /> : <span className="station-icon">{KIND_ICON[m.kind]}</span>}
                  {done && <span className="station-check" aria-hidden="true">✓</span>}
                </span>
                {!done && (() => {
                  const l = loot(m);
                  if (l.runes[0]) return <span className="station-loot rune" title={`Erster Sieg: ${l.runes[0].name}`}><RuneBadge rune={l.runes[0]} className="tiny" /></span>;
                  if (l.reward) return <span className="station-loot" title={`Erster Sieg: ${rewardText(l.reward)}`} aria-hidden="true">{REWARD_ICON[l.reward.type]}</span>;
                  return null;
                })()}
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

function Briefing({ mission, opponent, content, progress, deck, preview, playerRune, runesOn, paid, notice, starting, onBack, onStart }: {
  mission: Mission; opponent: Opponent; content: CampaignContent; progress: CampaignProgress; deck: string[]; preview: boolean; playerRune: string | null; runesOn: boolean;
  paid: boolean; notice: string; starting: boolean; onBack: () => void; onStart: (hand: MissionCard[]) => void;
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

        <BriefRewards mission={mission} world={world ?? null} content={content} progress={progress} runesOn={runesOn} preview={preview} />

        <section className="brief-arena">
          <TerrainMini cells={arena.cells} />
          <div>
            <p><b>{arena.name}</b></p>
            <p className="muted small">{terrains.length > 0 ? terrains.map((t) => `${TERRAIN_INFO[t].icon} ${TERRAIN_INFO[t].label}`).join(' · ') : 'Keine Geländefelder'}</p>
            {runner && <p className="small">🏃 Erst laufen, dann mit den gesammelten Karten kämpfen.</p>}
            {mission.onlyClass && <p className="small">Nur {CLASS_INFO[mission.onlyClass].icon} {CLASS_INFO[mission.onlyClass].label}-Karten erlaubt.</p>}
          </div>
        </section>

        {runesOn && (
          <section className="brief-runes">
            <RuneMatchup player={playerRune} cpu={opponent.rune && findRune(opponent.rune) ? opponent.rune : null}
              note={playerRune ? 'Ändern unter „Deck bearbeiten“ → „Rune“.' : 'Du hast noch keine Rune – Runen spielst du in der Kampagne frei.'} />
          </section>
        )}

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
          {(mission.firstReward || mission.goalRewards.some(Boolean) || (world?.milestones.length ?? 0) > 0) && <p className="muted small">🎁 {paid ? PAID_NOTE : PREVIEW_NOTE}</p>}
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
      {notice && <p className="hint brief-notice" role="alert">{notice}</p>}
      <button type="button" className="btn btn-primary btn-big brief-start" disabled={starting || (!runner && (hand.length !== HAND_SIZE || choosing))} onClick={() => onStart(hand)}>
        {starting ? '☁️ Wird gestartet …' : mission.kind === 'boss' ? '👑 Zum Boss' : runner ? '🏃 Lauf starten' : '⚔️ Duell starten'}
      </button>
    </main>
  );
}

/** "What you can win" at the top of the briefing: rune, first-win reward, star rewards, next milestone. */
function BriefRewards({ mission, world, content, progress, runesOn, preview }: {
  mission: Mission; world: World | null; content: CampaignContent; progress: CampaignProgress; runesOn: boolean; preview: boolean;
}) {
  const done = missionDone(progress, mission.id);
  const slots = starSlots(progress, mission);
  const runes = runesOn ? missionRunes(mission.id) : [];
  const stars = world ? worldStars(content, progress, world.id, preview) : 0;
  const next = world ? nextMilestone(world, stars) : null;
  const starRewards = mission.goalRewards.map((r, i) => ({ r, i })).filter((x) => x.r && !slots[x.i]);
  if (!runes.length && !mission.firstReward && !starRewards.length && !next) return null;
  return (
    <section className="brief-rewards">
      <h2>🎁 Zu gewinnen</h2>
      {runes.map((r) => (
        <div key={r.id} className={`reward-tile rune-tile rarity-${r.rarity} ${done ? 'won' : ''}`}>
          <RuneBadge rune={r} className="big" />
          <div>
            <p className="tile-label">{done ? '✓ Freigespielt' : 'Erster Sieg schaltet frei'}</p>
            <p className="tile-name">{r.name}</p>
            <p className="small">{r.description}</p>
            <p className="muted small">{runeFacts(r).join(' ')}</p>
          </div>
        </div>
      ))}
      {mission.firstReward && (
        <div className={`reward-tile ${done ? 'won' : ''}`}>
          <span className="tile-icon">{REWARD_ICON[mission.firstReward.type]}</span>
          <div><p className="tile-label">{done ? '✓ Erhalten' : 'Erster Sieg'}</p><p className="tile-name">{rewardText(mission.firstReward)}</p></div>
        </div>
      )}
      {starRewards.map(({ r, i }) => (
        <div key={i} className="reward-tile">
          <span className="tile-icon">{REWARD_ICON[r!.type]}</span>
          <div><p className="tile-label">★ Stern {i + 1}: {mission.goals[i] ? goalText(mission.goals[i]) : ''}</p><p className="tile-name">{rewardText(r!)}</p></div>
        </div>
      ))}
      {next && world && (
        <div className="reward-tile milestone">
          <span className="tile-icon">{REWARD_ICON[next.reward.type]}</span>
          <div>
            <p className="tile-label">Welt-Meilenstein: {next.stars} ★ (du hast {stars})</p>
            <p className="tile-name">{world.milestones.filter((ms) => ms.stars === next.stars).map((ms) => rewardText(ms.reward)).join(' + ')}</p>
          </div>
        </div>
      )}
    </section>
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

function MissionBattle({ mission, opponent, picks, unlocked, reducedMotion, playerRune, runesOn, ticket, onEnd, onQuit }: {
  mission: Mission; opponent: Opponent; picks: Pick[]; unlocked: string[]; reducedMotion: boolean; playerRune: string | null; runesOn: boolean;
  ticket?: MissionTicket;
  onEnd: (outcome: Outcome, score: { player: number; cpu: number }, first: unknown, record: DuelRecord) => void; onQuit: () => void;
}) {
  const [setup] = useState<BattleSetup>(() => {
    // Checked by the server: coin toss and the opponent's moves follow from the ticket's seed, runes from the ticket.
    const seeded = ticket ? missionRngs(ticket.seed) : null;
    const rng = createRng();
    return {
      cpuHand: toHand(opponent.deck),
      first: null,
      rocks: [],
      arena: findArena(mission.arenaId) ?? CLASSIC_ARENA,
      label: `${KIND_ICON[mission.kind]} ${mission.name} · ${opponent.emoji} ${opponent.name}`,
      tossRng: seeded?.toss ?? rng,
      rng: seeded?.ai,
      finishLabel: 'Weiter',
      ai: { level: opponent.level, prefer: opponent.prefer },
      badgeText: '★',
      // The opponent brings its rune whenever runes are released – also against players who have none yet.
      runes: ticket ? { player: ticket.playerRune, cpu: ticket.cpuRune } : { player: playerRune, cpu: runesOn ? opponent.rune ?? null : null },
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

function MissionResultView({ mission, opponent, world, content, progress, preview, runesOn, view, reducedMotion, onAgain, onNext, onMap }: {
  mission: Mission; opponent: Opponent; world: World | null; content: CampaignContent; progress: CampaignProgress; preview: boolean; runesOn: boolean;
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
  // Runes this result unlocked: by the first win of this mission, or by crossing a star threshold.
  const totalNow = totalStars(content, progress);
  const totalBefore = totalNow - result.newStars.length;
  const newRunes = !runesOn || preview || view.status === 'rejected' ? [] : RUNES.filter((r) => r.status === 'active' && (
    (r.unlock.kind === 'mission' && r.unlock.missionId === mission.id && result.firstWin)
    || (r.unlock.kind === 'stars' && r.unlock.n > totalBefore && r.unlock.n <= totalNow)));
  const sourced: { reward: Reward; source: string }[] = [
    ...(result.firstWin && mission.firstReward ? [{ reward: mission.firstReward, source: `${mission.name} – erster Sieg` }] : []),
    ...result.newStars.flatMap((i) => (mission.goalRewards[i] ? [{ reward: mission.goalRewards[i]!, source: `${mission.name} – ${i + 1}. Stern` }] : [])),
    ...reached.map((ms) => ({ reward: ms.reward, source: `${world?.name ?? 'Welt'} – ${ms.stars} ★` })),
  ];
  const newRewards = sourced.map((x) => x.reward);
  // Paid rewards are listed as credited; the rest stays a preview. A refused result shows nothing.
  const previewRewards = view.status === 'rejected' ? [] : view.status === 'paid' ? newRewards.filter((r) => !PAID_TYPES.has(r.type)) : newRewards;
  // The big reveal: runes first, then what was credited (coins, cards), then rewards that are still a preview.
  const reveal: RevealItem[] = view.status === 'checking' || view.status === 'rejected' || view.status === 'pending' ? [] : [
    ...newRunes.map((rune): RevealItem => ({ kind: 'rune', rune })),
    ...(view.status === 'paid'
      ? [
        ...((view.granted ?? []).some((g) => g.coins > 0)
          ? [{ kind: 'coins', amount: (view.granted ?? []).reduce((n, g) => n + g.coins, 0), sources: (view.granted ?? []).filter((g) => g.coins > 0).map((g) => `${g.source}: 🪙 ${g.coins}${g.duplicates.length ? ' (inkl. doppelte Karten)' : ''}`) } as RevealItem]
          : []),
        ...(view.granted ?? []).flatMap((g) => g.cards.map((cardId): RevealItem => ({ kind: 'card', cardId, source: g.source }))),
        ...sourced.filter((x) => !PAID_TYPES.has(x.reward.type)).map((x): RevealItem => ({ kind: 'preview', ...x })),
      ]
      : sourced.map((x): RevealItem => ({ kind: 'preview', ...x }))),
  ];
  const [revealOpen, setRevealOpen] = useState<boolean | null>(null);
  // Opens by itself once, as soon as the result is final.
  useEffect(() => {
    if (revealOpen === null && reveal.length > 0) setRevealOpen(true);
  }, [revealOpen, reveal.length]);
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
        {view.status && (
          <p className={`result-status status-${view.status}`} role="status">
            {view.status === 'checking' ? '☁️ Ergebnis wird vom Server geprüft …'
              : view.status === 'paid' ? '✓ Geprüft und in deinem Konto gespeichert'
                : view.status === 'pending' ? '⏳ Keine Verbindung – Sterne und Belohnungen werden gutgeschrieben, sobald du wieder online bist (innerhalb von 24 Stunden).'
                  : '⚠️ Das Ergebnis konnte nicht bestätigt werden – es zählt nicht.'}
          </p>
        )}
        {view.status === 'paid' && (view.granted?.length ?? 0) > 0 && (
          <div className="reward-box paid">
            <p><b>Gutgeschrieben</b></p>
            {view.granted!.map((g) => <p key={g.key}><GrantedLine g={g} /></p>)}
          </div>
        )}
        {previewRewards.length > 0 && (
          <div className="reward-box">
            <p><b>Freigeschaltet</b></p>
            {previewRewards.map((r, i) => <p key={i}><RewardLine reward={r} /></p>)}
            <p className="muted small">🎁 {view.status ? PAID_NOTE : PREVIEW_NOTE}</p>
          </div>
        )}
        {newRunes.length > 0 && (
          <div className="reward-box rune-unlocked">
            <p><b>Neue Rune freigespielt!</b></p>
            {newRunes.map((r) => (
              <p key={r.id} className="rune-reward"><RuneBadge rune={r} className="big" /> <span><b>{r.name}</b><br /><span className="small">{r.description}</span></span></p>
            ))}
            <p className="muted small">Auswählen unter „Deck bearbeiten“ → „Rune“.</p>
          </div>
        )}
        {preview && <p className="test-banner">🧪 Testmodus – nichts wurde gespeichert</p>}
      </div>
      {revealOpen && reveal.length > 0 && (
        <RewardReveal items={reveal} reducedMotion={reducedMotion} guest={!view.status} onClose={() => setRevealOpen(false)} />
      )}
      <div className="menu-buttons">
        {revealOpen === false && reveal.length > 0 && <button type="button" className="btn btn-reward" onClick={() => setRevealOpen(true)}>🎁 Belohnungen ansehen</button>}
        {onNext && outcome === 'win' && <button type="button" className="btn btn-primary btn-big" onClick={onNext}>▶ Nächste Mission</button>}
        <button type="button" className={`btn ${onNext && outcome === 'win' ? '' : 'btn-primary'}`} onClick={onAgain}>↻ Nochmal</button>
        <button type="button" className="btn" onClick={onMap}>🗺️ Zur Karte</button>
      </div>
    </main>
  );
}
