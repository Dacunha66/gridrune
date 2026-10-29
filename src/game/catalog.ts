// Card records as stored in the card database (admin dashboard) and how they turn into game cards.
import { BUILTIN_CARDS, CARD_ID_RE, CardDef, DECK_SIZE, RARITIES, RARITY_ORDER, RARITY_POWER, Rarity, STARTER_DECK, cardPower, suggestedClass } from './cards';
import { CardClass, effectFitsClass, EffectId, EFFECTS, isCardClass, isEffectId } from './effects';

export type CardStatus = 'draft' | 'active' | 'disabled';

export const STATUS_LABEL: Record<CardStatus, string> = { draft: 'Entwurf', active: 'Aktiv', disabled: 'Deaktiviert' };
export const STATUSES: CardStatus[] = ['draft', 'active', 'disabled'];

/** The game needs enough active cards for decks, gates, packs and the opponent. */
export const MIN_ACTIVE_CARDS = 30;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 300;

/** One card document in the database (`cards/<id>`). */
export interface CardRecord {
  id: string;
  name: string;
  rarity: Rarity;
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Emoji shown when there is no picture. */
  art: string;
  /** Background colour (0–360). */
  hue: number;
  description: string;
  status: CardStatus;
  /** Asset id of the uploaded picture, or null. */
  imageId: string | null;
  /** May be offered as a new card in the runner's final gate. */
  inRunner: boolean;
  /** Only obtainable as a duel reward (never in booster packs). */
  rewardOnly: boolean;
  /** Every card has exactly one class. */
  cls: CardClass;
  /** At most one effect, and only one that belongs to the class. */
  effect: EffectId | null;
  createdAt: string;
  updatedAt: string;
}

export type ValueKey = 'top' | 'right' | 'bottom' | 'left';
export const VALUE_KEYS: ValueKey[] = ['top', 'right', 'bottom', 'left'];

const ID_RE = CARD_ID_RE;
const ASSET_RE = /^[A-Za-z0-9_-]{8,64}$/;

function clampValue(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** Turns an untrusted database document into a valid record, or null if it is unusable. */
export function parseCardRecord(id: string, raw: unknown): CardRecord | null {
  if (!ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, NAME_MAX) : '';
  if (!name) return null;
  const rarity = RARITIES.includes(r.rarity as Rarity) ? (r.rarity as Rarity) : null;
  if (!rarity) return null;
  const values = VALUE_KEYS.map((k) => clampValue(r[k]));
  if (values.some((v) => v === null)) return null;
  const [top, right, bottom, left] = values as number[];
  // Older documents have no class yet: they get the suggested one. An effect must fit the class.
  const cls = isCardClass(r.cls) ? r.cls : suggestedClass(id);
  const effect = isEffectId(r.effect) && effectFitsClass(r.effect, cls) ? r.effect : null;
  const hue = typeof r.hue === 'number' && Number.isFinite(r.hue) ? ((Math.round(r.hue) % 360) + 360) % 360 : 260;
  return {
    id,
    name,
    rarity,
    top, right, bottom, left,
    art: typeof r.art === 'string' && r.art.trim() ? [...r.art.trim()].slice(0, 4).join('') : '🃏',
    hue,
    description: typeof r.description === 'string' ? r.description.trim().slice(0, DESCRIPTION_MAX) : '',
    status: STATUSES.includes(r.status as CardStatus) ? (r.status as CardStatus) : 'draft',
    imageId: typeof r.imageId === 'string' && ASSET_RE.test(r.imageId) ? r.imageId : null,
    // Older documents have no flags: they keep the previous behaviour.
    inRunner: r.inRunner !== false,
    rewardOnly: r.rewardOnly === true,
    cls,
    effect,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  };
}

/** The fields written to the database (the id is the document id). */
export function recordToDoc(rec: CardRecord): Record<string, unknown> {
  const { id: _id, ...doc } = rec;
  void _id;
  return doc;
}

export function imageUrl(imageId: string | null): string | undefined {
  return imageId ? `/_blob/${imageId}` : undefined;
}

export function recordToCard(rec: CardRecord): CardDef {
  return {
    id: rec.id,
    name: rec.name,
    rarity: rec.rarity,
    top: rec.top,
    right: rec.right,
    bottom: rec.bottom,
    left: rec.left,
    art: rec.art,
    hue: rec.hue,
    image: imageUrl(rec.imageId),
    description: rec.description || undefined,
    inRunner: rec.inRunner,
    rewardOnly: rec.rewardOnly,
    cls: rec.cls,
    effect: rec.effect ?? undefined,
  };
}

/** Records for the 100 built-in cards – used once to fill an empty database. */
export function builtinRecords(now = new Date().toISOString()): CardRecord[] {
  return BUILTIN_CARDS.map((c) => ({
    id: c.id, name: c.name, rarity: c.rarity, top: c.top, right: c.right, bottom: c.bottom, left: c.left,
    art: c.art, hue: c.hue, description: c.description ?? '', status: 'active', imageId: null, inRunner: true, rewardOnly: false,
    cls: c.cls ?? suggestedClass(c.id), effect: c.effect ?? null, createdAt: now, updatedAt: now,
  }));
}

/** Next free automatic id: k001, k002, … (ids of the built-in cards are never reused). */
export function nextCardId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = /^k(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `k${String(max + 1).padStart(3, '0')}`;
}

export function newRecord(id: string, now = new Date().toISOString()): CardRecord {
  return {
    id, name: '', rarity: 'common', top: 4, right: 4, bottom: 4, left: 4,
    art: '🃏', hue: 260, description: '', status: 'draft', imageId: null, inRunner: true, rewardOnly: false,
    cls: 'krieger', effect: null, createdAt: now, updatedAt: now,
  };
}

export function duplicateRecord(rec: CardRecord, id: string, now = new Date().toISOString()): CardRecord {
  return { ...rec, id, name: `${rec.name} (Kopie)`.slice(0, NAME_MAX), status: 'draft', createdAt: now, updatedAt: now };
}

export interface CatalogResult {
  /** Cards in play. */
  active: CardDef[];
  /** All cards, including drafts and disabled ones. */
  known: CardDef[];
  /** False if the database has too few active cards – the built-in cards are used instead. */
  usable: boolean;
}

/** Builds the game catalog from database records. */
/** Abilities that are only active once released (Freigabe in the admin area). */
export const NEW_ABILITIES = ['wirbelwind', 'kettenuebernahme'] as const;

/**
 * Cards in play. Without `newAbilities` (not released for this viewer yet) the new abilities are left off the
 * cards – the card then plays exactly like before; nothing in the database changes.
 */
export function buildCatalog(records: CardRecord[], newAbilities = true): CatalogResult {
  const sorted = [...records].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.id.localeCompare(b.id));
  const toCard = (r: CardRecord) => {
    const c = recordToCard(r);
    return !newAbilities && c.effect && (NEW_ABILITIES as readonly string[]).includes(c.effect) ? { ...c, effect: undefined } : c;
  };
  const known = sorted.map(toCard);
  const active = sorted.filter((r) => r.status === 'active').map(toCard);
  if (active.length < MIN_ACTIVE_CARDS) return { active: [...BUILTIN_CARDS], known: [...BUILTIN_CARDS, ...known], usable: false };
  return { active, known, usable: true };
}

/**
 * Makes sure a deck only holds active cards the player owns. Missing slots are filled with the
 * player's strongest other active cards; if the player owns too few, the weakest active cards
 * are unlocked for them so the game always stays playable.
 */
export function repairDeck(deck: string[], unlocked: string[], activeCards: readonly CardDef[]): { deck: string[]; unlocked: string[] } {
  const active = new Map(activeCards.map((c) => [c.id, c]));
  const owned = new Set(unlocked);
  const kept = [...new Set(deck)].filter((id) => active.has(id) && owned.has(id));
  if (kept.length === DECK_SIZE && deck.length === DECK_SIZE) return { deck, unlocked };
  const byStrength = (a: CardDef, b: CardDef) => cardPower(b) - cardPower(a) || a.id.localeCompare(b.id);
  const ownedActive = [...owned].filter((id) => active.has(id) && !kept.includes(id)).map((id) => active.get(id)!).sort(byStrength);
  const result = [...kept];
  for (const c of ownedActive) {
    if (result.length >= DECK_SIZE) break;
    result.push(c.id);
  }
  const newUnlocked = [...unlocked];
  if (result.length < DECK_SIZE) {
    // Reward-only cards are never handed out for free.
    const giftable = (c: CardDef) => !c.rewardOnly;
    const starterFirst = [...STARTER_DECK.filter((id) => active.has(id)).map((id) => active.get(id)!), ...[...activeCards].sort((a, b) => -byStrength(a, b))].filter(giftable);
    for (const c of starterFirst) {
      if (result.length >= DECK_SIZE) break;
      if (result.includes(c.id)) continue;
      result.push(c.id);
      if (!owned.has(c.id)) {
        owned.add(c.id);
        newUnlocked.push(c.id);
      }
    }
  }
  return { deck: result, unlocked: newUnlocked };
}

/** Strength of a record's effect in Σ points (0 without effect). */
export function recordEffectValue(r: { effect?: EffectId | null }): number {
  return r.effect ? EFFECTS[r.effect].value : 0;
}

/**
 * Recommended strength for a rarity (a hint in the editor, not a rule). `total` = value sum plus
 * effect strength, e.g. Arkane Kraft counts as +4.
 */
export function powerHint(rec: Pick<CardRecord, ValueKey | 'rarity'> & { effect?: EffectId | null }): {
  sum: number; effect: number; total: number; min: number; max: number; ok: boolean;
} {
  const sum = rec.top + rec.right + rec.bottom + rec.left;
  const effect = recordEffectValue(rec);
  const total = Math.round((sum + effect) * 10) / 10;
  const [min, max] = RARITY_POWER[rec.rarity];
  return { sum, effect, total, min, max, ok: total >= min && total <= max };
}

/** A card counts as conspicuous when its total differs this much from the average of its rarity. */
export const OUTLIER_THRESHOLD = 3;

export interface RarityStats { count: number; avg: number; min: number; max: number }
export interface CardBalance {
  sum: number;
  /** Average total of the other active cards of the same rarity (null if there are none). */
  avg: number | null;
  /** sum − avg, rounded to one decimal. */
  diff: number;
  flag: 'strong' | 'weak' | null;
}

/** Total strength: the four values plus the effect strength (Σ points). */
export function cardSum(r: Pick<CardRecord, ValueKey> & { effect?: EffectId | null }): number {
  return Math.round((r.top + r.right + r.bottom + r.left + recordEffectValue(r)) * 10) / 10;
}

/**
 * Strength overview: per-rarity statistics of the active cards, and for every card how far its
 * total is from the other active cards of the same rarity.
 */
export function balanceReport(records: CardRecord[]): { stats: Record<Rarity, RarityStats>; cards: Map<string, CardBalance> } {
  const stats = Object.fromEntries(RARITIES.map((r) => [r, { count: 0, avg: 0, min: 0, max: 0 }])) as Record<Rarity, RarityStats>;
  const sums = new Map<Rarity, { id: string; sum: number }[]>();
  for (const rec of records) {
    if (rec.status !== 'active') continue;
    const list = sums.get(rec.rarity) ?? [];
    list.push({ id: rec.id, sum: cardSum(rec) });
    sums.set(rec.rarity, list);
  }
  for (const [rarity, list] of sums) {
    const values = list.map((x) => x.sum);
    stats[rarity] = {
      count: list.length,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  const cards = new Map<string, CardBalance>();
  for (const rec of records) {
    const sum = cardSum(rec);
    const others = (sums.get(rec.rarity) ?? []).filter((x) => x.id !== rec.id);
    if (others.length === 0) {
      cards.set(rec.id, { sum, avg: null, diff: 0, flag: null });
      continue;
    }
    const avg = others.reduce((a, x) => a + x.sum, 0) / others.length;
    const diff = Math.round((sum - avg) * 10) / 10;
    cards.set(rec.id, { sum, avg: Math.round(avg * 10) / 10, diff, flag: diff >= OUTLIER_THRESHOLD ? 'strong' : diff <= -OUTLIER_THRESHOLD ? 'weak' : null });
  }
  return { stats, cards };
}
