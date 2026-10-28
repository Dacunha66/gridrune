// Card shop: booster packs and skins, paid with coins earned in duels.
import { CARDS, Rarity, getCard, pickByRarity } from './cards';
import { Rng } from './rng';
import { SkinKind, getSkin, isSkinId } from './skins';
import { SaveData } from './storage';

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

/** Coins returned for a card you already own. */
export const DUPLICATE_REFUND: Record<Rarity, number> = { common: 10, uncommon: 15, rare: 25, epic: 60, legendary: 150, mythic: 400 };

export interface PackCard {
  cardId: string;
  isNew: boolean;
  refund: number;
}

export type ShopResult<T = object> = ({ ok: true; save: SaveData } & T) | { ok: false; reason: string };

/** Draws the pack's cards (all different within one pack). */
export function rollPack(pack: PackDef, rng: Rng): string[] {
  // Reward-only cards are never in booster packs.
  const pool = CARDS.filter((c) => !c.rewardOnly);
  const out: string[] = [];
  for (let i = 0; i < pack.size; i++) {
    const last = i === pack.size - 1;
    const card = (last && pack.guaranteed && pickByRarity(rng, pool, pack.guaranteed)) || pickByRarity(rng, pool, pack.weights)!;
    pool.splice(pool.indexOf(card), 1);
    out.push(card.id);
  }
  return out;
}

export function buyPack(save: SaveData, packId: string, rng: Rng): ShopResult<{ cards: PackCard[] }> {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: 'Dieses Pack gibt es nicht.' };
  if (save.coins < pack.price) return { ok: false, reason: `Dir fehlen noch 🪙 ${pack.price - save.coins}.` };
  const owned = new Set(save.unlocked);
  const cards: PackCard[] = rollPack(pack, rng).map((cardId) => {
    const isNew = !owned.has(cardId);
    owned.add(cardId);
    const rarity = getCard(cardId).rarity;
    return { cardId, isNew, refund: isNew ? 0 : DUPLICATE_REFUND[rarity] };
  });
  const refund = cards.reduce((sum, c) => sum + c.refund, 0);
  return {
    ok: true,
    cards,
    save: {
      ...save,
      coins: save.coins - pack.price + refund,
      unlocked: [...save.unlocked, ...cards.filter((c) => c.isNew).map((c) => c.cardId)],
    },
  };
}

export function buySkin(save: SaveData, skinId: string): ShopResult {
  if (!isSkinId(skinId)) return { ok: false, reason: 'Diesen Skin gibt es nicht.' };
  if (save.skins.owned.includes(skinId)) return { ok: false, reason: 'Diesen Skin besitzt du schon.' };
  const skin = getSkin(skinId);
  if (save.coins < skin.price) return { ok: false, reason: `Dir fehlen noch 🪙 ${skin.price - save.coins}.` };
  const bought: SaveData = { ...save, coins: save.coins - skin.price, skins: { ...save.skins, owned: [...save.skins.owned, skinId] } };
  return { ok: true, save: equipSkin(bought, skinId) };
}

export function equipSkin(save: SaveData, skinId: string): SaveData {
  if (!isSkinId(skinId) || !save.skins.owned.includes(skinId)) return save;
  const kind: SkinKind = getSkin(skinId).kind;
  return { ...save, skins: { ...save.skins, [kind]: skinId } };
}
