// Ranglisten-Ligen: 6 leagues with 3 steps each (18 steps). Every step needs 5 win points: a won match gives +1, a lost
// one −1; with 0 points a loss goes one step down. The first step of every league is a safepoint: there a loss at 0 points
// does not drop into the league below – 3 times per league and season, then the safepoint is used up for that league.
// A season lasts one calendar month (Berlin time). At its end the best league reached pays a reward into the Postfach,
// and the new season starts at the beginning of the league below the one the player was in. Reaching a league for the
// first time in a season also pays a reward. The computer gets stronger with the league (Bronze = "Leicht").
// Only for accounts: the server keeps the state (table "ladder") and applies every checked result exactly once.
import type { AiLevel } from './ai';
import { Reward, parseReward } from './campaign';

export const LADDER_DOC = 'ladder';
/** Seasons follow the German calendar month (like the daily quests). */
const SEASON_TIME_ZONE = 'Europe/Berlin';
export const LEAGUES = [
  { id: 'bronze', name: 'Bronze' },
  { id: 'silber', name: 'Silber' },
  { id: 'gold', name: 'Gold' },
  { id: 'platin', name: 'Platin' },
  { id: 'diamant', name: 'Diamant' },
  { id: 'runenmeister', name: 'Runenmeister' },
] as const;
export const STEPS_PER_LEAGUE = 3;
export const TOTAL_STEPS = LEAGUES.length * STEPS_PER_LEAGUE;
export const TOP_STEP = TOTAL_STEPS - 1;
export const WINS_PER_STEP = 5;
export const SAFE_USES = 3;
/** Online: opponents at most this many steps apart are paired. */
export const RANKED_RANGE = 3;
/** Online: seconds to look for a real opponent before the computer of the league steps in. */
export const RANKED_SEARCH_SECONDS = 20;
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface LadderConfig {
  /** The computer's strength per league (index = league). */
  levels: AiLevel[];
  /** Paid once per season when a league is reached (index = league; Bronze is the start, so it pays nothing). */
  promotion: Reward[][];
  /** Paid at the end of a season for the best league reached in it. */
  season: Reward[][];
}

const coins = (amount: number): Reward => ({ type: 'coins', amount });
const stones = (amount: number): Reward => ({ type: 'stones', amount });
const pack = (packId: string, amount = 1): Reward => ({ type: 'pack', packId, amount });

export const DEFAULT_LADDER: LadderConfig = {
  levels: ['easy', 'medium', 'hard', 'nightmare', 'nightmare', 'nightmare'],
  promotion: [
    [],
    [coins(300)],
    [coins(500), pack('abenteurer')],
    [coins(800), pack('helden')],
    [coins(1200), stones(10), pack('helden')],
    [coins(2000), stones(25), pack('helden', 2)],
  ],
  season: [
    [coins(100)],
    [coins(250)],
    [coins(400), pack('abenteurer')],
    [coins(600), pack('abenteurer', 2)],
    [coins(900), pack('helden')],
    [coins(1500), stones(15), pack('helden')],
  ],
};

const LEVELS: AiLevel[] = ['easy', 'medium', 'hard', 'nightmare'];
export const MAX_LADDER_REWARDS = 4;

/** Only rewards the Postfach can pay: coins, Runensteine, packs (1–10), a card. */
function ladderReward(raw: unknown): Reward | null {
  const r = parseReward(raw);
  if (!r) return null;
  if (r.type === 'coins' || r.type === 'stones') return r.amount && r.amount > 0 ? { type: r.type, amount: Math.min(100_000, Math.round(r.amount)) } : null;
  if (r.type === 'pack') return { type: 'pack', packId: r.packId ?? 'abenteurer', amount: Math.min(10, Math.max(1, Math.round(r.amount ?? 1))) };
  if (r.type === 'card') return r.cardId ? { type: 'card', cardId: r.cardId } : null;
  return null;
}

function rewardLists(raw: unknown, fallback: Reward[][]): Reward[][] {
  const list = Array.isArray(raw) ? raw : null;
  return fallback.map((d, i) => {
    if (!list || !Array.isArray(list[i])) return d.map((r) => ({ ...r }));
    return (list[i] as unknown[]).map(ladderReward).filter((r): r is Reward => !!r).slice(0, MAX_LADDER_REWARDS);
  });
}

export function parseLadderConfig(raw: unknown): LadderConfig {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const levels = Array.isArray(r.levels) ? r.levels : [];
  return {
    levels: DEFAULT_LADDER.levels.map((d, i) => (LEVELS.includes(levels[i] as AiLevel) ? levels[i] as AiLevel : d)),
    promotion: rewardLists(r.promotion, DEFAULT_LADDER.promotion),
    season: rewardLists(r.season, DEFAULT_LADDER.season),
  };
}

let CONFIG: LadderConfig = DEFAULT_LADDER;
export const ladderConfig = () => CONFIG;
export function setLadderConfig(c: LadderConfig): void {
  CONFIG = c;
}

// ---------- Steps and names ----------

export const leagueOf = (step: number): number => Math.floor(clampStep(step) / STEPS_PER_LEAGUE);
export const leagueStart = (league: number): number => Math.max(0, Math.min(LEAGUES.length - 1, league)) * STEPS_PER_LEAGUE;
export const isSafepoint = (step: number): boolean => clampStep(step) % STEPS_PER_LEAGUE === 0;
export const leagueName = (league: number): string => LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, league))].name;
/** "Silber II" */
export const stepName = (step: number): string => `${leagueName(leagueOf(step))} ${ROMAN[clampStep(step) % STEPS_PER_LEAGUE]}`;
export const stepRoman = (step: number): string => ROMAN[clampStep(step) % STEPS_PER_LEAGUE];
function clampStep(step: number): number {
  return Number.isFinite(step) ? Math.max(0, Math.min(TOP_STEP, Math.floor(step))) : 0;
}

/** The computer's strength for a step. */
export const ladderLevel = (step: number, c: LadderConfig = CONFIG): AiLevel => c.levels[leagueOf(step)] ?? 'hard';

// ---------- Season ----------

/** The season of a moment: the Berlin month, e.g. "2026-11". */
export function seasonOf(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SEASON_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}`;
}

/** "November 2026" */
export function seasonName(season: string): string {
  const [y, m] = season.split('-').map(Number);
  if (!y || !m) return season;
  const names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${names[m - 1] ?? ''} ${y}`;
}

/** Milliseconds until the next season starts (midnight Berlin on the 1st of next month). */
export function seasonEndsIn(now: Date = new Date()): number {
  const cur = seasonOf(now);
  // Walk forward in hour steps from a safe lower bound (the 28th): finds the first hour of the next Berlin month.
  const [y, m] = cur.split('-').map(Number);
  let t = Date.UTC(y, m - 1, 28) - 3 * 3600_000;
  t = Math.max(t, now.getTime());
  t = Math.ceil(t / 3600_000) * 3600_000;
  for (let i = 0; i < 24 * 6; i++, t += 3600_000) {
    if (seasonOf(new Date(t)) !== cur) return Math.max(0, t - now.getTime());
  }
  return 0;
}

// ---------- The player's state ----------

export interface LadderState {
  season: string;
  step: number;
  /** Win points on this step (0–5; 5 only on the top step). */
  points: number;
  /** Safepoints used per league this season. */
  safeUsed: number[];
  /** Highest step reached this season. */
  best: number;
  /** Leagues whose promotion reward was paid this season (the starting league counts as paid). */
  promoted: number[];
  /** Matches and wins this season. */
  games: number;
  wins: number;
}

export function freshLadder(season: string, step = 0): LadderState {
  const s = clampStep(step);
  return {
    season, step: s, points: 0, safeUsed: LEAGUES.map(() => 0), best: s,
    promoted: Array.from({ length: leagueOf(s) + 1 }, (_, i) => i), games: 0, wins: 0,
  };
}

const int = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);

export function parseLadderState(raw: unknown, season: string): LadderState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  if (!r || typeof r.season !== 'string' || !/^\d{4}-\d{2}$/.test(r.season)) return freshLadder(season);
  const step = int(r.step, 0, TOP_STEP, 0);
  const used = Array.isArray(r.safeUsed) ? r.safeUsed : [];
  const promoted = Array.isArray(r.promoted) ? r.promoted.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < LEAGUES.length) : [];
  return {
    season: r.season,
    step,
    points: int(r.points, 0, step === TOP_STEP ? WINS_PER_STEP : WINS_PER_STEP - 1, 0),
    safeUsed: LEAGUES.map((_, i) => int(used[i], 0, SAFE_USES, 0)),
    best: Math.max(step, int(r.best, 0, TOP_STEP, step)),
    promoted: [...new Set([...promoted, ...Array.from({ length: leagueOf(step) + 1 }, (_, i) => i)])].sort((a, b) => a - b),
    games: int(r.games, 0, 1e9, 0),
    wins: int(r.wins, 0, 1e9, 0),
  };
}

export interface PostfachGift {
  /** Unique per player: the same gift is never sent twice. */
  key: string;
  title: string;
  message: string;
  reward: Reward;
}

export interface SeasonChange {
  state: LadderState;
  /** The season that just ended (null = still the same season). */
  ended: { season: string; league: number } | null;
  gifts: PostfachGift[];
}

/** A new month: the reward for the best league of the old season, then the start one league lower. */
export function rollSeason(state: LadderState, now: Date = new Date(), c: LadderConfig = CONFIG): SeasonChange {
  const season = seasonOf(now);
  if (state.season === season) return { state, ended: null, gifts: [] };
  const league = leagueOf(state.best);
  const gifts = (c.season[league] ?? []).map((reward, i) => ({
    key: `season:${state.season}:${i}`,
    title: `Saison ${seasonName(state.season)}`,
    message: `Saisonende: Du hast ${leagueName(league)} erreicht. Die neue Saison beginnt!`,
    reward,
  }));
  const start = leagueStart(leagueOf(state.step) - 1);
  return { state: freshLadder(season, start), ended: { season: state.season, league }, gifts };
}

export type LadderMove = 'point' | 'up' | 'top' | 'minus' | 'safe' | 'down' | 'none';

export interface LadderStep {
  before: LadderState;
  state: LadderState;
  move: LadderMove;
  /** A league reached for the first time this season. */
  promoted: number | null;
  gifts: PostfachGift[];
}

/** The result of one ranked match. */
export function ladderResult(before: LadderState, result: 'win' | 'loss' | 'draw', c: LadderConfig = CONFIG): LadderStep {
  const s: LadderState = { ...before, safeUsed: [...before.safeUsed], promoted: [...before.promoted], games: before.games + 1, wins: before.wins + (result === 'win' ? 1 : 0) };
  let move: LadderMove = 'none';
  let promoted: number | null = null;
  if (result === 'win') {
    if (s.step === TOP_STEP) {
      s.points = Math.min(WINS_PER_STEP, s.points + 1);
      move = s.points >= WINS_PER_STEP ? 'top' : 'point';
    } else if (s.points + 1 >= WINS_PER_STEP) {
      s.step += 1;
      s.points = 0;
      move = 'up';
      const league = leagueOf(s.step);
      if (isSafepoint(s.step) && !s.promoted.includes(league)) {
        s.promoted = [...s.promoted, league].sort((a, b) => a - b);
        promoted = league;
      }
    } else {
      s.points += 1;
      move = 'point';
    }
    s.best = Math.max(s.best, s.step);
  } else if (result === 'loss') {
    if (s.points > 0) {
      s.points = s.step === TOP_STEP ? Math.min(s.points, WINS_PER_STEP) - 1 : s.points - 1;
      move = 'minus';
    } else if (s.step === 0) {
      move = 'none';
    } else if (isSafepoint(s.step) && s.safeUsed[leagueOf(s.step)] < SAFE_USES) {
      s.safeUsed[leagueOf(s.step)] += 1;
      move = 'safe';
    } else {
      s.step -= 1;
      s.points = WINS_PER_STEP - 1;
      move = 'down';
    }
  }
  const gifts = promoted === null ? [] : (c.promotion[promoted] ?? []).map((reward, i) => ({
    key: `promo:${s.season}:${promoted}:${i}`,
    title: `Aufstieg: ${leagueName(promoted!)}`,
    message: `Glückwunsch! Du hast in dieser Saison ${leagueName(promoted!)} erreicht.`,
    reward,
  }));
  return { before, state: s, move, promoted, gifts };
}

/** Safepoints left in the league of a step. */
export const safeLeft = (s: LadderState, step = s.step): number => Math.max(0, SAFE_USES - (s.safeUsed[leagueOf(step)] ?? 0));

/** Short line about the last move (for the result screen). */
export function moveText(m: LadderStep): string {
  const name = stepName(m.state.step);
  switch (m.move) {
    case 'up': return m.promoted !== null ? `Aufstieg in eine neue Liga: ${name}!` : `Aufstieg: ${name}!`;
    case 'top': return 'Höchste Stufe – du bist ganz oben!';
    case 'point': return `+1 Siegpunkt (${m.state.points}/${WINS_PER_STEP})`;
    case 'minus': return `−1 Siegpunkt (${m.state.points}/${WINS_PER_STEP})`;
    case 'safe': return `Safepoint hält: Du bleibst in ${name} (noch ${safeLeft(m.state)} von ${SAFE_USES}).`;
    case 'down': return `Abstieg: ${name}`;
    default: return 'Keine Änderung';
  }
}
