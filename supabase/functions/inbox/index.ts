// Postfach: rewards waiting for the player (raid rewards, gifts from the admin), kept 30 days. "list" shows them,
// "claim" collects some or all (paid into the save with the game's own rules – packs are opened here – and marked
// collected in one step, never twice). Admin: "admin-send" puts a gift into the Postfach of one player or of everyone.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import { checkGift, inboxClaimServer, loadContent } from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@40daff1aa4ecf0e6a9bf02caf9d182b8eb7caa07/public/server/engine-a93a7e6fbcb9.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function seed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await db.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: 'not_signed_in' }, 401);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const now = new Date().toISOString();

  /** Open items (not collected, not expired) and the ones collected in the last 30 days. */
  async function list() {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data } = await db.from('inbox_items').select('id, sender, title, message, reward, created_at, expires_at, claimed_at, result')
      .eq('player_id', uid).or(`and(claimed_at.is.null,expires_at.gt.${now}),claimed_at.gt.${since}`).order('created_at', { ascending: false }).limit(100);
    return (data ?? []).map((r: Row) => ({
      id: r.id, sender: r.sender, title: r.title, message: r.message, reward: r.reward, createdAt: r.created_at, expiresAt: r.expires_at, claimedAt: r.claimed_at, result: r.result,
    }));
  }

  if (body.action === 'list') return json({ ok: true, items: await list() });

  if (body.action === 'claim') {
    const { data: rows, error: e1 } = await db.from('content_docs').select('collection, id, data');
    if (e1) return json({ error: 'database' }, 500);
    loadContent(rows ?? [], false);
    const wanted = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x)) : null;
    for (let attempt = 0; attempt < 4; attempt++) {
      let q = db.from('inbox_items').select('id, title, reward').eq('player_id', uid).is('claimed_at', null).gt('expires_at', new Date().toISOString());
      if (wanted) q = q.in('id', wanted);
      const [{ data: items }, { data: saveRow }] = await Promise.all([q, db.from('player_saves').select('save, campaign, version').eq('player_id', uid).maybeSingle()]);
      if (!saveRow) return json({ error: 'no_save' }, 409);
      if (!items || items.length === 0) return json({ ok: true, results: {}, items: await list(), save: saveRow.save, campaign: saveRow.campaign, version: saveRow.version });
      const r = inboxClaimServer(saveRow.save, items as never, seed());
      const ids = items.map((i: Row) => i.id);
      const { data: res, error } = await db.rpc('inbox_claim', { p_player: uid, p_ids: ids, p_results: r.results, p_save: r.save, p_version: saveRow.version });
      if (error) return json({ error: 'database' }, 500);
      if (res === 'paid') return json({ ok: true, results: r.results, items: await list(), save: r.save, campaign: saveRow.campaign, version: saveRow.version + 1 });
      // 'already' (collected meanwhile) or 'conflict' (the save changed): look again.
    }
    return json({ error: 'busy' }, 503);
  }

  if (body.action === 'admin-send') {
    const { data: adminRow } = await db.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
    if (!adminRow) return json({ error: 'forbidden' }, 403);
    const { data: rows } = await db.from('content_docs').select('collection, id, data');
    loadContent(rows ?? [], true);
    const reward = checkGift(body.reward);
    if (!reward) return json({ ok: false, reason: 'Diese Belohnung gibt es so nicht (Karte oder Pack unbekannt?).' }, 422);
    const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (!title) return json({ ok: false, reason: 'Bitte einen Betreff eintragen.' }, 422);
    const message = typeof body.message === 'string' ? body.message.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    let players: string[] | null = null;
    if (body.to !== 'all') {
      const name = typeof body.to === 'string' ? body.to.trim() : '';
      const { data: found } = await db.from('profiles').select('id, display_name').ilike('display_name', name.replace(/[%_]/g, ''));
      if (!found || found.length === 0) return json({ ok: false, reason: `Keinen Spieler „${name}“ gefunden.` }, 422);
      players = found.map((f: Row) => f.id);
    }
    const { data: n, error } = await db.rpc('inbox_send', { p_players: players, p_title: title, p_message: message, p_reward: reward });
    if (error) return json({ error: 'database' }, 500);
    return json({ ok: true, sent: Number(n) || 0 });
  }
  return json({ error: 'bad_request' }, 400);
});
