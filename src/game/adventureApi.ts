// Phase 4: the game's side of checked adventures. A signed-in player gets a ticket before the run and sends
// the recorded run and duel afterwards; the server replays both and pays out. Results that could not be sent
// (no connection) wait on the device and are sent later – a ticket stays valid for 24 hours.
import { webBackend } from './cardStore';
import { AdventureLog, AdventureTicket } from './verify';
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

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('adventure', { body });
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

// ---------- Results waiting for a connection (per account, on this device) ----------

export interface PendingResult {
  ticketId: string;
  log: AdventureLog;
  at: string;
}

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
