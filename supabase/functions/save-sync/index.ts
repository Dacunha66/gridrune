// Stores the signed-in player's progress (phase 3). The game sends its whole save; this function compares it
// with the stored one and only accepts plausible changes: owned cards, skins, stars and statistics never go
// down, coins and new cards only grow in realistic steps. Exact checks of every duel follow in phase 4.
// Optimistic locking: the game sends the version it started from; if another device saved in between,
// the stored save is returned instead (the newer save wins, nothing is overwritten).
import { createClient } from 'jsr:@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

import { Obj, START_COINS_MAX, cleanCampaign, cleanSave, implausible } from './logic.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: 'not_signed_in' }, 401);

  let body: Obj;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const base = typeof body.base === 'number' ? body.base : null;
  const save = cleanSave(body.save);
  const campaign = cleanCampaign(body.campaign);

  const { data: row, error } = await admin.from('player_saves').select('save, campaign, version, updated_at').eq('player_id', uid).maybeSingle();
  if (error) return json({ error: 'database' }, 500);

  if (!row) {
    // First save of this account (new player, or the browser progress taken over once).
    if ((save.coins as number) > START_COINS_MAX) return json({ error: 'implausible', reason: 'zu viele Münzen' }, 422);
    const { error: e } = await admin.from('player_saves').insert({ player_id: uid, save, campaign, version: 1 });
    if (e) return json({ error: 'database' }, 500);
    return json({ version: 1, save, campaign });
  }
  if (base !== row.version) return json({ conflict: true, version: row.version, save: row.save, campaign: row.campaign });

  const minutes = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 60000);
  const reason = implausible(row.save as Obj, save, row.campaign as Obj, campaign, minutes);
  if (reason) return json({ error: 'implausible', reason, version: row.version, save: row.save, campaign: row.campaign }, 422);

  const next = row.version + 1;
  const { data: updated, error: e } = await admin.from('player_saves')
    .update({ save, campaign, version: next, updated_at: new Date().toISOString() })
    .eq('player_id', uid).eq('version', row.version).select('version').maybeSingle();
  if (e) return json({ error: 'database' }, 500);
  if (!updated) {
    const { data: fresh } = await admin.from('player_saves').select('save, campaign, version').eq('player_id', uid).single();
    return json({ conflict: true, ...fresh });
  }
  return json({ version: next, save, campaign });
});
