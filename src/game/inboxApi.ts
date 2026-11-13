// The game's side of the Postfach: calls the server function "inbox" (list, collect, admin gifts).
import { webBackend } from './cardStore';
import { CloudSave } from './cloudSave';
import { sanitize } from './storage';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import type { Reward } from './campaign';
import type { GrantedReward } from './campaignRewards';

export interface InboxItem {
  id: string;
  sender: 'raid' | 'admin' | 'event';
  title: string;
  message: string;
  reward: Reward;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  result: GrantedReward | null;
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('inbox', { body });
  if (!error) return data as Record<string, unknown>;
  const res = (error as { context?: Response }).context;
  return res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
}

export async function inboxList(): Promise<InboxItem[] | null> {
  const d = await call({ action: 'list' });
  return d && Array.isArray(d.items) ? (d.items as InboxItem[]) : null;
}

/** Collects the given items (all open ones without ids): what each gave, the new list and the new save. */
export async function inboxClaim(ids?: string[]): Promise<{ results: Record<string, GrantedReward>; items: InboxItem[]; cloud: CloudSave | null } | null> {
  const d = await call({ action: 'claim', ...(ids ? { ids } : {}) });
  if (!d || d.ok !== true) return null;
  const cloud = typeof d.version === 'number' && d.save ? { version: d.version, save: sanitize(d.save), campaign: sanitizeProgress(d.campaign as CampaignProgress) } : null;
  return { results: (d.results as Record<string, GrantedReward>) ?? {}, items: (d.items as InboxItem[]) ?? [], cloud };
}

/** Deletes a collected message (open gifts cannot be deleted). The new list; null = did not work. */
export async function inboxDelete(id: string): Promise<InboxItem[] | null> {
  const d = await call({ action: 'delete', id });
  return d?.ok === true && Array.isArray(d.items) ? (d.items as InboxItem[]) : null;
}

/** Admin: a gift into the Postfach of one player (by name) or of everyone ("all"). */
export async function inboxSend(to: string, title: string, message: string, reward: Reward): Promise<{ ok: true; sent: number } | { ok: false; reason: string }> {
  const d = await call({ action: 'admin-send', to, title, message, reward });
  if (d?.ok === true) return { ok: true, sent: Number(d.sent) || 0 };
  return { ok: false, reason: typeof d?.reason === 'string' ? d.reason : 'Senden hat nicht geklappt.' };
}

/** Open items (for the number on the envelope). */
export const openCount = (items: readonly InboxItem[], now = Date.now()) => items.filter((i) => !i.claimedAt && Date.parse(i.expiresAt) > now).length;
