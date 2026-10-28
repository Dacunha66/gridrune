// Game settings an admin can change in the dashboard (stored in the card database, `settings/game`).
// The defaults are exactly the game's built-in values, so nothing changes until an admin saves.
import { RARITIES, Rarity } from './cards';

export interface GameSettings {
  /** Chance per rarity for the new cards in the runner's final gate (relative weights). */
  discoveryShares: Record<Rarity, number>;
}

export const DEFAULT_DISCOVERY_SHARES: Readonly<Record<Rarity, number>> = { common: 28, uncommon: 30, rare: 24, epic: 12, legendary: 5, mythic: 1 };
export const SHARE_MAX = 1000;

export function defaultSettings(): GameSettings {
  return { discoveryShares: { ...DEFAULT_DISCOVERY_SHARES } };
}

/** Settings currently used by the game; replaced in place by `setGameSettings`. */
export const SETTINGS: GameSettings = defaultSettings();

export function setGameSettings(s: GameSettings): void {
  SETTINGS.discoveryShares = { ...s.discoveryShares };
}

/** Turns an untrusted settings document into valid settings (falls back to the defaults). */
export function parseSettings(raw: unknown): GameSettings {
  const out = defaultSettings();
  const shares = (raw as { discoveryShares?: Record<string, unknown> } | null)?.discoveryShares;
  if (!shares || typeof shares !== 'object') return out;
  const parsed = { ...out.discoveryShares };
  for (const r of RARITIES) {
    const v = shares[r];
    if (typeof v === 'number' && Number.isFinite(v)) parsed[r] = Math.min(SHARE_MAX, Math.max(0, Math.round(v * 10) / 10));
  }
  if (RARITIES.every((r) => parsed[r] === 0)) return out;
  return { discoveryShares: parsed };
}

/** Share of each rarity in percent (rounded to one decimal). */
export function sharePercents(shares: Record<Rarity, number>): Record<Rarity, number> {
  const total = RARITIES.reduce((s, r) => s + shares[r], 0) || 1;
  return Object.fromEntries(RARITIES.map((r) => [r, Math.round((shares[r] / total) * 1000) / 10])) as Record<Rarity, number>;
}
