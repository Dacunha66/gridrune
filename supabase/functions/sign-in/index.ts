// Sign-in with player name (or e-mail) and password. The e-mail behind a name never leaves the server:
// the function looks it up, signs in with Supabase Auth and returns only the session.
// Wrong name and wrong password give the same answer, so nobody can find out which names exist this way.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const WRONG = { error: 'invalid_credentials' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let login = '', password = '';
  try {
    const body = await req.json();
    login = typeof body?.login === 'string' ? body.login.trim().slice(0, 254) : '';
    password = typeof body?.password === 'string' ? body.password.slice(0, 200) : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!login || !password) return json(WRONG, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  let email = login;
  if (!login.includes('@')) {
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: profile } = await admin.from('profiles').select('id').ilike('display_name', login.replace(/[\\%_]/g, '\\$&')).maybeSingle();
    if (!profile) return json(WRONG, 400);
    const { data: user } = await admin.auth.admin.getUserById(profile.id);
    if (!user?.user?.email) return json(WRONG, 400);
    email = user.user.email;
  }
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const code = (error as { code?: string } | null)?.code;
    return json(code === 'email_not_confirmed' ? { error: 'email_not_confirmed' } : code === 'over_request_rate_limit' ? { error: 'over_request_rate_limit' } : WRONG, 400);
  }
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
