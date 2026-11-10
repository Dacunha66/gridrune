// Runensteine: the second currency. For now only earned for free (Erfolge, Kampagne, Raid – with an account);
// buying them for money is prepared (packages and prices) but switched off: no payment provider is connected.
// In the shop: free coins every few hours, coins for Runensteine, and daily card offers for Runensteine.
// The same rules run in the game and on the server (engine); the server decides for signed-in players.
import { CARDS, Rarity, getCard, pickByRarity } from './cards';
import { deriveRng } from './league';
import { questDay } from './quests';
import { SaveData } from './storage';

export const STONES_DOC = 'stones';

export interface CoinBundle {
  id: string;
  stones: number;
  coins: number;
}

/** Runenstein packages for money (prepared, not for sale while `payments` is off). */
export interface StonePack {
  id: string;
  stones: number;
  /** Price in euro cents. */
  cents: number;
}

export interface StoneConfig {
  /** Free coins and how many hours until the next free coins. */
  freeCoins: number;
  freeHours: number;
  coinBundles: CoinBundle[];
  /** Price of one card in the daily offers, by rarity. */
  cardPrice: Record<Rarity, number>;
  /** Number of card offers per day. */
  offers: number;
  stonePacks: StonePack[];
  /** Buying Runensteine for money. Always off until a payment provider is connected. */
  payments: false;
}

export const DEFAULT_STONES: StoneConfig = {
  freeCoins: 100,
  freeHours: 12,
  coinBundles: [
    { id: 'c1', stones: 50, coins: 800 },
    { id: 'c2', stones: 120, coins: 2000 },
    { id: 'c3', stones: 300, coins: 5500 },
  ],
  cardPrice: { common: 10, uncommon: 20, rare: 40, epic: 100, legendary: 250, mythic: 600 },
  offers: 4,
  stonePacks: [
    { id: 's1', stones: 100, cents: 99 },
    { id: 's2', stones: 550, cents: 499 },
    { id: 's3', stones: 1200, cents: 999 },
    { id: 's4', stones: 2600, cents: 1999 },
  ],
  payments: false,
};

let CONFIG: StoneConfig = structuredClone(DEFAULT_STONES);
export function stoneConfig(): StoneConfig {
  return CONFIG;
}
export function setStoneConfig(c: StoneConfig): void {
  CONFIG = c;
}

const RARITY_KEYS: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Turns an untrusted `settings/stones` document into the configuration (bad values → defaults). */
export function parseStoneDoc(raw: unknown): StoneConfig {
  const d = DEFAULT_STONES;
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const bundles = Array.isArray(r.coinBundles) ? r.coinBundles : d.coinBundles;
  const packs = Array.isArray(r.stonePacks) ? r.stonePacks : d.stonePacks;
  const price = r.cardPrice && typeof r.cardPrice === 'object' ? r.cardPrice as Record<string, unknown> : {};
  return {
    freeCoins: int(r.freeCoins, 0, 10000, d.freeCoins),
    freeHours: int(r.freeHours, 1, 168, d.freeHours),
    coinBundles: bundles.slice(0, 6).map((b, i) => {
      const x = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      const def = d.coinBundles[i] ?? d.coinBundles[d.coinBundles.length - 1];
      return { id: `c${i + 1}`, stones: int(x.stones, 1, 100000, def.stones), coins: int(x.coins, 1, 10_000_000, def.coins) };
    }),
    cardPrice: Object.fromEntries(RARITY_KEYS.map((k) => [k, int(price[k], 1, 100000, d.cardPrice[k])])) as Record<Rarity, number>,
    offers: int(r.offers, 1, 8, d.offers),
    stonePacks: packs.slice(0, 8).map((p, i) => {
      const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const def = d.stonePacks[i] ?? d.stonePacks[d.stonePacks.length - 1];
      return { id: `s${i + 1}`, stones: int(x.stones, 1, 1_000_000, def.stones), cents: int(x.cents, 1, 100_000, def.cents) };
    }),
    payments: false,
  };
}

export function stonesToDoc(c: StoneConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...c, updatedAt: new Date().toISOString() })) as Record<string, unknown>;
}

export const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

export type StoneResult<T = object> = ({ ok: true; save: SaveData } & T) | { ok: false; reason: string };

// ---------- Free coins ----------

/** When the next free coins can be taken (null = now). */
export function freeCoinsAt(save: SaveData, now: Date = new Date(), c: StoneConfig = CONFIG): Date | null {
  if (!save.shop.freeAt) return null;
  const next = new Date(Date.parse(save.shop.freeAt) + c.freeHours * 3600_000);
  return next.getTime() > now.getTime() ? next : null;
}

export function claimFreeCoins(save: SaveData, now: Date = new Date(), c: StoneConfig = CONFIG): StoneResult<{ coins: number }> {
  const next = freeCoinsAt(save, now, c);
  if (next) return { ok: false, reason: 'Die Gratis-Münzen gibt es erst wieder später.' };
  return { ok: true, coins: c.freeCoins, save: { ...save, coins: save.coins + c.freeCoins, shop: { ...save.shop, freeAt: now.toISOString() } } };
}

// ---------- Coins for Runensteine ----------

export function buyCoins(save: SaveData, bundleId: unknown, c: StoneConfig = CONFIG): StoneResult<{ coins: number }> {
  const b = c.coinBundles.find((x) => x.id === bundleId);
  if (!b) return { ok: false, reason: 'Dieses Angebot gibt es nicht.' };
  if (save.stones < b.stones) return { ok: false, reason: `Dir fehlen noch ${b.stones - save.stones} Runensteine.` };
  return { ok: true, coins: b.coins, save: { ...save, stones: save.stones - b.stones, coins: save.coins + b.coins } };
}

// ---------- Daily card offers ----------

/** Rarity mix of the offer slots: something small, a rare, an epic, a legendary (mythic rarely), then more mixed ones. */
const SLOTS: Partial<Record<Rarity, number>>[] = [
  { common: 50, uncommon: 50 },
  { rare: 100 },
  { epic: 100 },
  { legendary: 90, mythic: 10 },
  { uncommon: 40, rare: 40, epic: 20 },
  { rare: 50, epic: 40, legendary: 10 },
  { common: 30, uncommon: 40, rare: 30 },
  { epic: 70, legendary: 25, mythic: 5 },
];

/**
 * Today's card offers of a player (Berlin day): cards the player does not own yet, the same all day (also after
 * buying one – bought cards stay in the list, marked as bought). `player` = account id (guests: 'guest').
 */
export function dailyOffers(save: SaveData, player: string, now: Date = new Date(), c: StoneConfig = CONFIG): string[] {
  const day = questDay(now);
  const boughtToday = save.shop.offerDay === day ? new Set(save.shop.offerBought) : new Set<string>();
  // Cards bought today count as not owned, so the list does not change after a purchase.
  const owned = new Set(save.unlocked.filter((id) => !boughtToday.has(id)));
  const pool = CARDS.filter((card) => !card.rewardOnly && !owned.has(card.id));
  const rng = deriveRng(`${player}|${day}`, 'stone-offers');
  const out: string[] = [];
  for (let i = 0; i < c.offers && pool.length > 0; i++) {
    const card = pickByRarity(rng, pool, SLOTS[i % SLOTS.length]) ?? pool[Math.floor(rng() * pool.length)];
    pool.splice(pool.indexOf(card), 1);
    out.push(card.id);
  }
  return out;
}

export function offerPrice(cardId: string, c: StoneConfig = CONFIG): number {
  return c.cardPrice[getCard(cardId).rarity];
}

export function isOfferBought(save: SaveData, cardId: string, now: Date = new Date()): boolean {
  return save.shop.offerDay === questDay(now) && save.shop.offerBought.includes(cardId);
}

export function buyOffer(save: SaveData, player: string, cardId: unknown, now: Date = new Date(), c: StoneConfig = CONFIG): StoneResult<{ cardId: string }> {
  if (typeof cardId !== 'string' || !dailyOffers(save, player, now, c).includes(cardId)) return { ok: false, reason: 'Diese Karte ist heute nicht im Angebot.' };
  if (isOfferBought(save, cardId, now) || save.unlocked.includes(cardId)) return { ok: false, reason: 'Diese Karte hast du schon.' };
  const price = offerPrice(cardId, c);
  if (save.stones < price) return { ok: false, reason: `Dir fehlen noch ${price - save.stones} Runensteine.` };
  const day = questDay(now);
  const bought = save.shop.offerDay === day ? save.shop.offerBought : [];
  return {
    ok: true,
    cardId,
    save: {
      ...save,
      stones: save.stones - price,
      unlocked: [...save.unlocked, cardId],
      shop: { ...save.shop, offerDay: day, offerBought: [...bought, cardId] },
    },
  };
}
