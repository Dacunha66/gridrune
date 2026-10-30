// Phase 4: the game's side of checked adventures. A signed-in player gets a ticket before the run and sends
// the recorded run and duel afterwards; the server replays both and pays out. Results that could not be sent
// (no connection) wait on the device and are sent later – a ticket stays valid for 24 hours.
import { webBackend } from './cardStore';
import { AdventureLog, AdventureTicket, MissionLog, MissionTicket } from './verify';
import type { GrantedReward } from './campaignRewards';
import type { PackCard } from './shop';
import { CloudSave } from './cloudSave';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import { Reward } from './rewards';
import { Outcome, Side } from './battle';
import { sanitize } from './storage';

export type StartResult = { kind: 'ticket'; ticket: AdventureTicket } | { kind: 'offline' } | { kind: 'error'; error: string };
export type FinishResult =
  | { kind: 'paid'; outcome: Outcome; score: Record<Side, number>; reward: Reward; cloud: CloudSave }
  | { kind: 'rejected'; error: string; cloud: CloudSave | null }
  | { kind: 'offline' };

async function call(body: Record<string, unknown>, fn: 'adventure' | 'game' = 'adventure'): Promise<{ status: number; data: Record<string, unknown> | null } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (!error) return { status: 200, data: data as Record<string, unknown> };
  const res = (error as { context?: Response }).context;
  if (!res || typeof res.json !== 'function') return null;
  return { status: res.status, data: await res.json().catch(() => null) };
}

function cloudOf(d: Record<string, unknown>): CloudSave | null {
  return typeof d.version === 'number' && d.save
    ? { version: d.version, save: sanitize(d.save), campaign: sanitizeProgress(d.campaign as CampaignProgress) }
    : null;
}

export async function startAdventure(deck: string[], rune: string | null): Promise<StartResult> {
  const r = await call({ action: 'start', deck, rune });
  if (!r || !r.data) return { kind: 'offline' };
  if (r.data.ticket) return { kind: 'ticket', ticket: r.data.ticket as AdventureTicket };
  return { kind: 'error', error: String(r.data.error ?? 'unknown') };
}

export async function finishAdventureRemote(ticketId: string, log: AdventureLog): Promise<FinishResult> {
  const r = await call({ action: 'finish', ticketId, log });
  if (!r || !r.data || r.status >= 500) return { kind: 'offline' };
  const d = r.data;
  const cloud = cloudOf(d);
  if (d.ok === true && cloud) return { kind: 'paid', outcome: d.outcome as Outcome, score: d.score as Record<Side, number>, reward: d.reward as Reward, cloud };
  return { kind: 'rejected', error: String(d.error ?? 'unknown'), cloud };
}

// ---------- Campaign and shop (server function "game", phase 4b/4c) ----------

export type MissionStart = { kind: 'ticket'; ticket: MissionTicket } | { kind: 'offline' } | { kind: 'error'; error: string };
export type MissionFinish =
  | { kind: 'paid'; outcome: Outcome; score: Record<Side, number>; met: boolean[]; newStars: number[]; firstWin: boolean; granted: GrantedReward[]; cloud: CloudSave }
  | { kind: 'rejected'; error: string; cloud: CloudSave | null }
  | { kind: 'offline' };

export async function startMission(missionId: string, deck: string[], hand: string[] | null, rune: string | null): Promise<MissionStart> {
  const r = await call({ action: 'mission-start', missionId, deck, hand, rune }, 'game');
  if (!r || !r.data || r.status >= 500) return { kind: 'offline' };
  if (r.data.ticket) return { kind: 'ticket', ticket: r.data.ticket as MissionTicket };
  return { kind: 'error', error: String(r.data.error ?? 'unknown') };
}

export async function finishMissionRemote(ticketId: string, log: MissionLog): Promise<MissionFinish> {
  const r = await call({ action: 'mission-finish', ticketId, log }, 'game');
  if (!r || !r.data || r.status >= 500) return { kind: 'offline' };
  const d = r.data;
  const cloud = cloudOf(d);
  if (d.ok === true && cloud) {
    return {
      kind: 'paid', outcome: d.outcome as Outcome, score: d.score as Record<Side, number>, met: (d.met as boolean[]) ?? [], newStars: (d.newStars as number[]) ?? [],
      firstWin: !!d.firstWin, granted: (d.granted as GrantedReward[]) ?? [], cloud,
    };
  }
  return { kind: 'rejected', error: String(d.error ?? 'unknown'), cloud };
}

/** Pays campaign rewards earned earlier (e.g. stars from before rewards existed). null = nothing was owed. */
export async function claimCampaignRewards(): Promise<{ granted: GrantedReward[]; cloud: CloudSave } | null | 'offline'> {
  const r = await call({ action: 'claim' }, 'game');
  if (!r || !r.data || r.status >= 500) return 'offline';
  const cloud = cloudOf(r.data);
  const granted = (r.data.granted as GrantedReward[] | undefined) ?? [];
  return cloud && granted.length > 0 ? { granted, cloud } : null;
}

export type ShopReply<T = object> = ({ ok: true; cloud: CloudSave } & T) | { ok: false; reason: string; cloud?: CloudSave | null };

const shopError = (d: Record<string, unknown> | null | undefined) =>
  !d ? 'Keine Verbindung – zum Einkaufen brauchst du kurz Internet.' : typeof d.reason === 'string' ? d.reason : 'Der Kauf hat nicht geklappt. Bitte versuche es noch einmal.';

export async function buyPackRemote(packId: string): Promise<ShopReply<{ cards: PackCard[] }>> {
  const r = await call({ action: 'buy-pack', packId }, 'game');
  const cloud = r?.data ? cloudOf(r.data) : null;
  if (r?.data?.ok === true && cloud) return { ok: true, cloud, cards: r.data.cards as PackCard[] };
  return { ok: false, reason: shopError(r?.data), cloud };
}

export async function buySkinRemote(skinId: string): Promise<ShopReply> {
  const r = await call({ action: 'buy-skin', skinId }, 'game');
  const cloud = r?.data ? cloudOf(r.data) : null;
  if (r?.data?.ok === true && cloud) return { ok: true, cloud };
  return { ok: false, reason: shopError(r?.data), cloud };
}

// ---------- Results waiting for a connection (per account, on this device) ----------

export type PendingResult =
  | { kind?: 'adventure'; ticketId: string; log: AdventureLog; at: string }
  | { kind: 'mission'; ticketId: string; log: MissionLog; at: string };

const pendingKey = (uid: string) => `gridrune/pending-results/${uid}`;

export function readPending(uid: string): PendingResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pendingKey(uid)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.ticketId === 'string' && p.log) : [];
  } catch {
    return [];
  }
}

export function writePending(uid: string, list: PendingResult[]): void {
  try {
    if (list.length) localStorage.setItem(pendingKey(uid), JSON.stringify(list.slice(-20)));
    else localStorage.removeItem(pendingKey(uid));
  } catch {
    // Private mode: the result can only be sent while the page is open.
  }
}
