// Phase 4b/4c: campaign missions, campaign rewards and shop purchases of signed-in players, done on the server.
// "mission-start": checks mission, deck, hand and rune against the stored save and hands out a ticket (seed).
// "mission-finish": replays the duel (and run) with the game's own rules, stores the stars and pays every reward
// owed. "claim": pays rewards earned earlier (once). "buy-pack" / "buy-skin": coins are taken and the cards drawn
// here. Every payout goes through pay_ticket: ticket finished and save written together, never twice.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import {
  buyPackServer, buySkinServer, claimCampaign, finishMission, loadContent, prepareMission,
} from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@1ff3a28cffd7919e53caef9caad5d79b0ac2ca01/public/server/engine-5c10cb5d6422.js';

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

type Row = { save: unknown; campaign: unknown; version: number };

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
  const readSave = async (): Promise<Row> => (await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).single()).data as Row;

  /**
   * Creates a finished ticket and writes the new save in one step (pay_ticket). `compute` runs on the current
   * save and is retried if another device saved in between.
   */
  async function payNow(kind: 'campaign' | 'shop', ticket: Record<string, unknown>,
    compute: (cur: Row) => { ok: true; save: unknown; campaign?: unknown; result: Record<string, unknown> } | { ok: false; status: number; result: Record<string, unknown> } | null) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await readSave();
      const res = compute(cur);
      if (!res) return json({ ok: true, granted: [], save: cur.save, campaign: cur.campaign, version: cur.version });
      if (!res.ok) return json({ ...res.result, save: cur.save, campaign: cur.campaign, version: cur.version }, res.status);
      const { data: t, error } = await db.from('game_tickets').insert({ player_id: uid, kind, ticket }).select('id').single();
      if (error) return json({ error: 'database' }, 500);
      const { data: paid, error: e } = await db.rpc('pay_ticket', {
        p_ticket: t.id, p_player: uid, p_result: res.result, p_save: res.save, p_campaign: res.campaign ?? null, p_version: cur.version,
      });
      if (e) return json({ error: 'database' }, 500);
      if (paid === 'paid') return json({ ...res.result, save: res.save, campaign: res.campaign ?? cur.campaign, version: cur.version + 1 });
      // 'conflict': the unpaid ticket stays unfinished (harmless) – try again on the newer save.
    }
    return json({ error: 'busy' }, 503);
  }

  if (body.action === 'mission-start') {
    const prep = prepareMission(saveRow.save, saveRow.campaign, body.missionId, body.deck, body.hand ?? null, body.rune ?? null, isAdmin);
    if (!prep.ok) return json({ error: prep.error }, 422);
    const ticket = { ...prep.ticket, seed: seed() };
    const { data, error } = await db.from('game_tickets').insert({ player_id: uid, kind: 'campaign', ticket }).select('id').single();
    if (error) return json({ error: 'database' }, 500);
    return json({ ticket: { ...ticket, id: data.id } });
  }

  if (body.action === 'mission-finish') {
    const id = typeof body.ticketId === 'string' ? body.ticketId : '';
    const { data: t } = await db.from('game_tickets').select('id, ticket, created_at, finished_at, result').eq('id', id).eq('player_id', uid).eq('kind', 'campaign').maybeSingle();
    if (!t || !t.ticket?.missionId) return json({ error: 'unknown_ticket' }, 404);
    if (t.finished_at) return json({ ...(t.result ?? {}), repeated: true, ...saveRow });
    if (Date.now() - new Date(t.created_at).getTime() > TICKET_HOURS * 3600_000) return json({ error: 'expired' }, 410);
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await readSave();
      const res = finishMission({ ...t.ticket, id: t.id }, body.log as never, cur.save, cur.campaign);
      const result = res.ok
        ? { ok: true, outcome: res.outcome, score: res.score, met: res.met, newStars: res.newStars, firstWin: res.firstWin, granted: res.granted }
        : { ok: false, error: res.error };
      const { data: paid, error } = await db.rpc('pay_ticket', {
        p_ticket: t.id, p_player: uid, p_result: result, p_save: res.ok ? res.save : null, p_campaign: res.ok ? res.campaign : null, p_version: cur.version,
      });
      if (error) return json({ error: 'database' }, 500);
      if (paid === 'conflict') continue;
      if (paid === 'already') {
        const { data: done } = await db.from('game_tickets').select('result').eq('id', t.id).single();
        return json({ ...(done?.result ?? {}), repeated: true, ...(await readSave()) });
      }
      if (!res.ok) return json({ ...result, ...cur }, 422);
      return json({ ...result, save: res.save, campaign: res.campaign, version: cur.version + 1 });
    }
    return json({ error: 'busy' }, 503);
  }

  if (body.action === 'claim') {
    const s = seed();
    return payNow('campaign', { claim: true, seed: s }, (cur) => {
      const r = claimCampaign(cur.save, cur.campaign, s);
      return r ? { ok: true, save: r.save, campaign: r.campaign, result: { ok: true, granted: r.granted } } : null;
    });
  }

  if (body.action === 'buy-pack') {
    const s = seed();
    return payNow('shop', { pack: String(body.packId ?? ''), seed: s }, (cur) => {
      const r = buyPackServer(cur.save, body.packId, s);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, cards: r.cards } } : { ok: false, status: 422, result: { ok: false, reason: r.error } };
    });
  }

  if (body.action === 'buy-skin') {
    return payNow('shop', { skin: String(body.skinId ?? '') }, (cur) => {
      const r = buySkinServer(cur.save, body.skinId);
      return r.ok ? { ok: true, save: r.save, result: { ok: true } } : { ok: false, status: 422, result: { ok: false, reason: r.error } };
    });
  }
  return json({ error: 'bad_request' }, 400);
});
