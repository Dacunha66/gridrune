// Rewards after a duel.
// Simple game against the computer: coins only, depending on the chosen difficulty.
// Collection League (match against the computer, checked by the server): a won match unlocks the rarest new
// discovery from the run; if none of the collected discoveries is new, there are coins instead.
import { Outcome } from './battle';
import type { AiLevel } from './ai';
import { RARITY_ORDER, getCard } from './cards';
import { Pick } from './runner';
import { SaveData } from './storage';

/** Coins in the simple game per difficulty. */
export const AI_COINS: Record<AiLevel, Record<Outcome, number>> = {
  easy: { win: 30, draw: 10, loss: 5 },
  medium: { win: 50, draw: 20, loss: 10 },
  hard: { win: 100, draw: 40, loss: 15 },
};
/** Collection League: coins for a won match when no collected discovery is new. */
export const LEAGUE_NO_CARD_COINS = 50;

export interface Reward {
  coins: number;
  /** Newly unlocked card, if any. */
  newCard: string | null;
  /** A discovered card that was already owned, converted into coins. */
  duplicateCard: string | null;
}

export const isAiLevel = (v: unknown): v is AiLevel => v === 'easy' || v === 'medium' || v === 'hard';

/** Simple game: coins by difficulty, never a card. */
export function computeReward(result: Outcome, level: AiLevel = 'medium'): Reward {
  return { coins: AI_COINS[isAiLevel(level) ? level : 'medium'][result], newCard: null, duplicateCard: null };
}

/** Collection League match: only a won match pays – the rarest new discovery, else coins. */
export function leagueReward(won: boolean, picks: Pick[], unlocked: string[]): Reward {
  if (!won) return { coins: 0, newCard: null, duplicateCard: null };
  const owned = new Set(unlocked);
  const discoveries = picks.filter((p) => p.kind === 'discovery').map((p) => p.cardId);
  const fresh = [...new Set(discoveries.filter((id) => !owned.has(id)))]
    .sort((a, b) => RARITY_ORDER[getCard(b).rarity] - RARITY_ORDER[getCard(a).rarity] || a.localeCompare(b));
  if (fresh.length > 0) return { coins: 0, newCard: fresh[0], duplicateCard: null };
  return { coins: LEAGUE_NO_CARD_COINS, newCard: null, duplicateCard: discoveries[0] ?? null };
}

export function applyReward(save: SaveData, result: Outcome, reward: Reward): SaveData {
  const statKey = result === 'win' ? 'wins' : result === 'draw' ? 'draws' : 'losses';
  return {
    ...grant(save, reward),
    stats: { ...save.stats, [statKey]: save.stats[statKey] + 1, runs: save.stats.runs + 1 },
  };
}

/** Adds coins and the new card (league: the match statistics of the simple game stay as they are). */
export function grant(save: SaveData, reward: Reward): SaveData {
  return {
    ...save,
    coins: save.coins + reward.coins,
    unlocked: reward.newCard && !save.unlocked.includes(reward.newCard) ? [...save.unlocked, reward.newCard] : save.unlocked,
  };
}
