// Progress is stored only in this browser (localStorage) – no account, no cloud backup.
import { DECK_SIZE, STARTER_DECK, STARTING_UNLOCKED, isPlausibleCardId } from './cards';
import { DEFAULT_SKINS, getSkin, isSkinId } from './skins';
import { ForgeState, emptyForge, sanitizeForge } from './forgeState';

export interface SaveData {
  version: 1;
  unlocked: string[];
  deck: string[];
  coins: number;
  stats: { wins: number; draws: number; losses: number; runs: number };
  settings: { reducedMotion: boolean };
  /** Owned and equipped skins (one per kind). */
  skins: { owned: string[]; card: string; runner: string };
  /** Deck for the Collection League test mode (up to 2 copies per card). */
  leagueDeck: string[];
  /** Runes: unlocked extra runes (the basic ones everyone has) and the equipped rune. */
  runes: { owned: string[]; equipped: string | null };
  /** Runensteine: the second currency (only with an account – earned in Erfolge, Kampagne, Raid). */
  stones: number;
  /** Shop: last free coins (ISO time) and the card offers bought today (Berlin day). */
  shop: ShopState;
  /** Card editions (Puzzle-Events): owned editions and the one used per card (cardId → editionId). */
  editions: { owned: string[]; equipped: Record<string, string> };
  /** Runenschmiede: essences, duplicates waiting to be melted, frames (only the server changes it for accounts). */
  forge: ForgeState;
}

export interface ShopState {
  freeAt: string | null;
  offerDay: string;
  offerBought: string[];
}

// Kept from the original working title "Project Card Rush" – changing it would lose every existing save.
export const SAVE_KEY = 'project-card-rush/save-v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlocked: [...STARTING_UNLOCKED],
    deck: [...STARTER_DECK],
    coins: 0,
    stats: { wins: 0, draws: 0, losses: 0, runs: 0 },
    settings: { reducedMotion: false },
    skins: { owned: [DEFAULT_SKINS.card, DEFAULT_SKINS.runner], card: DEFAULT_SKINS.card, runner: DEFAULT_SKINS.runner },
    leagueDeck: [],
    runes: { owned: [], equipped: null },
    stones: 0,
    shop: { freeAt: null, offerDay: '', offerBought: [] },
    editions: { owned: [], equipped: {} },
    forge: emptyForge(),
  };
}

export function isValidDeck(deck: string[], unlocked: string[]): boolean {
  const owned = new Set(unlocked);
  return deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every((id) => owned.has(id));
}

const RUNE_RE = /^rn\d{2,4}$/;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** Turns anything (including corrupted JSON) into a valid save. */
export function sanitize(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const unlocked = Array.isArray(r.unlocked)
    // Keep every well-formed id: cards from the card database are loaded after the save.
    ? [...new Set([...STARTING_UNLOCKED, ...r.unlocked.filter(isPlausibleCardId)])]
    : base.unlocked;
  const deck = Array.isArray(r.deck) && isValidDeck(r.deck, unlocked) ? [...r.deck] : [...STARTER_DECK];
  const s = r.stats && typeof r.stats === 'object' ? r.stats : {};
  const owned = [...new Set([...base.skins.owned, ...(Array.isArray(r.skins?.owned) ? r.skins.owned.filter(isSkinId) : [])])];
  const equipped = (kind: 'card' | 'runner') => {
    const id = r.skins?.[kind];
    return isSkinId(id) && owned.includes(id) && getSkin(id).kind === kind ? id : DEFAULT_SKINS[kind];
  };
  return {
    version: 1,
    unlocked,
    deck,
    coins: num(r.coins),
    stats: { wins: num(s.wins), draws: num(s.draws), losses: num(s.losses), runs: num(s.runs) },
    settings: { reducedMotion: Boolean(r.settings?.reducedMotion) },
    skins: { owned, card: equipped('card'), runner: equipped('runner') },
    leagueDeck: Array.isArray(r.leagueDeck) ? r.leagueDeck.filter(isPlausibleCardId).slice(0, DECK_SIZE) : [],
    runes: {
      owned: Array.isArray(r.runes?.owned) ? [...new Set(r.runes.owned.filter((x: unknown) => typeof x === 'string' && RUNE_RE.test(x)))] as string[] : [],
      equipped: typeof r.runes?.equipped === 'string' && RUNE_RE.test(r.runes.equipped) ? r.runes.equipped : null,
    },
    stones: Math.min(num(r.stones), 10_000_000),
    shop: sanitizeShop(r.shop),
    editions: sanitizeEditions(r.editions),
    forge: sanitizeForge(r.forge),
  };
}

const EDITION_RE = /^ed\d{2,4}$/;
function sanitizeEditions(raw: unknown): SaveData['editions'] {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((x): x is string => typeof x === 'string' && EDITION_RE.test(x)))].slice(0, 500) : [];
  const equipped: Record<string, string> = {};
  if (r.equipped && typeof r.equipped === 'object') {
    for (const [card, ed] of Object.entries(r.equipped as Record<string, unknown>).slice(0, 500)) {
      if (isPlausibleCardId(card) && typeof ed === 'string' && owned.includes(ed)) equipped[card] = ed;
    }
  }
  return { owned, equipped };
}

function sanitizeShop(raw: unknown): ShopState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const freeAt = typeof r.freeAt === 'string' && r.freeAt.length <= 40 && !Number.isNaN(Date.parse(r.freeAt)) ? r.freeAt : null;
  const offerDay = typeof r.offerDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.offerDay) ? r.offerDay : '';
  const offerBought = offerDay && Array.isArray(r.offerBought) ? [...new Set(r.offerBought.filter(isPlausibleCardId))].slice(0, 20) as string[] : [];
  return { freeAt, offerDay, offerBought };
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSave(store: KeyValueStore | null = browserStore()): SaveData {
  try {
    const text = store?.getItem(SAVE_KEY);
    return text ? sanitize(JSON.parse(text)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData, store: KeyValueStore | null = browserStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
