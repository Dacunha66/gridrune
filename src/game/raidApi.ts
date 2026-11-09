// The game's side of the Weltboss-Raid: calls the server function "raid". The server decides everything that
// counts (phase, damage, life points, limit, rewards); the game only plays the fight and sends the moves.
// A fight in progress is kept on this device, so reloading continues it instead of starting it again.
import { webBackend } from './cardStore';
import type { GrantedReward } from './campaignRewards';
import type { RaidDamage, RaidGlobalReward, RaidMilestone, RaidTicket } from './raid';
import type { ImageRef } from './campaign';
import type { CardClass } from './effects';
import type { DuelLog } from './verify';
import type { AiLevel } from './ai';

export type RaidStatus = 'upcoming' | 'active' | 'paused' | 'ended' | 'defeated' | 'expired';

export interface RaidInfo {
  id: string;
  name: string;
  bossName: string;
  description: string;
  image: ImageRef | null;
  cls: CardClass | null;
  startsAt: string;
  endsAt: string;
  dailyLimit: number;
  resumeMinutes: number;
  damage: RaidDamage;
  phases: { name: string; threshold: number; level: AiLevel; mechanic: string }[];
  milestones: RaidMilestone[];
  globalRewards: RaidGlobalReward[];
  minAttacksForGlobal: number;
  maxHp: number;
  currentHp: number;
  participants: number;
  attacks: number;
  phase: number;
  status: RaidStatus;
}

export interface RaidMe {
  attacksLeft: number;
  attacksToday: number;
  totalDamage: number;
  attacks: number;
  wins: number;
  draws: number;
  losses: number;
  best: number;
  rank: number | null;
  claimed: string[];
}

export type OpenTicket = RaidTicket & { expiresAt: string };

export interface RaidOverview {
  raid: RaidInfo | null;
  me?: RaidMe;
  open?: OpenTicket | null;
  granted?: GrantedReward[];
  nextReset?: string;
}

export interface RaidResult {
  outcome: 'win' | 'draw' | 'loss' | 'expired';
  fields: number;
  damage: number;
  applied: number;
  currentHp: number;
  maxHp: number;
  totalDamage: number;
  attacks: number;
  attacksLeft: number;
  rank: number | null;
  granted: GrantedReward[];
}

export interface LeaderRow { rank: number; name: string; me: boolean; attacks: number; totalDamage: number; average: number; avatar?: string | null }

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('raid', { body });
  if (!error) return { status: 200, data: data as Record<string, unknown> };
  const res = (error as { context?: Response }).context;
  if (!res || typeof res.json !== 'function') return null;
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function raidOverview(): Promise<RaidOverview | 'offline'> {
  const r = await call({ action: 'overview' });
  if (!r || !r.data || r.status >= 500) return 'offline';
  return r.data as unknown as RaidOverview;
}

export async function raidStartFight(raidId: string, hand: string[], rune: string | null): Promise<{ ticket: OpenTicket; resumed: boolean } | { error: string }> {
  const r = await call({ action: 'start', raidId, hand, rune });
  if (!r || !r.data || r.status >= 500) return { error: 'offline' };
  if (r.data.ticket) return { ticket: r.data.ticket as OpenTicket, resumed: !!r.data.resumed };
  return { error: String(r.data.error ?? 'unknown') };
}

export async function raidFinishFight(attemptId: string, log: { duel: DuelLog }): Promise<RaidResult | { error: string }> {
  const r = await call({ action: 'finish', attemptId, log });
  if (!r || !r.data || r.status >= 500) return { error: 'offline' };
  if (r.data.ok === true) return r.data as unknown as RaidResult;
  return { error: String(r.data.error ?? 'unknown') };
}

export async function raidLeaderboard(offset = 0): Promise<{ rows: LeaderRow[]; me: { rank: number; totalDamage: number; attacks: number } | null; participants: number } | 'offline'> {
  const r = await call({ action: 'leaderboard', offset, limit: 50 });
  if (!r || !r.data || r.status >= 500) return 'offline';
  return r.data as never;
}

// ---------- Admin ----------

export async function raidAdmin(action: 'admin-list' | 'admin-publish' | 'admin-status', body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const r = await call({ action, ...body });
  if (!r || !r.data) return { error: 'offline' };
  return r.data;
}

// ---------- The fight in progress, kept on this device ----------

const progressKey = (attemptId: string) => `gridrune/raid-fight/${attemptId}`;

export interface StoredFight { first: DuelLog['first']; moves: DuelLog['moves']; done: boolean }

export function readFight(attemptId: string): StoredFight | null {
  try {
    const raw = JSON.parse(localStorage.getItem(progressKey(attemptId)) ?? 'null');
    return raw && (raw.first === 'player' || raw.first === 'cpu') && Array.isArray(raw.moves) ? raw : null;
  } catch {
    return null;
  }
}

export function writeFight(attemptId: string, fight: StoredFight | null): void {
  try {
    if (fight) localStorage.setItem(progressKey(attemptId), JSON.stringify(fight));
    else localStorage.removeItem(progressKey(attemptId));
  } catch {
    // Private mode: the fight can only be continued while the page is open.
  }
}

export const raidErrorText = (e: string): string => ({
  offline: 'Keine Verbindung – für den Raid brauchst du Internet.',
  hand: 'Wähle 8 verschiedene Karten aus deiner Sammlung.',
  rune: 'Diese Rune hast du noch nicht freigespielt.',
  limit: 'Deine Angriffe für heute sind aufgebraucht. Morgen (ab 1 Uhr deutscher Zeit) geht es weiter.',
  defeated: 'Der Weltboss ist bereits besiegt.',
  expired: 'Der Raid ist vorbei.',
  upcoming: 'Der Raid hat noch nicht begonnen.',
  paused: 'Der Raid ist gerade pausiert.',
  ended: 'Der Raid wurde beendet.',
  closed: 'Der Raid ist gerade nicht offen.',
  busy: 'Einen Moment – bitte noch einmal versuchen.',
  no_raid: 'Gerade läuft kein Raid.',
  no_save: 'Dein Spielstand ist noch nicht im Konto gespeichert – bitte kurz warten.',
} as Record<string, string>)[e] ?? `Das hat nicht geklappt (${e}).`;
