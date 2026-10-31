// Phase 4: adventure runs of signed-in players, checked on the server.
// "start": checks deck and rune against the stored save and hands out a ticket (seed). "finish": replays run and
// duel with the game's own rules (engine.js, bundled from src/server/engine.ts), pays the reward into the save.
// A finished ticket gives the same answer again (safe to retry after a lost connection), never a second reward.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import { finishAdventure, loadContent, prepareAdventure } from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@0397641dd3b116eb484fb6e47c4f66fd996e6d74/public/server/engine-231ee351ee2b.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TICKET_HOURS = 24;

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

  const [{ data: rows, error: e1 }, { data: adminRow }, { data: saveRow, error: e2 }] = await Promise.all([
    db.from('content_docs').select('collection, id, data'),
    db.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    db.from('player_saves').select('save, campaign, version').eq('player_id', uid).maybeSingle(),
  ]);
  if (e1 || e2) return json({ error: 'database' }, 500);
  if (!saveRow) return json({ error: 'no_save' }, 409);
  const isAdmin = !!adminRow;
  loadContent(rows ?? [], isAdmin);

  if (body.action === 'start') {
    const prep = prepareAdventure(saveRow.save, saveRow.campaign, body.deck, body.rune ?? null, isAdmin);
    if (!prep.ok) return json({ error: prep.error }, 422);
    const ticket = { ...prep.ticket, seed: seed() };
    const { data, error } = await db.from('game_tickets').insert({ player_id: uid, kind: 'adventure', ticket }).select('id').single();
    if (error) return json({ error: 'database' }, 500);
    return json({ ticket: { ...ticket, id: data.id } });
  }

  if (body.action === 'finish') {
    const id = typeof body.ticketId === 'string' ? body.ticketId : '';
    const { data: t } = await db.from('game_tickets').select('id, ticket, created_at, finished_at, result').eq('id', id).eq('player_id', uid).eq('kind', 'adventure').maybeSingle();
    if (!t) return json({ error: 'unknown_ticket' }, 404);
    // Already checked: the same answer again with the current save (no second reward).
    if (t.finished_at) return json({ ...(t.result ?? {}), repeated: true, save: saveRow.save, campaign: saveRow.campaign, version: saveRow.version });
    if (Date.now() - new Date(t.created_at).getTime() > TICKET_HOURS * 3600_000) return json({ error: 'expired' }, 410);

    // Replay, then finish the ticket and pay out in one step (pay_ticket); retry if the save changed in between.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: cur } = await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).single();
      const res = finishAdventure({ ...t.ticket, id: t.id }, body.log as never, cur!.save);
      const result = res.ok ? { ok: true, outcome: res.outcome, score: res.score, reward: res.reward } : { ok: false, error: res.error };
      const { data: paid, error } = await db.rpc('pay_ticket', {
        p_ticket: t.id, p_player: uid, p_result: result, p_save: res.ok ? res.save : null, p_campaign: null, p_version: cur!.version,
      });
      if (error) return json({ error: 'database' }, 500);
      if (paid === 'conflict') continue;
      if (paid === 'already') {
        const { data: done } = await db.from('game_tickets').select('result').eq('id', t.id).single();
        const { data: now } = await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).single();
        return json({ ...(done?.result ?? {}), repeated: true, ...now });
      }
      if (!res.ok) return json({ ...result, save: cur!.save, campaign: cur!.campaign, version: cur!.version }, 422);
      return json({ ...result, save: res.save, campaign: cur!.campaign, version: cur!.version + 1 });
    }
    return json({ error: 'busy' }, 503);
  }
  return json({ error: 'bad_request' }, 400);
});
