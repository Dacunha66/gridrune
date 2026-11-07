// Rewards after a duel.
// Simple game against the computer: coins only, depending on the chosen difficulty.
// Collection League (match against the computer, checked by the server): a won match unlocks a random card the
// player does not own yet (with the admin's rarity shares, drawn from the match seed); with none left, coins.
import { Outcome } from './battle';
import type { AiLevel } from './ai';
import { CARDS, pickByRarity } from './cards';
import { deriveRng } from './league';
import { SETTINGS } from './settings';
import { SaveData } from './storage';

/** Coins in the simple game per difficulty. */
export const AI_COINS: Record<AiLevel, Record<Outcome, number>> = {
  easy: { win: 30, draw: 10, loss: 5 },
  medium: { win: 50, draw: 20, loss: 10 },
  hard: { win: 100, draw: 40, loss: 15 },
};
/** Collection League: coins for a won match when every card is owned already. */
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

/**
 * Collection League match: only a won match pays – a random card not owned yet (rarity shares from the admin,
 * the same draw on every device for this match seed), else coins.
 */
export function leagueReward(won: boolean, seed: string, unlocked: readonly string[]): Reward {
  if (!won) return { coins: 0, newCard: null, duplicateCard: null };
  const owned = new Set(unlocked);
  // Cards the admin allows as a find ("Ranglisten-Belohnung", formerly the run's final gate).
  const fresh = CARDS.filter((c) => c.inRunner !== false && !owned.has(c.id));
  const rng = deriveRng(seed, 'league-reward');
  const card = pickByRarity(rng, fresh, SETTINGS.discoveryShares) ?? fresh[Math.floor(rng() * fresh.length)];
  return card ? { coins: 0, newCard: card.id, duplicateCard: null } : { coins: LEAGUE_NO_CARD_COINS, newCard: null, duplicateCard: null };
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
