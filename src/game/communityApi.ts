// The game's side of the community: calls the server function "community" (every change), reads chat history directly
// (RLS: global chat for signed-in players, clan chat for members) and listens for new messages (Realtime).
import { webBackend } from './cardStore';
import { CloudSave } from './cloudSave';
import { sanitize } from './storage';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import type { JoinMode } from '../../supabase/functions/community/logic';

export type ClanRole = 'leader' | 'officer' | 'member';

export interface ClanInfo {
  id: string;
  name: string;
  tag: string;
  emblem: string;
  description: string;
  joinMode: JoinMode;
  members: number;
  weekPoints: number;
  totalPoints: number;
  rank?: number | null;
}

export interface ClanMember {
  id: string;
  name: string;
  avatar: string;
  role: ClanRole;
  weekPoints: number;
  totalPoints: number;
  me: boolean;
}

export interface MyClan extends ClanInfo {
  role: ClanRole;
  list: ClanMember[];
  requests: { id: string; name: string; avatar: string }[];
}

export interface CommunityState {
  week: string;
  clan: MyClan | null;
  rulesAccepted: boolean;
  mutedUntil: string | null;
  muteReason: string;
  requested: string[];
  blocked: string[];
  admin: boolean;
}

export interface ChatMessage {
  id: number;
  channel: string;
  player_id: string;
  name: string;
  avatar: string;
  clan_tag: string;
  body: string;
  created_at: string;
}

type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string; data: Record<string, unknown> | null };

async function call(body: Record<string, unknown>): Promise<Reply> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return { ok: false, reason: 'Keine Verbindung – die Community braucht Internet.', data: null };
  const { data, error } = await sb.functions.invoke('community', { body });
  let d = data as Record<string, unknown> | null;
  if (error) {
    const res = (error as { context?: Response }).context;
    d = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
  }
  if (!error && d && d.ok !== false) return { ok: true, data: d };
  return { ok: false, reason: typeof d?.reason === 'string' ? d.reason : !d ? 'Keine Verbindung – die Community braucht Internet.' : 'Das hat nicht geklappt.', data: d };
}

const stateOf = (d: Record<string, unknown>): CommunityState => ({
  week: String(d.week ?? ''), clan: (d.clan as MyClan | null) ?? null, rulesAccepted: d.rulesAccepted === true, mutedUntil: (d.mutedUntil as string | null) ?? null,
  muteReason: String(d.muteReason ?? ''), requested: Array.isArray(d.requested) ? (d.requested as string[]) : [], blocked: Array.isArray(d.blocked) ? (d.blocked as string[]) : [],
  admin: d.admin === true,
});

const cloudOf = (d: Record<string, unknown>): CloudSave | null =>
  typeof d.version === 'number' && d.save ? { version: d.version, save: sanitize(d.save), campaign: sanitizeProgress(d.campaign as CampaignProgress) } : null;

/** One step (or the overview): the new community state, or why not. A clan founded returns the new save too. */
export async function communityAction(action: string, args: Record<string, unknown> = {}):
  Promise<{ ok: true; state: CommunityState; cloud: CloudSave | null; data: Record<string, unknown> } | { ok: false; reason: string }> {
  const r = await call({ ...args, action });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, state: stateOf(r.data), cloud: cloudOf(r.data), data: r.data };
}

export async function listClans(query = ''): Promise<ClanInfo[] | null> {
  const r = await call({ action: 'clans', query });
  return r.ok && Array.isArray(r.data.clans) ? (r.data.clans as ClanInfo[]) : null;
}

export async function clanRanking(): Promise<{ clans: ClanInfo[]; mine: ClanInfo | null } | null> {
  const r = await call({ action: 'ranking' });
  return r.ok && Array.isArray(r.data.clans) ? { clans: r.data.clans as ClanInfo[], mine: (r.data.mine as ClanInfo | null) ?? null } : null;
}

export async function sendMessage(channel: string, body: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await call({ action: 'chat-send', channel, body });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

export async function reportMessage(messageId: number, reason: string): Promise<boolean> {
  return (await call({ action: 'chat-report', messageId, reason })).ok;
}

/** Hides (or shows again) another player's messages – only for this player, stored with RLS. */
export async function setBlocked(me: string, other: string, blocked: boolean): Promise<boolean> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return false;
  const { error } = blocked
    ? await sb.from('chat_blocks').upsert({ player_id: me, blocked_id: other }, { onConflict: 'player_id,blocked_id', ignoreDuplicates: true })
    : await sb.from('chat_blocks').delete().eq('player_id', me).eq('blocked_id', other);
  return !error;
}

const FIELDS = 'id, channel, player_id, name, avatar, clan_tag, body, created_at';

/** The last messages of a channel, oldest first. */
export async function chatHistory(channel: string, limit = 60): Promise<ChatMessage[] | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.from('chat_messages').select(FIELDS).eq('channel', channel).order('id', { ascending: false }).limit(limit);
  return error ? null : ((data ?? []) as ChatMessage[]).reverse();
}

/** New messages of a channel while the chat is open. Returns a function that stops listening. */
export function watchChat(channel: string, onMessage: (m: ChatMessage) => void): () => void {
  let stop = false;
  let cleanup: (() => void) | null = null;
  webBackend().then((b) => {
    const client = b?.supabase();
    if (!client || stop) return;
    const ch = client.channel(`chat-${channel}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${channel}` }, (payload) => {
        const m = payload.new as ChatMessage | null;
        if (m && m.id) onMessage(m);
      })
      .subscribe();
    cleanup = () => {
      client.removeChannel(ch);
    };
  });
  return () => {
    stop = true;
    cleanup?.();
  };
}

/** Admin: open reports, delete, dismiss, mute, list of muted players, rename / dissolve clans. */
export async function adminCommunity(action: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  const r = await call({ ...args, action });
  return r.ok ? r.data : null;
}
