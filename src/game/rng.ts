// Small seedable RNG so game logic is testable and reproducible.
export type Rng = () => number;

export function createRng(seed = Date.now()): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  let roll = rng() * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}
