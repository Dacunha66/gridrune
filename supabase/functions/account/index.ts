// Deletes the signed-in player's account with everything that belongs to it (Datenschutz: right to erasure).
// The player confirms by typing "LÖSCHEN". A clan the player leads is handed over first (or dissolved when the player
// was the last member); then the auth user is deleted – every table about the player follows (ON DELETE CASCADE).
// Admin accounts are not deleted here (that would remove the admin rights too).
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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (body.action !== 'delete') return json({ error: 'bad_request' }, 400);
  if (body.confirm !== 'LÖSCHEN') return json({ ok: false, reason: 'Bitte zur Bestätigung LÖSCHEN eintippen.' }, 422);

  const { data: adminRow } = await db.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (adminRow) return json({ ok: false, reason: 'Admin-Konten können nicht im Spiel gelöscht werden.' }, 422);

  // Leave the clan properly (the lead goes to the next member; the last one out dissolves it).
  const { data: member } = await db.from('clan_members').select('clan_id').eq('player_id', uid).maybeSingle();
  if (member) {
    const { error } = await db.rpc('clan_remove', { p_actor: uid, p_target: uid });
    if (error) return json({ error: 'database' }, 500);
  }
  const { error } = await db.auth.admin.deleteUser(uid);
  if (error) return json({ error: 'database' }, 500);
  return json({ ok: true });
});
