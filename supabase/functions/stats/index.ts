// Admin-Statistik: active players per day, card results and the coins in circulation (database function
// admin_stats). Only admins get an answer; players' names or single saves are never sent.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await db.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: 'not_signed_in' }, 401);
  const { data: adminRow } = await db.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (!adminRow) return json({ error: 'forbidden' }, 403);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No body: last 30 days.
  }
  const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
  const { data, error } = await db.rpc('admin_stats', { p_days: days });
  if (error) return json({ error: 'database' }, 500);
  return json({ ok: true, stats: data });
});
