// Rewards after a duel.
import { Outcome } from './battle';
import { RARITY_ORDER, getCard } from './cards';
import { Pick } from './runner';
import { SaveData } from './storage';

export const COINS = { win: 100, draw: 40, loss: 15, duplicateDiscovery: 50 } as const;

export interface Reward {
  coins: number;
  /** Newly unlocked card, if any. */
  newCard: string | null;
  /** A discovered card that was already owned, converted into coins. */
  duplicateCard: string | null;
}

export function computeReward(result: Outcome, picks: Pick[], unlocked: string[]): Reward {
  if (result === 'loss') return { coins: COINS.loss, newCard: null, duplicateCard: null };
  if (result === 'draw') return { coins: COINS.draw, newCard: null, duplicateCard: null };
  const owned = new Set(unlocked);
  const discoveries = picks.filter((p) => p.kind === 'discovery').map((p) => p.cardId);
  const fresh = [...new Set(discoveries.filter((id) => !owned.has(id)))]
    .sort((a, b) => RARITY_ORDER[getCard(b).rarity] - RARITY_ORDER[getCard(a).rarity]);
  if (fresh.length > 0) return { coins: COINS.win, newCard: fresh[0], duplicateCard: null };
  if (discoveries.length > 0) {
    return { coins: COINS.win + COINS.duplicateDiscovery, newCard: null, duplicateCard: discoveries[0] };
  }
  return { coins: COINS.win, newCard: null, duplicateCard: null };
}

export function applyReward(save: SaveData, result: Outcome, reward: Reward): SaveData {
  const statKey = result === 'win' ? 'wins' : result === 'draw' ? 'draws' : 'losses';
  return {
    ...save,
    coins: save.coins + reward.coins,
    unlocked: reward.newCard && !save.unlocked.includes(reward.newCard) ? [...save.unlocked, reward.newCard] : save.unlocked,
    stats: { ...save.stats, [statKey]: save.stats[statKey] + 1, runs: save.stats.runs + 1 },
  };
}
