// The game's side of Erfolge: calls the server function "quests". The server counts and pays; the game shows the
// board, collects rewards and lets the player choose a title.
import { webBackend } from './cardStore';
import { CloudSave } from './cloudSave';
import { sanitize } from './storage';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import type { QuestBoard, QuestGranted, Titles } from './quests';

export interface QuestOverview {
  board: QuestBoard;
  titles: Titles;
  /** Avatars the player may choose (start avatars and those of collected achievements). */
  avatars: string[];
}

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('quests', { body });
  if (!error) return { status: 200, data: data as Record<string, unknown> };
  const res = (error as { context?: Response }).context;
  if (!res || typeof res.json !== 'function') return null;
  return { status: res.status, data: await res.json().catch(() => null) };
}

const overviewOf = (d: Record<string, unknown>): QuestOverview | null =>
  d.board && d.titles ? { board: d.board as QuestBoard, titles: d.titles as Titles, avatars: Array.isArray(d.avatars) ? (d.avatars as string[]) : [] } : null;

export async function questOverview(): Promise<QuestOverview | 'offline'> {
  const r = await call({ action: 'overview' });
  if (!r || !r.data || r.status >= 500) return 'offline';
  return overviewOf(r.data) ?? 'offline';
}

export type ClaimReply =
  | { ok: true; granted: QuestGranted[]; cloud: CloudSave; overview: QuestOverview | null }
  | { ok: false; error: string };

/** Collects the given rewards (null = all that are ready). */
export async function claimQuestRewards(keys: string[] | null): Promise<ClaimReply> {
  const r = await call({ action: 'claim', keys });
  if (!r || !r.data || r.status >= 500) return { ok: false, error: 'Keine Verbindung – zum Abholen brauchst du kurz Internet.' };
  const d = r.data;
  if (d.ok === true && typeof d.version === 'number' && d.save) {
    return {
      ok: true,
      granted: (d.granted as QuestGranted[]) ?? [],
      cloud: { version: d.version, save: sanitize(d.save), campaign: sanitizeProgress(d.campaign as CampaignProgress) },
      overview: overviewOf(d),
    };
  }
  return { ok: false, error: 'Das Abholen hat nicht geklappt. Bitte versuche es noch einmal.' };
}

export async function equipAvatar(avatar: string): Promise<Titles | null> {
  const r = await call({ action: 'equip-avatar', avatar });
  return r?.data?.ok === true ? (r.data.titles as Titles) : null;
}

export async function equipTitle(title: string | null): Promise<Titles | null> {
  const r = await call({ action: 'equip-title', title });
  return r?.data?.ok === true ? (r.data.titles as Titles) : null;
}
