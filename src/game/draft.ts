// Draft League: the own collection does not matter. Both players get the same pool of 30 cards (drawn from the
// seed), each builds a secret deck of 20 from it, then runs a fair track built from that deck (same stones and
// neutral discoveries for both) and duels with the 8 collected cards. The deck is thrown away afterwards.
import { CARDS, CardDef, Rarity, cardPower } from './cards';
import { deriveRng, neutralDiscoveries } from './league';
import { shuffle } from './rng';
import { FIRST_GATE, FINISH_DISTANCE, GATE_COUNT, GATE_SPACING, Gate, LANES, Offer, Pick, RunInput, RunnerLayout, RunnerSim, generateObstacles, validateRunInputs } from './runner';
import type { HandCard } from './battle';

export const DRAFT_POOL_SIZE = 30;
export const DRAFT_DECK_SIZE = 20;
/** Pool plan: how many cards of each rarity (no mythic cards). */
export const DRAFT_POOL_PLAN: Partial<Record<Rarity, number>> = { common: 11, uncommon: 8, rare: 6, epic: 3, legendary: 2 };
/** Seconds for building the deck; afterwards the deck is completed with the strongest cards left. */
export const DRAFT_DECK_SECONDS = 180;
/** Seconds for deck building plus the run; afterwards the run counts as skipped (cards taken automatically). */
export const DRAFT_PREPARE_SECONDS = 420;
/** Coins for an online draft win. */
export const DRAFT_WIN_COINS = 150;

const FALLBACK: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Cards that may appear in a draft pool. */
export function draftCandidates(cards: readonly CardDef[] = CARDS): CardDef[] {
  return cards.filter((c) => !c.rewardOnly && c.inRunner !== false && c.rarity !== 'mythic');
}

/** The pool of a match – identical for both players, recomputable from the seed. Sorted by rarity, then name. */
export function draftPool(seed: string, cards: readonly CardDef[] = CARDS): string[] {
  const rng = deriveRng(seed, 'draft-pool');
  const candidates = draftCandidates(cards);
  const left = new Map<Rarity, CardDef[]>();
  for (const r of FALLBACK) left.set(r, shuffle(rng, candidates.filter((c) => c.rarity === r)));
  const pool: CardDef[] = [];
  for (const r of FALLBACK) {
    for (let i = 0; i < (DRAFT_POOL_PLAN[r] ?? 0); i++) {
      // Not enough cards of this rarity: take the next lower one that still has cards.
      const from = [r, ...FALLBACK.slice(0, FALLBACK.indexOf(r)).reverse(), ...FALLBACK.slice(FALLBACK.indexOf(r) + 1)].find((x) => left.get(x)!.length > 0);
      if (!from) break;
      pool.push(left.get(from)!.shift()!);
    }
  }
  const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  return pool.sort((a, b) => order[a.rarity] - order[b.rarity] || a.name.localeCompare(b.name)).map((c) => c.id);
}

export function validDraftDeck(deck: unknown, pool: readonly string[]): deck is string[] {
  if (!Array.isArray(deck) || deck.length !== DRAFT_DECK_SIZE || new Set(deck).size !== DRAFT_DECK_SIZE) return false;
  const inPool = new Set(pool);
  return deck.every((id) => typeof id === 'string' && inPool.has(id));
}

const power = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  return c ? cardPower(c) : 0;
};

/** Completes a deck with the strongest pool cards not chosen yet (used when the time runs out, and for the computer). */
export function completeDraftDeck(pool: readonly string[], chosen: readonly string[] = []): string[] {
  const deck = [...new Set(chosen.filter((id) => pool.includes(id)))].slice(0, DRAFT_DECK_SIZE);
  for (const id of [...pool].sort((a, b) => power(b) - power(a) || a.localeCompare(b))) {
    if (deck.length >= DRAFT_DECK_SIZE) break;
    if (!deck.includes(id)) deck.push(id);
  }
  return deck;
}

const isLegendary = (id: string) => CARDS.find((c) => c.id === id)?.rarity === 'legendary';

/**
 * Deck cards for the gates: 2 per gate from the shuffled deck, 16 of 20 – every legendary card of the deck is
 * among them for sure (it is swapped in for a random other card if the shuffle left it out).
 */
export function draftPairs(deck: readonly string[], seed: string, seat: string): [string, string][] {
  const rng = deriveRng(seed, `draft-deck:${seat}`);
  const pile = shuffle(rng, deck);
  const used = GATE_COUNT * 2;
  for (let i = used; i < pile.length; i++) {
    if (!isLegendary(pile[i])) continue;
    const swappable = pile.slice(0, used).map((id, j) => (isLegendary(id) ? -1 : j)).filter((j) => j >= 0);
    if (swappable.length === 0) break;
    const j = swappable[Math.floor(rng() * swappable.length)];
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  return Array.from({ length: GATE_COUNT }, (_, g) => [pile[g * 2], pile[g * 2 + 1]] as [string, string]);
}

/** Track of one player: 2 own deck cards and 1 neutral discovery per gate; stones and discoveries are the same for both. */
export function draftLayout(seed: string, seat: string, deck: readonly string[]): RunnerLayout {
  const pairs = draftPairs(deck, seed, seat);
  const discoveries = neutralDiscoveries(seed);
  const laneRng = deriveRng(seed, `draft-lanes:${seat}`);
  const gates: Gate[] = pairs.map(([a, b], i) => {
    const offers: Offer[] = [{ cardId: a, kind: 'deck' }, { cardId: b, kind: 'deck' }, { cardId: discoveries[i], kind: 'discovery' }];
    return { index: i, distance: FIRST_GATE + i * GATE_SPACING, offers: shuffle(laneRng, offers).slice(0, LANES) };
  });
  return { gates, obstacles: generateObstacles(deriveRng(seed, 'stones')) };
}

export interface DraftRunLog {
  inputs: RunInput[];
  /** Draft runs cannot be skipped by the player; the server uses 0 when the time ran out. */
  skippedAt: number | null;
}

/** Replays a run on its track and returns the 8 cards (with stumble penalties) or why it is not valid. */
export function replayDraftRun(layout: RunnerLayout, log: DraftRunLog): { picks: Pick[]; error: string | null } {
  if (!log || !Array.isArray(log.inputs)) return { picks: [], error: 'Lauf fehlt' };
  const error = validateRunInputs(log.inputs);
  if (error) return { picks: [], error };
  const sim = new RunnerSim(layout);
  for (const inp of log.inputs) {
    if (log.skippedAt !== null && inp.d > log.skippedAt) return { picks: [], error: 'Eingabe nach dem Ende' };
    sim.advanceTo(inp.d);
    sim.setLane(inp.lane);
  }
  if (log.skippedAt !== null) {
    if (!Number.isFinite(log.skippedAt) || log.skippedAt < 0 || log.skippedAt > FINISH_DISTANCE) return { picks: [], error: 'Ende außerhalb der Strecke' };
    sim.advanceTo(log.skippedAt);
    sim.skipToEnd();
  } else sim.advanceTo(FINISH_DISTANCE);
  if (sim.picks.length !== GATE_COUNT) return { picks: [], error: 'Lauf unvollständig' };
  return { picks: sim.picks.slice(), error: null };
}

export const picksToHand = (picks: readonly Pick[]): HandCard[] => picks.map((p) => ({ cardId: p.cardId, mod: p.mod }));

/** The computer's run in the practice mode: at every gate it takes the strongest offer (no stumbling). */
export function computerDraftHand(layout: RunnerLayout): HandCard[] {
  return layout.gates.map((g) => {
    const best = [...g.offers].sort((a, b) => power(b.cardId) - power(a.cardId))[0];
    return { cardId: best.cardId, mod: 0 };
  });
}
