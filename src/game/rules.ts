// Rule sets per game mode. The adventure mode keeps its original rules; league rules are stricter
// for balance. Later the admin dashboard manages these values (they are plain data on purpose).
import { CARDS, DECK_SIZE, RARITY_LABEL, Rarity, getCard, isActiveCard } from './cards';

export interface DeckRules {
  size: number;
  /** Maximum copies of the same card id. */
  maxCopies: number;
  /** Maximum number of cards per rarity in one deck. */
  rarityLimits: Partial<Record<Rarity, number>>;
}

export interface RuleSet {
  id: 'adventure' | 'collection-league';
  name: string;
  deck: DeckRules;
  /** One random rock cell per duel (removes the second mover's advantage, no draws). */
  rock: boolean;
  /** Two rounds with swapped start, decider at 1:1. */
  bestOf: 1 | 3;
}

export const ADVENTURE_RULES: RuleSet = {
  id: 'adventure', name: 'Abenteuer',
  deck: { size: DECK_SIZE, maxCopies: 1, rarityLimits: {} },
  rock: false, bestOf: 1,
};

export const COLLECTION_LEAGUE_RULES: RuleSet = {
  id: 'collection-league', name: 'Collection League',
  deck: { size: DECK_SIZE, maxCopies: 2, rarityLimits: { mythic: 1, legendary: 1, epic: 4 } },
  rock: true, bestOf: 3,
};

/** How many copies of each card a player owns (offline: owned cards count as `maxCopies`). */
export type OwnedCounts = Record<string, number>;

export function countCards(deck: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of deck) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function rarityCounts(deck: readonly string[]): Record<Rarity, number> {
  const c: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  for (const id of deck) c[getCard(id).rarity]++;
  return c;
}

/** All rule violations of a deck in plain German (empty = valid). */
export function validateDeck(deck: readonly string[], rules: DeckRules, owned: OwnedCounts): string[] {
  const errors: string[] = [];
  if (deck.length !== rules.size) errors.push(`Das Deck braucht genau ${rules.size} Karten (aktuell ${deck.length}).`);
  for (const [id, n] of countCards(deck)) {
    if (!isActiveCard(id)) {
      errors.push(`Eine Karte ist zurzeit nicht im Spiel (${id}).`);
      continue;
    }
    const name = getCard(id).name;
    if (n > rules.maxCopies) errors.push(`„${name}“ ist ${n}× im Deck – erlaubt sind höchstens ${rules.maxCopies}.`);
    if (n > (owned[id] ?? 0)) errors.push(`Du besitzt „${name}“ nicht ${n}×.`);
  }
  const rc = rarityCounts(deck.filter(isActiveCard));
  for (const [rarity, limit] of Object.entries(rules.rarityLimits) as [Rarity, number][]) {
    if (rc[rarity] > limit) errors.push(`Höchstens ${limit} ${RARITY_LABEL[rarity].toLowerCase()}e Karte${limit === 1 ? "" : "n"} erlaubt (aktuell ${rc[rarity]}).`);
  }
  return errors;
}

/**
 * Builds a valid deck automatically: strongest owned cards first, respecting copies and
 * rarity limits. Returns fewer cards than required if the collection is too small.
 */
export function autoDeck(rules: DeckRules, owned: OwnedCounts): string[] {
  const sum = (id: string) => { const c = getCard(id); return c.top + c.right + c.bottom + c.left; };
  const candidates = CARDS.map((c) => c.id).filter((id) => (owned[id] ?? 0) > 0).sort((a, b) => sum(b) - sum(a) || a.localeCompare(b));
  const deck: string[] = [];
  const perRarity: Partial<Record<Rarity, number>> = {};
  for (let copy = 1; copy <= rules.maxCopies && deck.length < rules.size; copy++) {
    for (const id of candidates) {
      if (deck.length >= rules.size) break;
      if ((owned[id] ?? 0) < copy) continue;
      const r = getCard(id).rarity;
      const limit = rules.rarityLimits[r];
      if (limit !== undefined && (perRarity[r] ?? 0) >= limit) continue;
      deck.push(id);
      perRarity[r] = (perRarity[r] ?? 0) + 1;
    }
  }
  return deck;
}
