// Card shop: booster packs and skins, paid with coins earned in duels.
import { CARDS, RARITY_ORDER, Rarity, getCard, pickByRarity } from './cards';
import { Rng } from './rng';
import { SkinKind, getSkin, isSkinId } from './skins';
import { SaveData } from './storage';
import { addDuplicate } from './forge';
import { ImageRef, parseImage } from './campaign';

export interface PackDef {
  id: string;
  name: string;
  description: string;
  price: number;
  size: number;
  weights: Record<Rarity, number>;
  /** If set, the last card is drawn from these weights (e.g. guaranteed epic or better). */
  guaranteed?: Partial<Record<Rarity, number>>;
}

export const PACKS: PackDef[] = [
  {
    id: 'abenteurer', name: 'Abenteurer-Pack', description: '3 Karten – meist gewöhnlich und selten, mit etwas Glück episch.',
    price: 150, size: 3, weights: { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 0.9, mythic: 0.1 },
  },
  {
    id: 'helden', name: 'Helden-Pack', description: '3 Karten – mindestens eine epische oder legendäre Karte garantiert.',
    price: 400, size: 3, weights: { common: 15, uncommon: 30, rare: 35, epic: 15, legendary: 4.5, mythic: 0.5 },
    guaranteed: { epic: 75, legendary: 22, mythic: 3 },
  },
];

export interface PackCard {
  cardId: string;
  isNew: boolean;
  /** Coins for a duplicate – always 0 since the Runenschmiede (duplicates go into the melting pot); kept for old answers. */
  refund: number;
}

export type ShopResult<T = object> = ({ ok: true; save: SaveData } & T) | { ok: false; reason: string };

/** Draws the pack's cards (all different within one pack). */
/** At most this many legendary or mythic cards in one pack. */
export const PACK_MAX_TOP = 1;
const TOP: Rarity[] = ['legendary', 'mythic'];

/**
 * Draws the pack's cards (all different within one pack): at most one legendary or mythic card, and sorted from the most
 * common to the rarest – the best card is always turned over last.
 */
export function rollPack(pack: PackDef, rng: Rng): string[] {
  // Reward-only cards are never in booster packs.
  const pool = CARDS.filter((c) => !c.rewardOnly);
  const out: string[] = [];
  let top = 0;
  // Once the pack has its legendary/mythic card, the other slots draw without those rarities.
  const capped = (w: Partial<Record<Rarity, number>>) => (top >= PACK_MAX_TOP ? { ...w, legendary: 0, mythic: 0 } : w);
  for (let i = 0; i < pack.size; i++) {
    const last = i === pack.size - 1;
    const card = (last && pack.guaranteed && pickByRarity(rng, pool, capped(pack.guaranteed))) || pickByRarity(rng, pool, capped(pack.weights))
      || pool.find((c) => !TOP.includes(c.rarity)) || pool[0];
    pool.splice(pool.indexOf(card), 1);
    if (TOP.includes(card.rarity)) top++;
    out.push(card.id);
  }
  return out.sort((x, y) => RARITY_ORDER[getCard(x).rarity] - RARITY_ORDER[getCard(y).rarity]);
}

export function buyPack(save: SaveData, packId: string, rng: Rng): ShopResult<{ cards: PackCard[] }> {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: 'Dieses Pack gibt es nicht.' };
  const price = packPrice(pack);
  if (save.coins < price) return { ok: false, reason: `Dir fehlen noch 🪙 ${price - save.coins}.` };
  const owned = new Set(save.unlocked);
  const cards: PackCard[] = rollPack(pack, rng).map((cardId) => {
    const isNew = !owned.has(cardId);
    owned.add(cardId);
    return { cardId, isNew, refund: 0 };
  });
  // Runenschmiede: a card already owned goes into the melting pot.
  let next: SaveData = { ...save, coins: save.coins - price, unlocked: [...save.unlocked, ...cards.filter((c) => c.isNew).map((c) => c.cardId)] };
  for (const c of cards) if (!c.isNew) next = addDuplicate(next, c.cardId);
  return { ok: true, cards, save: next };
}

export function buySkin(save: SaveData, skinId: string): ShopResult {
  if (!isSkinId(skinId)) return { ok: false, reason: 'Diesen Skin gibt es nicht.' };
  if (save.skins.owned.includes(skinId)) return { ok: false, reason: 'Diesen Skin besitzt du schon.' };
  const skin = getSkin(skinId);
  if (skin.rewardOnly) return { ok: false, reason: 'Diesen Skin gibt es nur als Belohnung.' };
  if (save.coins < skin.price) return { ok: false, reason: `Dir fehlen noch 🪙 ${skin.price - save.coins}.` };
  const bought: SaveData = { ...save, coins: save.coins - skin.price, skins: { ...save.skins, owned: [...save.skins.owned, skinId] } };
  return { ok: true, save: equipSkin(bought, skinId) };
}

export function equipSkin(save: SaveData, skinId: string): SaveData {
  if (!isSkinId(skinId) || !save.skins.owned.includes(skinId)) return save;
  const kind: SkinKind = getSkin(skinId).kind;
  return { ...save, skins: { ...save.skins, [kind]: skinId } };
}

// ---------- Look of the packs (admin: tab "Shop") ----------
// Picture, name, text and the price can be changed. Size and odds are game rules and stay in code.

export const SHOP_DOC = 'shop';
export const PACK_NAME_MAX = 30;
export const PACK_TEXT_MAX = 140;

export interface PackLook {
  image: ImageRef | null;
  /** Empty = the built-in name / text. */
  name: string;
  description: string;
  /** Price in coins set by the admin; null = the built-in price. */
  price?: number | null;
}

export const PACK_PRICE_MIN = 10;
export const PACK_PRICE_MAX = 100000;

let LOOKS: Record<string, PackLook> = {};

export function setPackLooks(looks: Record<string, PackLook>): void {
  LOOKS = looks;
}

export function packLooks(): Record<string, PackLook> {
  return LOOKS;
}

/** What a pack costs: the admin's price, otherwise the built-in one (the server uses the same document). */
export function packPrice(pack: PackDef, look: PackLook | undefined = LOOKS[pack.id]): number {
  const p = look?.price;
  return typeof p === 'number' && Number.isFinite(p) ? Math.min(PACK_PRICE_MAX, Math.max(PACK_PRICE_MIN, Math.round(p))) : pack.price;
}

/** How a pack appears in the shop: the admin's picture and texts, otherwise the built-in ones. */
export function packView(pack: PackDef, look: PackLook | undefined = LOOKS[pack.id]): { name: string; description: string; image: ImageRef | null } {
  return { name: look?.name || pack.name, description: look?.description || pack.description, image: look?.image ?? null };
}

/** Turns an untrusted `settings/shop` document into pack looks (unknown packs and bad values are dropped). */
export function parseShopDoc(raw: unknown): Record<string, PackLook> {
  const out: Record<string, PackLook> = {};
  const packs = raw && typeof raw === 'object' ? (raw as { packs?: unknown }).packs : null;
  if (!packs || typeof packs !== 'object') return out;
  for (const pack of PACKS) {
    const r = (packs as Record<string, unknown>)[pack.id];
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    out[pack.id] = {
      image: parseImage(x.image),
      name: typeof x.name === 'string' ? x.name.trim().slice(0, PACK_NAME_MAX) : '',
      description: typeof x.description === 'string' ? x.description.trim().slice(0, PACK_TEXT_MAX) : '',
      price: typeof x.price === 'number' && Number.isFinite(x.price) ? Math.min(PACK_PRICE_MAX, Math.max(PACK_PRICE_MIN, Math.round(x.price))) : null,
    };
  }
  return out;
}

export function shopToDoc(looks: Record<string, PackLook>): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ packs: looks, updatedAt: new Date().toISOString() })) as Record<string, unknown>;
}
