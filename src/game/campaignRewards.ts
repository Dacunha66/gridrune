// Phase 4c: campaign rewards are really paid out (signed-in players, on the server). Every reward has a key –
// first win of a mission, each earned star, each world milestone – and is paid exactly once. Stars earned before
// rewards existed are paid afterwards. Coins, cards and booster packs are paid; alternative illustrations,
// frames, titles, achievements and unlocks stay a preview until they exist in the game (they are not marked paid).
import { CampaignContent, Reward, STARS_PER_MISSION } from './campaign';
import { CampaignProgress, missionDone, starSlots, worldStars } from './campaignProgress';
import { getCard, isCardId } from './cards';
import { addDuplicate } from './forge';
import { PACKS, rollPack } from './shop';
import { Rng } from './rng';
import { SaveData } from './storage';

export interface OwedReward {
  key: string;
  reward: Reward;
  /** Where it comes from, for the message (e.g. "Waldpfad – 2. Stern"). */
  source: string;
}

/** What was actually added to the save. */
export interface GrantedReward {
  key: string;
  source: string;
  coins: number;
  /** Runensteine added. */
  stones?: number;
  /** New cards (unlocked). */
  cards: string[];
  /** Cards already owned – put into the melting pot of the Runenschmiede. */
  duplicates: string[];
  /** Card editions received (Puzzle-Events via the Postfach). */
  editions?: string[];
}

const PAYABLE = new Set<Reward['type']>(['coins', 'stones', 'card', 'pack']);

/** Rewards the player has earned but not received yet (only types that exist in the game). */
export function owedRewards(progress: CampaignProgress, content: CampaignContent): OwedReward[] {
  const paid = new Set(progress.paid ?? []);
  const out: OwedReward[] = [];
  const add = (key: string, reward: Reward | null, source: string) => {
    if (reward && PAYABLE.has(reward.type) && !paid.has(key)) out.push({ key, reward, source });
  };
  for (const m of content.missions) {
    if (m.status === 'draft') continue;
    if (missionDone(progress, m.id)) add(`first:${m.id}`, m.firstReward, `${m.name} – erster Sieg`);
    const slots = starSlots(progress, m);
    for (let i = 0; i < STARS_PER_MISSION; i++) if (slots[i]) add(`goal:${m.id}:${i}`, m.goalRewards[i] ?? null, `${m.name} – ${i + 1}. Stern`);
  }
  for (const w of content.worlds) {
    if (w.status === 'draft') continue;
    const stars = worldStars(content, progress, w.id);
    for (const ms of w.milestones) if (stars >= ms.stars) add(`ms:${w.id}:${ms.stars}:${ms.reward.type}`, ms.reward, `${w.name} – ${ms.stars} ★`);
  }
  return out;
}

/** Pays the owed rewards into the save (packs are opened with `rng`) and marks them paid in the progress. */
export function payRewards(save: SaveData, progress: CampaignProgress, owed: OwedReward[], rng: Rng): { save: SaveData; progress: CampaignProgress; granted: GrantedReward[] } {
  const r = grantRewards(save, owed, rng);
  const paid = [...new Set([...(progress.paid ?? []), ...owed.map((o) => o.key)])];
  return { save: r.save, progress: { ...progress, paid }, granted: r.granted };
}

/** Adds rewards to the save: coins, cards (already owned → melting pot), booster packs opened with `rng`. */
export function grantRewards(save: SaveData, owed: OwedReward[], rng: Rng): { save: SaveData; granted: GrantedReward[] } {
  let coins = save.coins;
  let forgeSave = save;
  let stones = save.stones;
  const unlocked = [...save.unlocked];
  const granted: GrantedReward[] = [];
  const give = (cardId: string, g: GrantedReward) => {
    if (!isCardId(cardId)) return;
    if (unlocked.includes(cardId)) {
      forgeSave = addDuplicate(forgeSave, cardId);
      g.duplicates.push(cardId);
    } else {
      unlocked.push(cardId);
      g.cards.push(cardId);
    }
  };
  for (const o of owed) {
    const g: GrantedReward = { key: o.key, source: o.source, coins: 0, cards: [], duplicates: [] };
    if (o.reward.type === 'coins') {
      g.coins += o.reward.amount ?? 0;
      coins += o.reward.amount ?? 0;
    } else if (o.reward.type === 'stones') {
      g.stones = (g.stones ?? 0) + (o.reward.amount ?? 0);
      stones += o.reward.amount ?? 0;
    } else if (o.reward.type === 'card' && o.reward.cardId) {
      give(o.reward.cardId, g);
    } else if (o.reward.type === 'pack') {
      const pack = PACKS.find((p) => p.id === o.reward.packId) ?? PACKS[0];
      for (let i = 0; i < (o.reward.amount ?? 1); i++) for (const id of rollPack(pack, rng)) give(id, g);
    }
    granted.push(g);
  }
  return { save: { ...save, coins, stones, unlocked, forge: forgeSave.forge }, granted };
}

/** Reward types that are really paid out (the others are previews until they exist in the game). */
export const isPayable = (r: Reward) => PAYABLE.has(r.type);

/** Short German summary, e.g. "🪙 250 · 2 neue Karten". */
export function grantedText(list: GrantedReward[]): string {
  const coins = list.reduce((n, g) => n + g.coins, 0);
  const stones = list.reduce((n, g) => n + (g.stones ?? 0), 0);
  const cards = list.flatMap((g) => g.cards);
  return [coins ? `🪙 ${coins}` : '', stones ? `${stones} Runensteine` : '', cards.length === 1 ? `neue Karte: ${getCard(cards[0]).name}` : cards.length > 1 ? `${cards.length} neue Karten` : '']
    .filter(Boolean).join(' · ') || 'nichts Neues';
}

