// The game's side of online duels: calls the server function "pvp", sends a sign of life while waiting and
// playing, and receives this player's view of the match live (Realtime) – with a slow poll as a safety net.
import { webBackend } from './cardStore';
import { PvpView } from './pvp';
import type { Action } from './runes';

export type PvpReply = { ok: true; view: PvpView } | { ok: false; error: string; view?: PvpView };

async function sb() {
  return (await webBackend())?.supabase() ?? null;
}

async function call(body: Record<string, unknown>): Promise<PvpReply & { raw?: Record<string, unknown> }> {
  const client = await sb();
  if (!client) return { ok: false, error: 'offline' };
  const { data, error } = await client.functions.invoke('pvp', { body });
  let d = data as Record<string, unknown> | null;
  if (error) {
    const res = (error as { context?: Response }).context;
    d = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    if (!d) return { ok: false, error: 'offline' };
  }
  if (!d) return { ok: false, error: 'offline' };
  if (d.view && !d.error) return { ok: true, view: d.view as PvpView, raw: d };
  return { ok: false, error: String(d.error ?? 'unknown'), view: d.view as PvpView | undefined, raw: d };
}

export const pvpInvite = (hand: string[], rune: string | null) => call({ action: 'invite', hand, rune });
export const pvpJoin = (code: string, hand: string[], rune: string | null) => call({ action: 'join', code, hand, rune });
export const pvpQueue = (hand: string[], rune: string | null) => call({ action: 'queue', hand, rune });
export const pvpLeave = (matchId: string) => call({ action: 'leave', matchId });
export const pvpMove = (matchId: string, move: Action, n: number) => call({ action: 'move', matchId, move, n });
/** Sign of life while playing; the server also checks time-outs and an absent opponent. */
export const pvpTick = (matchId: string) => call({ action: 'tick', matchId });

export async function pvpStats(): Promise<{ wins: number; draws: number; losses: number } | null> {
  const client = await sb();
  if (!client) return null;
  const { data, error } = await client.functions.invoke('pvp', { body: { action: 'stats' } });
  return error || !data ? null : (data as { wins: number; draws: number; losses: number });
}

/** Sign of life while waiting for an opponent (cheap database call). */
export async function pvpPing(matchId: string): Promise<void> {
  const client = await sb();
  await client?.rpc('pvp_ping', { p_match: matchId });
}

/** The current view of a match (fallback when a live update was missed). */
export async function pvpFetch(matchId: string, uid: string): Promise<PvpView | null> {
  const client = await sb();
  if (!client) return null;
  const { data } = await client.from('pvp_views').select('view').eq('match_id', matchId).eq('player_id', uid).maybeSingle();
  return (data?.view as PvpView | undefined) ?? null;
}

/** Live updates of this player's match views. Returns a function that stops listening. */
export function pvpWatch(uid: string, onView: (v: PvpView) => void): () => void {
  let stop = false;
  let cleanup: (() => void) | null = null;
  sb().then((client) => {
    if (!client || stop) return;
    const channel = client.channel(`pvp-${uid}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_views', filter: `player_id=eq.${uid}` }, (payload) => {
        const v = (payload.new as { view?: PvpView } | null)?.view;
        if (v) onView(v);
      })
      .subscribe();
    cleanup = () => {
      client.removeChannel(channel);
    };
  });
  return () => {
    stop = true;
    cleanup?.();
  };
}

/** Error codes in German for players. */
export function pvpErrorText(code: string): string {
  switch (code) {
    case 'offline': return 'Keine Verbindung – für Online-Duelle brauchst du Internet.';
    case 'hand': return 'Bitte wähle 8 verschiedene eigene Karten.';
    case 'unknown_code': return 'Diesen Code gibt es nicht (mehr). Bitte prüfe ihn.';
    case 'own_code': return 'Das ist dein eigener Code – schick ihn einem Freund.';
    case 'no_save': return 'Dein Spielstand ist noch nicht im Konto gespeichert. Bitte kurz warten.';
    case 'not_your_turn': return 'Du bist gerade nicht am Zug.';
    case 'illegal': return 'Dieser Zug ist nicht erlaubt.';
    default: return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
  }
}
