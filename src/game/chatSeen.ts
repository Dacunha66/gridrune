// Neue Chat-Nachrichten: which messages this player has already seen, per channel and account, kept on this device
// (gridrune/chat-seen/<uid>). The menu asks unreadChat() for the badge on "Community"; the chat marks a channel as
// read while it is open. Own messages and messages of blocked players never count.
import { webBackend } from './cardStore';

type Seen = Record<string, number>;
const key = (uid: string) => `gridrune/chat-seen/${uid}`;

function read(uid: string): Seen | null {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? v as Seen : null;
  } catch {
    return null;
  }
}
function write(uid: string, seen: Seen): void {
  try {
    localStorage.setItem(key(uid), JSON.stringify(seen));
  } catch {
    // Without storage every message simply counts as seen once the chat was opened in this visit.
  }
}

/** The chat shows `channel` up to message `id`: everything up to there is read. */
export function markChatSeen(uid: string, channel: string, id: number): void {
  const seen = read(uid) ?? {};
  if ((seen[channel] ?? 0) >= id) return;
  write(uid, { ...seen, [channel]: id });
}

export interface ChatRow { id: number; channel: string; player_id: string }

/**
 * New messages per channel. `seen` null (first visit on this device): nothing counts – the current state becomes
 * the starting point, so old history never shows up as new.
 */
export function countUnread(rows: ChatRow[], uid: string, seen: Seen | null, blocked: Set<string> = new Set()): { byChannel: Record<string, number>; total: number; start: Seen | null } {
  if (!seen) {
    const start: Seen = {};
    for (const r of rows) start[r.channel] = Math.max(start[r.channel] ?? 0, r.id);
    return { byChannel: {}, total: 0, start };
  }
  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (r.player_id === uid || blocked.has(r.player_id)) continue;
    // A channel never opened on this device: only messages after the first look count (seen[channel] set then).
    if (seen[r.channel] === undefined || r.id <= seen[r.channel]) continue;
    byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
    total++;
  }
  return { byChannel, total, start: null };
}

/** New messages for the signed-in player (null = no connection). Looks at the newest 50 messages it may read. */
export async function unreadChat(uid: string): Promise<{ byChannel: Record<string, number>; total: number } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const [{ data, error }, { data: blocks }] = await Promise.all([
    sb.from('chat_messages').select('id, channel, player_id').order('id', { ascending: false }).limit(50),
    sb.from('chat_blocks').select('blocked_id').eq('player_id', uid),
  ]);
  if (error || !data) return null;
  const rows = data as ChatRow[];
  const seen = read(uid);
  const r = countUnread(rows, uid, seen, new Set((blocks ?? []).map((b: { blocked_id: string }) => b.blocked_id)));
  if (r.start) write(uid, r.start);
  else {
    // Channels seen for the first time (e.g. a new clan): start from now, so their history does not count.
    const fresh = rows.filter((x) => seen && seen[x.channel] === undefined);
    if (fresh.length) {
      const next = { ...seen };
      for (const x of fresh) next[x.channel] = Math.max(next[x.channel] ?? 0, x.id);
      write(uid, next);
    }
  }
  return { byChannel: r.byChannel, total: r.total };
}
