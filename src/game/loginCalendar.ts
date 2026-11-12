// Login-Kalender: one reward per day a player logs in, 7 fields, then it starts again at day 1. A missed day does not
// reset anything – the calendar simply continues with the next field. Only for accounts: the server keeps how many
// days were collected and the last day (Berlin), and pays the reward (settings document "login", written by the admin).
import { Reward, parseReward } from './campaign';
import { questDay } from './quests';

export const LOGIN_DOC = 'login';
export const LOGIN_DAYS = 7;

export interface LoginConfig {
  enabled: boolean;
  /** Exactly 7 rewards, day 1 to day 7. */
  rewards: Reward[];
}

export const DEFAULT_LOGIN: LoginConfig = {
  enabled: true,
  rewards: [
    { type: 'coins', amount: 50 },
    { type: 'coins', amount: 75 },
    { type: 'stones', amount: 5 },
    { type: 'coins', amount: 100 },
    { type: 'pack', packId: 'abenteurer', amount: 1 },
    { type: 'coins', amount: 150 },
    { type: 'pack', packId: 'helden', amount: 1 },
  ],
};

/** Only rewards the calendar can pay: coins, Runensteine, a pack (1–10) or a card. Anything else → the default of that day. */
function loginReward(raw: unknown, fallback: Reward): Reward {
  const r = parseReward(raw);
  if (!r) return fallback;
  if (r.type === 'coins' || r.type === 'stones') return r.amount && r.amount > 0 ? { type: r.type, amount: Math.min(100_000, Math.round(r.amount)) } : fallback;
  if (r.type === 'pack') return { type: 'pack', packId: r.packId, amount: Math.min(10, Math.max(1, Math.round(r.amount ?? 1))) };
  if (r.type === 'card') return r.cardId ? { type: 'card', cardId: r.cardId } : fallback;
  return fallback;
}

export function parseLoginConfig(raw: unknown): LoginConfig {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const list = Array.isArray(r.rewards) ? r.rewards : [];
  return {
    enabled: r.enabled !== false,
    rewards: DEFAULT_LOGIN.rewards.map((d, i) => loginReward(list[i], d)),
  };
}

let CONFIG: LoginConfig = DEFAULT_LOGIN;
export const loginConfig = () => CONFIG;
export function setLoginConfig(c: LoginConfig): void {
  CONFIG = c;
}

/** What the server stores per player: days collected so far (all time) and the last day collected. */
export interface LoginState {
  claimed: number;
  lastDay: string | null;
}

export function parseLoginState(raw: unknown): LoginState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const claimed = typeof r.claimed === 'number' && Number.isFinite(r.claimed) ? Math.max(0, Math.floor(r.claimed)) : 0;
  const lastDay = typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : null;
  return { claimed, lastDay };
}

export type LoginField = 'done' | 'today' | 'open';

export interface LoginView {
  enabled: boolean;
  /** Something to collect today. */
  canClaim: boolean;
  /** Field of today (0–6): the one to collect, or the one collected today. */
  index: number;
  fields: { day: number; reward: Reward; state: LoginField }[];
}

/** The calendar as the player sees it today. */
export function loginView(stateRaw: LoginState, config: LoginConfig, now: Date = new Date()): LoginView {
  const s = parseLoginState(stateRaw);
  const canClaim = config.enabled && s.lastDay !== questDay(now);
  // Collected today: the field just collected stays visible (also day 7) until tomorrow.
  const index = canClaim ? s.claimed % LOGIN_DAYS : (Math.max(1, s.claimed) - 1) % LOGIN_DAYS;
  const fields = config.rewards.map((reward, i) => ({
    day: i + 1,
    reward,
    state: (i < index ? 'done' : i === index ? (canClaim ? 'today' : 'done') : 'open') as LoginField,
  }));
  return { enabled: config.enabled, canClaim, index, fields };
}

/** Collecting today: the reward and the new state; null = nothing to collect (already today, or switched off). */
export function loginClaim(stateRaw: LoginState, config: LoginConfig, now: Date = new Date()): { reward: Reward; day: number; state: LoginState } | null {
  const s = parseLoginState(stateRaw);
  const today = questDay(now);
  if (!config.enabled || s.lastDay === today) return null;
  const index = s.claimed % LOGIN_DAYS;
  return { reward: config.rewards[index], day: index + 1, state: { claimed: s.claimed + 1, lastDay: today } };
}
