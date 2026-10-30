// Player accounts of the web version (e-mail + password, Supabase Auth). In the claude.ai version there are
// no accounts: every function reports "not available" and the game behaves as before.
import { webBackend } from './cardStore';

export interface Account {
  id: string;
  email: string;
  name: string;
}

/** What the start screen needs to know. */
export type AccountState =
  | { kind: 'unavailable' }
  | { kind: 'signedOut'; guest: boolean }
  | { kind: 'signedIn'; account: Account }
  /** Opened from the "new password" e-mail: the player chooses a new password first. */
  | { kind: 'recovery'; account: Account };

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const PASSWORD_MIN = 8;
const GUEST_KEY = 'gridrune/guest-v1';
/** Accounts are switched on once the database and the e-mail links are set up (until then: no sign-in screen). */
export const ACCOUNTS_LIVE = true;
/** Where the confirmation and new-password e-mails lead back to. */
const SITE_URL = 'https://gridrune.netlify.app/';

/** Player names: letters (also umlauts), digits, space, - and _; 2–20 characters. Same rule as the database. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Der Name braucht ${NAME_MIN} bis ${NAME_MAX} Zeichen.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name)) return 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen, - und _.';
  return null;
}

export function emailProblem(raw: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim()) ? null : 'Bitte eine gültige E-Mail-Adresse eingeben.';
}

export function passwordProblem(pw: string): string | null {
  return pw.length >= PASSWORD_MIN ? null : `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
}

export function isGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGuest(on: boolean): void {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // Private mode: the guest choice just isn't remembered.
  }
}

async function client() {
  return (await webBackend())?.supabase() ?? null;
}

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

async function toAccount(user: AuthUser): Promise<Account> {
  const sb = (await client())!;
  const { data } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const meta = typeof user.user_metadata?.display_name === 'string' ? (user.user_metadata.display_name as string) : '';
  return { id: user.id, email: user.email ?? '', name: (data?.display_name as string | undefined) ?? meta ?? '' };
}

/** Current state, and every later change (sign-in, sign-out, password e-mail). Returns a stop function. */
export function watchAccount(next: (s: AccountState) => void): () => void {
  let stop = () => {};
  let alive = true;
  (async () => {
    const sb = ACCOUNTS_LIVE ? await client() : null;
    if (!alive) return;
    if (!sb) return next({ kind: 'unavailable' });
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // Run outside the auth callback (the client must not be called from inside it).
      setTimeout(async () => {
        if (!alive) return;
        if (!session) return next({ kind: 'signedOut', guest: isGuest() });
        const account = await toAccount(session.user);
        if (alive) next(event === 'PASSWORD_RECOVERY' ? { kind: 'recovery', account } : { kind: 'signedIn', account });
      }, 0);
    });
    stop = () => data.subscription.unsubscribe();
  })();
  return () => {
    alive = false;
    stop();
  };
}

/** German message for an auth error (never shows technical details). */
export function describeAuthError(e: unknown): string {
  const err = e as { code?: string; message?: string; status?: number } | null;
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'Name/E-Mail oder Passwort stimmt nicht.';
  if (code === 'name_taken' || code === '23505' || msg.includes('display_name_taken') || msg.includes('database error saving new user')) return 'Dieser Spielername ist schon vergeben. Bitte wähle einen anderen.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Zu dieser E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (code === 'weak_password') return `Das Passwort ist zu schwach. Bitte mindestens ${PASSWORD_MIN} Zeichen, am besten mit Ziffern.`;
  if (code === 'same_password') return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err?.status === 429) return 'Zu viele Versuche. Bitte etwas später erneut probieren.';
  if (code === 'email_address_invalid' || code === 'email_address_not_authorized') return 'An diese E-Mail-Adresse kann gerade keine Bestätigung geschickt werden.';
  if (code === 'signup_disabled') return 'Neue Konten sind gerade nicht möglich.';
  return 'Das hat nicht geklappt. Bitte prüfe deine Internetverbindung und versuche es erneut.';
}

/** Is this player name still free? (Upper/lower case counts as the same name.) */
export async function nameAvailable(name: string): Promise<boolean> {
  const sb = (await client())!;
  const { data, error } = await sb.rpc('name_available', { wanted: name.trim() });
  if (error) throw error;
  return data === true;
}

export async function signUp(email: string, password: string, name: string): Promise<'confirm' | 'signedIn'> {
  const sb = (await client())!;
  if (!(await nameAvailable(name))) throw { code: 'name_taken' };
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: name.trim() }, emailRedirectTo: SITE_URL },
  });
  if (error) throw error;
  // With e-mail confirmation on, there is no session until the link in the e-mail is opened.
  return data.session ? 'signedIn' : 'confirm';
}

/** Sign in with player name or e-mail. A name is turned into the e-mail on the server (function "sign-in"). */
export async function signIn(login: string, password: string): Promise<void> {
  const sb = (await client())!;
  const value = login.trim();
  if (value.includes('@')) {
    const { error } = await sb.auth.signInWithPassword({ email: value, password });
    if (error) throw error;
  } else {
    const { data, error } = await sb.functions.invoke('sign-in', { body: { login: value, password } });
    // The function answers 400 with { error: code } – read the code from the response.
    let body = data as { access_token?: string; refresh_token?: string; error?: string } | null;
    if (error) {
      const res = (error as { context?: Response }).context;
      body = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
      throw { code: body?.error ?? 'network' };
    }
    if (!body?.access_token || !body.refresh_token) throw { code: body?.error ?? 'invalid_credentials' };
    const { error: sessionError } = await sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    if (sessionError) throw sessionError;
  }
  setGuest(false);
}

/** Player name or e-mail for signing in. */
export function loginProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Bitte Spielername oder E-Mail eingeben.';
  return value.includes('@') ? emailProblem(value) : null;
}

export async function signOut(): Promise<void> {
  const sb = await client();
  await sb?.auth.signOut();
}

export async function sendPasswordMail(email: string): Promise<void> {
  const sb = (await client())!;
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL });
  if (error) throw error;
}

export async function setNewPassword(password: string): Promise<void> {
  const sb = (await client())!;
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

/** Changes the player name (the database checks the same rule as nameProblem). */
export async function setDisplayName(account: Account, name: string): Promise<void> {
  const sb = (await client())!;
  const { error } = await sb.from('profiles').upsert({ id: account.id, display_name: name.trim() });
  if (error) throw error;
}
