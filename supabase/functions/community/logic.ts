// Rules of the community (clans and chat), shared by the server function "community", the game and its tests.
// Pure functions only (no Deno or browser APIs).

export const CLAN_COST = 500;
export const CLAN_MAX = 30;
export const MESSAGE_MAX = 200;
export const COMMUNITY_DOC = 'community';
export type JoinMode = 'open' | 'request' | 'closed';
export const JOIN_MODES: JoinMode[] = ['open', 'request', 'closed'];

/** Shown once before the first message; the player confirms it (stored on the server). */
export const CHAT_RULES = [
  'Sei freundlich – keine Beleidigungen, Drohungen, Hetze oder Belästigung.',
  'Keine persönlichen Daten (Adresse, Telefonnummer, Passwörter) – weder deine noch fremde.',
  'Keine Werbung, keine Links, kein Spam.',
  'Gemeldete Nachrichten prüft ein Admin. Wer gegen die Regeln verstößt, kann stummgeschaltet werden.',
  'Nachrichten werden nach 30 Tagen gelöscht. Du kannst andere Spieler jederzeit blockieren.',
];

/**
 * Words that are never shown (German and English insults and slurs, kept short on purpose). The admin adds more in
 * Admin → Community. Matched on whole words after simple look-alike letters are undone (0→o, 1→i, 3→e, 4→a, 5→s, @→a).
 */
export const BUILTIN_WORDS = [
  'arschloch', 'arsch', 'wichser', 'fotze', 'hurensohn', 'hure', 'schlampe', 'missgeburt', 'spast', 'spasti', 'behindi',
  'penner', 'scheiße', 'scheisse', 'fick', 'ficken', 'ficker', 'fickt', 'nazi', 'kanake', 'neger', 'schwuchtel', 'pisser', 'drecksau',
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'cunt', 'asshole', 'whore', 'slut', 'retard', 'faggot', 'nigger', 'nigga',
];

const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const fold = (w: string) => w.toLowerCase().split('').map((ch) => LOOKALIKE[ch] ?? ch).join('').replace(/(.)\1{2,}/g, '$1$1');

/** Cleans a list of filter words from the admin (lower case, letters only, at most 500). */
export function cleanWords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : [];
  return [...new Set(list.map((w) => fold(String(w).trim())).filter((w) => w.length >= 2 && w.length <= 30))].slice(0, 500);
}

/**
 * Replaces filtered words by stars. Long words (6+ letters) also count inside a longer word ("hurensohnxx"); short ones only
 * on their own, so harmless words like "Barsch" stay.
 */
export function filterWords(text: string, extra: readonly string[] = []): { text: string; hit: boolean } {
  const words = [...BUILTIN_WORDS, ...extra].map(fold);
  let hit = false;
  const out = text.replace(/[\p{L}\p{N}@$!]+/gu, (token) => {
    const f = fold(token);
    const bad = words.some((w) => f === w || (w.length >= 6 && f.includes(w)));
    if (!bad) return token;
    hit = true;
    return '*'.repeat(Math.min(token.length, 8));
  });
  return { text: out, hit };
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:de|com|net|org|io|gg|me|tv|ly|app|info|eu|at|ch|xyz|link|co)\b\S*/gi;

/** Control characters and invisible formatting characters (zero-width, direction marks) become spaces. */
function stripInvisible(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const hidden = c < 0x20 || c === 0x7f || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
    out += hidden ? ' ' : ch;
  }
  return out;
}

/** A chat message as it is stored: trimmed, single spaces, no links, filtered; null = nothing left to send. */
export function cleanMessage(raw: unknown, extra: readonly string[] = []): string | null {
  if (typeof raw !== 'string') return null;
  const text = stripInvisible(raw).replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX);
  const noLinks = text.replace(URL_RE, '[Link entfernt]');
  const out = filterWords(noLinks, extra).text.trim();
  return out.length ? out : null;
}

/** Clan name: 3–20 letters, digits, spaces, - and _; no filtered words. Returns the cleaned name or why not. */
export function checkClanName(raw: unknown, extra: readonly string[] = []): { ok: true; name: string } | { ok: false; reason: string } {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 3 || name.length > 20) return { ok: false, reason: 'Der Clanname braucht 3 bis 20 Zeichen.' };
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return { ok: false, reason: 'Im Clannamen sind nur Buchstaben, Zahlen, Leerzeichen, - und _ erlaubt.' };
  if (filterWords(name, extra).hit) return { ok: false, reason: 'Dieser Clanname ist nicht erlaubt.' };
  return { ok: true, name };
}

/** Clan tag: 2–4 capital letters or digits, e.g. WOLF. */
export function checkClanTag(raw: unknown, extra: readonly string[] = []): { ok: true; tag: string } | { ok: false; reason: string } {
  const tag = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9ÄÖÜ]{2,4}$/.test(tag)) return { ok: false, reason: 'Das Kürzel braucht 2 bis 4 Buchstaben oder Zahlen.' };
  if (filterWords(tag, extra).hit) return { ok: false, reason: 'Dieses Kürzel ist nicht erlaubt.' };
  return { ok: true, tag };
}

/** Clan description: at most 160 characters, no links, filtered. */
export function cleanDescription(raw: unknown, extra: readonly string[] = []): string {
  if (typeof raw !== 'string') return '';
  return filterWords(raw.replace(URL_RE, '').replace(/\s+/g, ' ').trim().slice(0, 160), extra).text.trim();
}

export const isJoinMode = (v: unknown): v is JoinMode => JOIN_MODES.includes(v as JoinMode);
export const isEmblem = (v: unknown): v is string => typeof v === 'string' && /^av\d{2,4}$/.test(v);
export const clanChannel = (clanId: string) => `clan:${clanId}`;

/** ISO week of the Berlin date, e.g. "2026-W46" – the same as the Erfolge (clan points of the week reset on Monday). */
export function berlinWeek(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow + 3);
  const year = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Points of this week (a row of an older week counts 0). */
export const weekPoints = (row: { week: string; week_points: number }, week: string) => (row.week === week ? row.week_points : 0);
