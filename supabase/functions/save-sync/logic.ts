// Rules of the save check (phase 3), shared by the server function and the game's tests.
// Pure functions only (no Deno or browser APIs).
export type Obj = Record<string, unknown>;
const CARD_ID = /^[a-z][0-9]{2,4}$/;
const RUNE_ID = /^rn[0-9]{2,4}$/;
const SKIN_ID = /^[a-z0-9_-]{1,30}$/;
const MISSION_ID = /^m[0-9]{3,5}$/;
/** Coins one sync may add: the biggest single reward plus pack refunds, plus some time allowance (offline play). */
export const COIN_STEP = 2500;
export const COINS_PER_MINUTE = 300;
export const CARDS_STEP = 12;
export const START_COINS_MAX = 100000;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const ids = (v: unknown, re: RegExp, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && re.test(x)))].slice(0, max) : []);

/** Same shape as the game's save, everything checked (unknown fields dropped). */
export function cleanSave(raw: unknown): Obj {
  const r = isObj(raw) ? raw : {};
  const s = isObj(r.stats) ? r.stats : {};
  const sk = isObj(r.skins) ? r.skins : {};
  const ru = isObj(r.runes) ? r.runes : {};
  const unlocked = ids(r.unlocked, CARD_ID, 2000);
  const deck = ids(r.deck, CARD_ID, 20).filter((id) => unlocked.includes(id));
  const skinsOwned = ids(sk.owned, SKIN_ID, 100);
  return {
    version: 1,
    unlocked,
    deck,
    coins: Math.min(nat(r.coins), 10_000_000),
    stats: { wins: nat(s.wins), draws: nat(s.draws), losses: nat(s.losses), runs: nat(s.runs) },
    settings: { reducedMotion: Boolean(isObj(r.settings) && r.settings.reducedMotion) },
    skins: {
      owned: skinsOwned,
      card: typeof sk.card === 'string' && skinsOwned.includes(sk.card) ? sk.card : skinsOwned[0] ?? '',
      runner: typeof sk.runner === 'string' && skinsOwned.includes(sk.runner) ? sk.runner : skinsOwned[1] ?? '',
    },
    leagueDeck: Array.isArray(r.leagueDeck) ? r.leagueDeck.filter((x): x is string => typeof x === 'string' && CARD_ID.test(x)).slice(0, 20) : [],
    runes: { owned: ids(ru.owned, RUNE_ID, 100), equipped: typeof ru.equipped === 'string' && RUNE_ID.test(ru.equipped) ? ru.equipped : null },
  };
}

export function cleanCampaign(raw: unknown): Obj {
  const r = isObj(raw) ? raw : {};
  const missions: Obj = {};
  const src = isObj(r.missions) ? r.missions : {};
  for (const [id, m] of Object.entries(src).slice(0, 2000)) {
    if (!MISSION_ID.test(id) || !isObj(m)) continue;
    const text = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : null);
    missions[id] = {
      wins: nat(m.wins), draws: nat(m.draws), losses: nat(m.losses),
      stars: [0, 1, 2].map((i) => Array.isArray(m.stars) && m.stars[i] === true),
      goalsMet: Array.isArray(m.goalsMet) ? [...new Set(m.goalsMet.filter((g): g is string => typeof g === 'string' && g.length <= 60))].slice(0, 50) : [],
      firstWinAt: text(m.firstWinAt), lastPlayedAt: text(m.lastPlayedAt),
    };
  }
  return { version: 1, missions, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '' };
}

/** Why the new save is not a plausible next step after the old one (German, for the log), or null. */
export function implausible(oldS: Obj, newS: Obj, oldC: Obj, newC: Obj, minutes: number): string | null {
  const o = oldS as { unlocked: string[]; coins: number; stats: Obj; skins: { owned: string[] } };
  const n = newS as typeof o;
  if (!o.unlocked.every((id) => n.unlocked.includes(id))) return 'Karten verschwunden';
  if (n.unlocked.length - o.unlocked.length > CARDS_STEP) return 'zu viele neue Karten';
  if (n.coins - o.coins > COIN_STEP + minutes * COINS_PER_MINUTE) return 'zu viele Münzen';
  for (const k of ['wins', 'draws', 'losses', 'runs']) if (nat(n.stats[k]) < nat(o.stats[k])) return 'Statistik gesunken';
  if (!o.skins.owned.every((id) => n.skins.owned.includes(id))) return 'Skin verschwunden';
  const om = (oldC.missions ?? {}) as Record<string, { stars: boolean[]; wins: number }>;
  const nm = (newC.missions ?? {}) as Record<string, { stars: boolean[]; wins: number }>;
  for (const [id, m] of Object.entries(om)) {
    const x = nm[id];
    if (!x || m.stars.some((s, i) => s && !x.stars[i]) || x.wins < m.wins) return 'Kampagnen-Fortschritt gesunken';
  }
  return null;
}

/**
 * Phase 4d: coins, cards, skins owned, runes owned, statistics and the campaign only change through the checked
 * server functions (adventure, game). From the game's own save only harmless choices are taken over: deck,
 * league deck, settings, equipped skins and rune – and only with things the stored save owns.
 */
export function mergeChoices(stored: Obj, incoming: Obj): Obj {
  const s = cleanSave(stored) as { unlocked: string[]; skins: { owned: string[]; card: string; runner: string }; runes: { owned: string[]; equipped: string | null } } & Obj;
  const n = cleanSave(incoming) as typeof s;
  const deck = (n.deck as string[]).filter((id) => s.unlocked.includes(id));
  return {
    ...s,
    deck: deck.length === 20 ? deck : s.deck,
    leagueDeck: (n.leagueDeck as string[]).filter((id) => s.unlocked.includes(id)),
    settings: n.settings,
    skins: {
      owned: s.skins.owned,
      card: s.skins.owned.includes(n.skins.card) ? n.skins.card : s.skins.card,
      runner: s.skins.owned.includes(n.skins.runner) ? n.skins.runner : s.skins.runner,
    },
    // Campaign runes are unlocked by progress (checked by the game when used), so any known rune id may be equipped.
    runes: { owned: s.runes.owned, equipped: n.runes.equipped },
  };
}
