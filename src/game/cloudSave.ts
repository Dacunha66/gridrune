// Phase 3: the signed-in player's progress lives in the account. The game keeps working with its normal save
// objects; this module loads them from the server, sends every change (through the server function
// "save-sync", which checks it) and keeps a copy on the device for quick starts and offline play.
import { webBackend } from './cardStore';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import { SaveData, sanitize } from './storage';

export interface CloudSave {
  version: number;
  save: SaveData;
  campaign: CampaignProgress;
}

export type SyncResult =
  /** Stored; `cloud` = what the server actually keeps (it only takes the player's choices, phase 4d). */
  | { kind: 'saved'; version: number; cloud: CloudSave | null }
  /** Another device saved in between: its (newer) save replaces this one. */
  | { kind: 'conflict'; cloud: CloudSave }
  /** The server refused the change (implausible jump): the stored save stays. */
  | { kind: 'rejected'; cloud: CloudSave | null; reason: string }
  | { kind: 'offline' };

const cacheKey = (uid: string) => `gridrune/account-save/${uid}`;

function toCloud(raw: { version: number; save: unknown; campaign: unknown }): CloudSave {
  return { version: raw.version, save: sanitize(raw.save), campaign: sanitizeProgress(raw.campaign) };
}

/** The account's save from the server; null = this account has none yet; 'offline' = server not reachable. */
export async function loadCloudSave(uid: string): Promise<CloudSave | null | 'offline'> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return 'offline';
  const { data, error } = await sb.from('player_saves').select('save, campaign, version').eq('player_id', uid).maybeSingle();
  if (error) return 'offline';
  return data ? toCloud(data as { version: number; save: unknown; campaign: unknown }) : null;
}

/** Sends the save. base = the version it was built on (null for the very first save of the account). */
export async function pushCloudSave(save: SaveData, campaign: CampaignProgress, base: number | null): Promise<SyncResult> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return { kind: 'offline' };
  const { data, error } = await sb.functions.invoke('save-sync', { body: { save, campaign, base } });
  let body = data as Record<string, unknown> | null;
  if (error) {
    const res = (error as { context?: Response }).context;
    body = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    if (!body) return { kind: 'offline' };
  }
  if (!body) return { kind: 'offline' };
  if (body.conflict) return { kind: 'conflict', cloud: toCloud(body as { version: number; save: unknown; campaign: unknown }) };
  if (body.error === 'implausible') {
    return { kind: 'rejected', reason: String(body.reason ?? ''), cloud: body.save ? toCloud(body as { version: number; save: unknown; campaign: unknown }) : null };
  }
  if (typeof body.version === 'number') {
    return { kind: 'saved', version: body.version, cloud: body.save ? toCloud(body as { version: number; save: unknown; campaign: unknown }) : null };
  }
  return { kind: 'offline' };
}

/** Copy on this device (per account, separate from the guest save). */
export function readCache(uid: string): (CloudSave & { dirty: boolean }) | null {
  try {
    const t = localStorage.getItem(cacheKey(uid));
    if (!t) return null;
    const r = JSON.parse(t) as { version: number; save: unknown; campaign: unknown; dirty?: boolean };
    return { ...toCloud(r), dirty: Boolean(r.dirty) };
  } catch {
    return null;
  }
}

export function writeCache(uid: string, c: CloudSave, dirty: boolean): void {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify({ ...c, dirty }));
  } catch {
    // Private mode: the server copy is still there.
  }
}
