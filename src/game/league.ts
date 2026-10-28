// Fair, traceable match setup for the leagues. Everything random comes from one match seed:
// the server publishes a fingerprint (SHA-256) before the match and reveals the seed afterwards,
// so anybody can recompute every offer, stone and rock and check that nothing was manipulated.
import { CARDS, CardDef, Rarity } from './cards';
import { Rng, createRng, shuffle } from './rng';
import { FIRST_GATE, GATE_COUNT, GATE_SPACING, Gate, LANES, Offer, RunnerLayout, generateObstacles } from './runner';
import { NORMAL_TERRAIN, randomRock } from './battle';
import { Terrain } from './effects';

/** Neutral discoveries: mid-strength cards only, the same for both players. */
export const NEUTRAL_RARITIES: Rarity[] = ['common', 'uncommon', 'rare'];
export const NEUTRAL_POWER: [min: number, max: number] = [17, 21];

/** FNV-1a: turns text into a 32-bit number (deterministic on every device and on the server). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Independent random stream for one purpose ("deck:alice", "stones", "rock:2", …). */
export function deriveRng(seed: string, label: string): Rng {
  return createRng(hashString(`${seed}|${label}`));
}

export function newMatchSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Public fingerprint of the seed (shown before the match). */
export async function seedFingerprint(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short code to show players, e.g. "7F3A-91C2". */
export function matchCode(seed: string): string {
  return `${seed.slice(0, 4)}-${seed.slice(4, 8)}`.toUpperCase();
}

export function neutralPool(): CardDef[] {
  return CARDS.filter((c) => {
    const sum = c.top + c.right + c.bottom + c.left;
    return c.inRunner !== false && NEUTRAL_RARITIES.includes(c.rarity) && sum >= NEUTRAL_POWER[0] && sum <= NEUTRAL_POWER[1];
  });
}

/** The 8 neutral discoveries of a match – identical for both players. */
export function neutralDiscoveries(seed: string): string[] {
  const pool = shuffle(deriveRng(seed, 'discoveries'), neutralPool().map((c) => c.id));
  if (pool.length === 0) throw new Error('Kein neutraler Entdeckungs-Pool');
  return Array.from({ length: GATE_COUNT }, (_, i) => pool[i % pool.length]);
}

/**
 * Deck cards come from the shuffled deck without putting them back (like drawing from a pile):
 * 2 per gate, 16 of 20 cards over a run. Two copies of one card are never offered at the same gate.
 */
export function deckPairs(deck: readonly string[], rng: Rng): [string, string][] {
  const pile = shuffle(rng, deck);
  const pairs: [string, string][] = [];
  while (pairs.length < GATE_COUNT && pile.length >= 2) {
    const a = pile.shift()!;
    let j = pile.findIndex((id) => id !== a);
    if (j < 0) j = 0;
    const [b] = pile.splice(j, 1);
    pairs.push([a, b]);
  }
  return pairs;
}

/**
 * League track for one player: every gate offers 2 cards from the own deck and 1 neutral discovery.
 * Stones and discoveries depend only on the seed, so both players run the same course.
 */
export function leagueLayout(seed: string, playerKey: string, deck: readonly string[]): RunnerLayout {
  const pairs = deckPairs(deck, deriveRng(seed, `deck:${playerKey}`));
  const discoveries = neutralDiscoveries(seed);
  const laneRng = deriveRng(seed, `lanes:${playerKey}`);
  const gates: Gate[] = pairs.map(([a, b], i) => {
    const offers: Offer[] = [
      { cardId: a, kind: 'deck' },
      { cardId: b, kind: 'deck' },
      { cardId: discoveries[i], kind: 'discovery' },
    ];
    return { index: i, distance: FIRST_GATE + i * GATE_SPACING, offers: shuffle(laneRng, offers).slice(0, LANES) };
  });
  return { gates, obstacles: generateObstacles(deriveRng(seed, 'stones')) };
}

/** The rock cell of a round (same rule for both players, recomputable from the seed) – always on a normal cell. */
export function roundRock(seed: string, round: number, terrain: readonly Terrain[] = NORMAL_TERRAIN): number {
  return randomRock(deriveRng(seed, `rock:${round}`), terrain);
}

/** Coin toss of a round from the seed (round 1 and every decider). */
export function roundToss(seed: string, round: number): 'player' | 'cpu' {
  return deriveRng(seed, `toss:${round}`)() < 0.5 ? 'player' : 'cpu';
}

