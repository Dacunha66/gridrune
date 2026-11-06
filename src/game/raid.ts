// Weltboss-Raid: a time-limited global PvE event. Every player fights the same boss on their own in the normal
// 4×4 duel (8 own cards + an unlocked rune against the boss's 8 cards and AI); each finished, server-checked fight
// deals damage to the boss's shared life points. This file holds the rules that game, admin and server share:
// the raid configuration (an admin document in content_docs), the boss phase for given life points, the fight
// built from a frozen snapshot, the replay check, the damage formula and the rewards owed.
// Live numbers (life points, attempts, statistics, claimed rewards) live in the raid tables, written only by the
// server function "raid". Clan instances later: one more row per instance in raid_state (scope), same rules.
import { AiLevel, AI_LEVELS, chooseCpuMove, chooseCpuRune, drawCpuHand } from './ai';
import { Arena, ARENAS } from './arenas';
import { BattleState, HAND_SIZE, HandCard, Outcome, Side, coinToss, cpuChoosesFirst, createBattle, isGameOver, outcome, score, toHand } from './battle';
import { Action, applyAction, isRuneUse } from './runes';
import { ImageRef, Reward, findArena, parseImage, parseReward } from './campaign';
import { CARDS } from './cards';
import { CardClass, Terrain, isCardClass } from './effects';
import { deriveRng } from './league';
import { DuelLog, PlayedDuel, replayDuel } from './verify';
import { Rng } from './rng';

export const RAIDS_COLLECTION = 'raids';
export const RAID_ID_RE = /^raid\d{2,4}$/;
export const MAX_PHASES = 5;

export interface RaidPhase {
  name: string;
  /** Phase starts when the remaining life points fall below this share (percent). The first phase: 100. */
  threshold: number;
  arenaId: string;
  /** Exactly 8 different existing cards. */
  deck: string[];
  level: AiLevel;
  /** Classes the boss likes to play early (small preference, no extra strength). */
  prefer: CardClass[];
  /** Rune the boss brings (null = none). */
  rune: string | null;
  /** Optional special mechanic – shown as text; v1 has no rule changes (no hidden bonuses). */
  mechanic: string;
}

export interface RaidDamage {
  loss: number;
  draw: number;
  win: number;
  /** Win: extra damage for every own field above 8. */
  perField: number;
  /** Most damage one fight can deal. */
  max: number;
}

/** Personal reward for reaching this much total damage. */
export interface RaidMilestone { damage: number; reward: Reward }
/** Community reward when this share of the life points is gone (100 = boss defeated). */
export interface RaidGlobalReward { percent: number; reward: Reward }

export interface RaidConfig {
  id: string;
  /** Raised by the admin on every saved change of a published raid; fights keep the version they started with. */
  version: number;
  /** draft = only admins see it. */
  status: 'draft' | 'published';
  name: string;
  bossName: string;
  description: string;
  image: ImageRef | null;
  cls: CardClass | null;
  maxHp: number;
  /** ISO times. */
  startsAt: string;
  endsAt: string;
  /** Counted attacks per player and day (UTC). */
  dailyLimit: number;
  /** Minutes a started fight can be finished; afterwards it counts as a defeat. */
  resumeMinutes: number;
  phases: RaidPhase[];
  damage: RaidDamage;
  milestones: RaidMilestone[];
  globalRewards: RaidGlobalReward[];
  /** Community rewards only for players with at least this many finished attacks. */
  minAttacksForGlobal: number;
  updatedAt: string;
}

export const DEFAULT_DAMAGE: RaidDamage = { loss: 100, draw: 300, win: 500, perField: 100, max: 1200 };

// ---------- Parsing (admin documents are data: everything is checked and clamped) ----------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
};
const iso = (v: unknown, fallback: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback);
const CARD_RE = /^[a-z]\d{2,4}$/;

function parsePhase(raw: unknown, i: number): RaidPhase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const deck = [...new Set((Array.isArray(r.deck) ? r.deck : []).filter((c): c is string => typeof c === 'string' && CARD_RE.test(c)))].slice(0, HAND_SIZE);
  return {
    name: str(r.name, 40) || `Phase ${i + 1}`,
    threshold: i === 0 ? 100 : int(r.threshold, 1, 99, 50),
    arenaId: typeof r.arenaId === 'string' && /^a\d{2,4}$/.test(r.arenaId) ? r.arenaId : 'a01',
    deck,
    level: AI_LEVELS.includes(r.level as AiLevel) ? (r.level as AiLevel) : 'medium',
    prefer: (Array.isArray(r.prefer) ? r.prefer : []).filter(isCardClass).slice(0, 3),
    rune: typeof r.rune === 'string' && /^rn\d{2,4}$/.test(r.rune) ? r.rune : null,
    mechanic: str(r.mechanic, 200),
  };
}

export function parseRaid(id: string, raw: unknown): RaidConfig | null {
  if (!RAID_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 60);
  if (!name) return null;
  const d = (r.damage && typeof r.damage === 'object' ? r.damage : {}) as Record<string, unknown>;
  const phases = (Array.isArray(r.phases) ? r.phases : []).slice(0, MAX_PHASES).map(parsePhase).filter((p): p is RaidPhase => !!p);
  const now = new Date().toISOString();
  return {
    id,
    version: int(r.version, 1, 1_000_000, 1),
    status: r.status === 'draft' ? 'draft' : 'published',
    name,
    bossName: str(r.bossName, 40) || name,
    description: str(r.description, 600),
    image: parseImage(r.image),
    cls: isCardClass(r.cls) ? r.cls : null,
    maxHp: int(r.maxHp, 100, 100_000_000, 20000),
    startsAt: iso(r.startsAt, now),
    endsAt: iso(r.endsAt, new Date(Date.now() + 7 * 86400_000).toISOString()),
    dailyLimit: int(r.dailyLimit, 1, 50, 5),
    resumeMinutes: int(r.resumeMinutes, 5, 24 * 60, 30),
    phases,
    damage: {
      loss: int(d.loss, 0, 100000, DEFAULT_DAMAGE.loss),
      draw: int(d.draw, 0, 100000, DEFAULT_DAMAGE.draw),
      win: int(d.win, 0, 100000, DEFAULT_DAMAGE.win),
      perField: int(d.perField, 0, 100000, DEFAULT_DAMAGE.perField),
      max: int(d.max, 1, 1_000_000, DEFAULT_DAMAGE.max),
    },
    milestones: (Array.isArray(r.milestones) ? r.milestones : []).map((m) => {
      const x = (m ?? {}) as Record<string, unknown>;
      const reward = parseReward(x.reward);
      return reward ? { damage: int(x.damage, 1, 100_000_000, 1000), reward } : null;
    }).filter((m): m is RaidMilestone => !!m).sort((a, b) => a.damage - b.damage).slice(0, 30),
    globalRewards: (Array.isArray(r.globalRewards) ? r.globalRewards : []).map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      const reward = parseReward(x.reward);
      return reward ? { percent: int(x.percent, 1, 100, 100), reward } : null;
    }).filter((g): g is RaidGlobalReward => !!g).sort((a, b) => a.percent - b.percent).slice(0, 20),
    minAttacksForGlobal: int(r.minAttacksForGlobal, 0, 1000, 1),
    updatedAt: str(r.updatedAt, 40),
  };
}

export function raidToDoc(c: RaidConfig): Record<string, unknown> {
  const { id: _id, ...rest } = c;
  void _id;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

/** Problems that keep a raid from being published (empty = fine). */
export function raidProblems(c: RaidConfig, arenas: readonly Arena[] = ARENAS, cards: readonly { id: string }[] = CARDS): string[] {
  const out: string[] = [];
  const known = new Set(cards.map((x) => x.id));
  if (Date.parse(c.endsAt) <= Date.parse(c.startsAt)) out.push('Das Ende muss nach dem Start liegen.');
  if (c.phases.length === 0) out.push('Mindestens eine Phase ist nötig.');
  c.phases.forEach((p, i) => {
    const label = `Phase ${i + 1} („${p.name}“)`;
    if (p.deck.length !== HAND_SIZE) out.push(`${label}: Das Bossdeck braucht genau ${HAND_SIZE} verschiedene Karten (aktuell ${p.deck.length}).`);
    const missing = p.deck.filter((id) => !known.has(id));
    if (missing.length) out.push(`${label}: Karten nicht im Spiel: ${missing.join(', ')}.`);
    const arena = findArena(p.arenaId, arenas);
    if (!arena) out.push(`${label}: Arena ${p.arenaId} fehlt.`);
    if (i > 0 && p.threshold >= c.phases[i - 1].threshold) out.push(`${label}: Der Schwellenwert muss kleiner sein als in der Phase davor.`);
  });
  if (c.damage.max < c.damage.loss) out.push('Der Höchstschaden ist kleiner als der Schaden bei einer Niederlage.');
  return out;
}

// ---------- Phases, damage, status ----------

/** Phase for the remaining life points: the last phase whose threshold the life points have fallen below. */
export function phaseIndex(c: RaidConfig, currentHp: number): number {
  const pct = c.maxHp > 0 ? (Math.max(0, currentHp) / c.maxHp) * 100 : 0;
  let idx = 0;
  c.phases.forEach((p, i) => {
    if (i > 0 && pct < p.threshold) idx = i;
  });
  return idx;
}

/** Damage of one validated fight. `fields` = fields the player owns at the end. */
export function raidDamage(d: RaidDamage, result: Outcome, fields: number): number {
  const base = result === 'loss' ? d.loss : result === 'draw' ? d.draw : d.win + d.perField * Math.max(0, fields - HAND_SIZE);
  return Math.max(0, Math.min(d.max, base));
}

/** The day an attack counts for (UTC), e.g. "2026-11-03". */
export const raidDay = (at: Date = new Date()) => at.toISOString().slice(0, 10);

export type RaidPhaseOfLife = 'upcoming' | 'active' | 'defeated' | 'expired';

/** Whether new counted attacks may start (the live state also has paused / archived, see raid_state). */
export function raidOpen(c: RaidConfig, currentHp: number, now = Date.now()): RaidPhaseOfLife {
  if (currentHp <= 0) return 'defeated';
  if (now < Date.parse(c.startsAt)) return 'upcoming';
  if (now >= Date.parse(c.endsAt)) return 'expired';
  return 'active';
}

// ---------- The fight ----------

/** Everything a fight needs, frozen when it starts – later phase changes or admin edits do not touch it. */
export interface RaidSnapshot {
  raidId: string;
  version: number;
  phase: number;
  phaseName: string;
  bossName: string;
  arenaName: string;
  cells: Terrain[];
  deck: string[];
  level: AiLevel;
  prefer: CardClass[];
  bossRune: string | null;
  damage: RaidDamage;
}

export function raidSnapshot(c: RaidConfig, phase: number, arenas: readonly Arena[] = ARENAS): RaidSnapshot | null {
  const p = c.phases[phase];
  const arena = p ? findArena(p.arenaId, arenas) : null;
  if (!p || !arena || p.deck.length !== HAND_SIZE) return null;
  return {
    raidId: c.id, version: c.version, phase, phaseName: p.name, bossName: c.bossName, arenaName: arena.name, cells: [...arena.cells],
    deck: [...p.deck], level: p.level, prefer: [...p.prefer], bossRune: p.rune, damage: { ...c.damage },
  };
}

/** What the server hands out when a raid fight starts (kept to check the result). */
export interface RaidTicket {
  id: string;
  seed: string;
  /** The player's 8 cards (checked against the collection). */
  hand: string[];
  playerRune: string | null;
  snapshot: RaidSnapshot;
}

export interface RaidLog {
  duel: DuelLog;
}

export const raidRngs = (seed: string): { toss: Rng; ai: Rng } => ({ toss: deriveRng(seed, 'raid-toss'), ai: deriveRng(seed, 'raid-ai') });

/** Start position before the coin toss: the player's 8 cards against the boss deck on the phase's arena. */
export function raidStart(ticket: Pick<RaidTicket, 'hand' | 'playerRune' | 'snapshot'>): BattleState {
  const boss: HandCard[] = toHand(ticket.snapshot.deck);
  return createBattle(toHand(ticket.hand), boss, 'player', [], ticket.snapshot.cells, { player: ticket.playerRune, cpu: ticket.snapshot.bossRune });
}

export const raidAi = (s: RaidSnapshot) => ({ level: s.level, prefer: s.prefer });

export type RaidCheck =
  | { ok: true; outcome: Outcome; score: Record<Side, number>; fields: number; damage: number; duel: PlayedDuel }
  | { ok: false; error: string };

/** Replays the fight (coin toss and every boss move follow from the seed) and computes the damage. */
export function checkRaid(ticket: RaidTicket, log: RaidLog): RaidCheck {
  if (!log || !log.duel) return { ok: false, error: 'Kampf fehlt' };
  let start: BattleState;
  try {
    start = raidStart(ticket);
  } catch {
    return { ok: false, error: 'Kampf konnte nicht aufgebaut werden' };
  }
  const duel = replayDuel(start, log.duel, raidRngs(ticket.seed), raidAi(ticket.snapshot));
  if (!duel.ok) return duel;
  const res = outcome(duel.end);
  const sc = score(duel.end);
  return { ok: true, outcome: res, score: sc, fields: sc.player, damage: raidDamage(ticket.snapshot.damage, res, sc.player), duel: { begin: duel.begin, moves: log.duel.moves } };
}

/** A fight that was not finished in time counts as a defeat. */
export const expiredDamage = (s: RaidSnapshot) => raidDamage(s.damage, 'loss', 0);

// ---------- Rewards ----------

export interface RaidOwed {
  key: string;
  reward: Reward;
  source: string;
}

/** Personal milestones and community rewards the player has earned but not received yet. */
export function raidOwed(c: RaidConfig, stats: { totalDamage: number; attacks: number }, currentHp: number, claimed: readonly string[]): RaidOwed[] {
  const done = new Set(claimed);
  const out: RaidOwed[] = [];
  for (const m of c.milestones) {
    const key = `p:${m.damage}:${m.reward.type}`;
    if (stats.totalDamage >= m.damage && !done.has(key)) out.push({ key, reward: m.reward, source: `${c.name} – ${m.damage.toLocaleString('de-DE')} Schaden` });
  }
  const removed = c.maxHp > 0 ? ((c.maxHp - Math.max(0, currentHp)) / c.maxHp) * 100 : 0;
  if (stats.attacks >= Math.max(1, c.minAttacksForGlobal)) {
    for (const g of c.globalRewards) {
      const key = `g:${g.percent}:${g.reward.type}`;
      if (removed >= g.percent && !done.has(key)) {
        out.push({ key, reward: g.reward, source: `${c.name} – ${g.percent >= 100 ? 'Boss besiegt' : `${g.percent} % geschafft`}` });
      }
    }
  }
  return out;
}

// ---------- Admin: simulated participants (never stored) ----------

export interface RaidSimulation {
  participants: number;
  days: number;
  /** Outcome shares of the sample fights per phase. */
  phaseOdds: { win: number; draw: number; loss: number; avgDamage: number }[];
  /** Day on which the boss fell (null = survived the run time). */
  defeatedOnDay: number | null;
  /** Life points left after each day. */
  hpByDay: number[];
  /** Day each phase began (index = phase). */
  phaseStartDay: (number | null)[];
  averageDamagePerPlayer: number;
}

/**
 * Estimates a raid for N players who use every attack: a few real fights per phase (a computer player with 8 random
 * cards against the boss) give the odds, then the days are played out with those odds. Pure computation.
 */
export function simulateRaid(
  c: RaidConfig, participants: number, rng: Rng, samplesPerPhase = 12,
  fight: (snapshot: RaidSnapshot, rng: Rng) => { outcome: Outcome; fields: number },
  arenas: readonly Arena[] = ARENAS,
): RaidSimulation {
  const days = Math.max(1, Math.ceil((Date.parse(c.endsAt) - Date.parse(c.startsAt)) / 86400_000));
  const samples = c.phases.map((_, i) => {
    const snap = raidSnapshot(c, i, arenas);
    if (!snap) return [] as { outcome: Outcome; damage: number }[];
    return Array.from({ length: samplesPerPhase }, () => {
      const f = fight(snap, rng);
      return { outcome: f.outcome, damage: raidDamage(snap.damage, f.outcome, f.fields) };
    });
  });
  const phaseOdds = samples.map((list) => {
    const n = Math.max(1, list.length);
    const share = (o: Outcome) => list.filter((x) => x.outcome === o).length / n;
    return { win: share('win'), draw: share('draw'), loss: share('loss'), avgDamage: list.reduce((a, x) => a + x.damage, 0) / n };
  });
  let hp = c.maxHp;
  let total = 0;
  const hpByDay: number[] = [];
  const phaseStartDay: (number | null)[] = c.phases.map((_, i) => (i === 0 ? 1 : null));
  let defeatedOnDay: number | null = null;
  for (let day = 1; day <= days && hp > 0; day++) {
    for (let a = 0; a < c.dailyLimit * participants && hp > 0; a++) {
      const ph = phaseIndex(c, hp);
      if (phaseStartDay[ph] === null) phaseStartDay[ph] = day;
      const list = samples[ph];
      const dmg = list.length ? list[Math.floor(rng() * list.length)].damage : 0;
      total += dmg;
      hp = Math.max(0, hp - dmg);
    }
    hpByDay.push(hp);
    if (hp === 0) defeatedOnDay = day;
  }
  return { participants, days, phaseOdds, defeatedOnDay, hpByDay, phaseStartDay, averageDamagePerPlayer: Math.round(total / Math.max(1, participants)) };
}

/** A random hand for simulated players: 8 different cards, no mythic ones. */
export function randomRaidHand(rng: Rng): string[] {
  return drawCpuHand(rng).map((h) => h.cardId);
}

/** One fight of a simulated player (normal computer strength, 8 random cards, no rune) against the boss. */
export function aiRaidFight(snapshot: RaidSnapshot, rng: Rng): { outcome: Outcome; fields: number } {
  let state = raidStart({ hand: randomRaidHand(rng), playerRune: null, snapshot });
  const first: Side = coinToss(rng) === 'cpu' ? cpuChoosesFirst() : rng() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const boss = raidAi(snapshot);
  for (let guard = 0; guard < 100 && !isGameOver(state); guard++) {
    const opts = state.turn === 'cpu' ? boss : { level: 'medium' as AiLevel };
    const action = chooseCpuRune(state, rng, opts) ?? chooseCpuMove(state, rng, opts);
    state = applyAction(state, action);
  }
  return { outcome: outcome(state), fields: score(state).player };
}

/**
 * Continues a fight after reloading: replays the moves recorded on this device (the boss's moves follow from the
 * seed again) and returns the position and the boss's random source exactly where the fight stopped. null = the
 * record does not fit (then the fight starts from the beginning).
 */
export function resumeRaid(ticket: Pick<RaidTicket, 'hand' | 'playerRune' | 'snapshot' | 'seed'>, partial: DuelLog):
  { begin: BattleState; state: BattleState; moves: Action[]; ai: Rng; handOrigin: number[] } | null {
  if (!partial || (partial.first !== 'player' && partial.first !== 'cpu') || !Array.isArray(partial.moves)) return null;
  const rngs = raidRngs(ticket.seed);
  coinToss(rngs.toss);
  const begin: BattleState = { ...raidStart(ticket), turn: partial.first };
  const opts = raidAi(ticket.snapshot);
  let state = begin;
  let handOrigin = Array.from({ length: HAND_SIZE }, (_, i) => i);
  try {
    for (const recorded of partial.moves) {
      if (isGameOver(state)) return null;
      if (state.turn === 'cpu') {
        const action: Action = chooseCpuRune(state, rngs.ai, opts) ?? chooseCpuMove(state, rngs.ai, opts);
        if (JSON.stringify(action) !== JSON.stringify(recorded)) return null;
        state = applyAction(state, action);
      } else {
        state = applyAction(state, recorded);
        if (!isRuneUse(recorded)) handOrigin = handOrigin.filter((_, i) => i !== (recorded as { handIndex: number }).handIndex);
      }
    }
  } catch {
    return null;
  }
  return { begin, state, moves: [...partial.moves], ai: rngs.ai, handOrigin };
}
