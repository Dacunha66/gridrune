// Game settings an admin can change in the dashboard (stored in the card database, `settings/game`).
// The defaults are exactly the game's built-in values, so nothing changes until an admin saves.
import { RARITIES, Rarity } from './cards';

/** Who sees a new feature: nobody, only admins (test), or every player. */
export type Release = 'off' | 'admin' | 'all';
export const RELEASES: Release[] = ['off', 'admin', 'all'];

export interface GameSettings {
  /** Chance per rarity for the new cards in the runner's final gate (relative weights). */
  discoveryShares: Record<Rarity, number>;
  /** Kettenübernahme: further capture waves after the first capture (0 = unlimited). */
  chainDepth: number;
  /** Release of runes and of the abilities Wirbelwind / Kettenübernahme. */
  features: { runes: Release; abilities: Release };
}

export const DEFAULT_CHAIN_DEPTH = 2;
export const CHAIN_DEPTH_MAX = 15;

export const DEFAULT_DISCOVERY_SHARES: Readonly<Record<Rarity, number>> = { common: 28, uncommon: 30, rare: 24, epic: 12, legendary: 5, mythic: 1 };
export const SHARE_MAX = 1000;

export function defaultSettings(): GameSettings {
  return { discoveryShares: { ...DEFAULT_DISCOVERY_SHARES }, chainDepth: DEFAULT_CHAIN_DEPTH, features: { runes: 'admin', abilities: 'admin' } };
}

/** Settings currently used by the game; replaced in place by `setGameSettings`. */
export const SETTINGS: GameSettings = defaultSettings();

export function setGameSettings(s: GameSettings): void {
  SETTINGS.discoveryShares = { ...s.discoveryShares };
  SETTINGS.chainDepth = s.chainDepth;
  SETTINGS.features = { ...s.features };
}

/** Turns an untrusted settings document into valid settings (falls back to the defaults). */
export function parseSettings(raw: unknown): GameSettings {
  const out = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof r.chainDepth === 'number' && Number.isFinite(r.chainDepth)) out.chainDepth = Math.min(CHAIN_DEPTH_MAX, Math.max(0, Math.round(r.chainDepth)));
  const f = (r.features && typeof r.features === 'object' ? r.features : {}) as Record<string, unknown>;
  for (const k of ['runes', 'abilities'] as const) if (RELEASES.includes(f[k] as Release)) out.features[k] = f[k] as Release;
  const shares = r.discoveryShares as Record<string, unknown> | undefined;
  if (!shares || typeof shares !== 'object') return out;
  const parsed = { ...out.discoveryShares };
  for (const rar of RARITIES) {
    const v = shares[rar];
    if (typeof v === 'number' && Number.isFinite(v)) parsed[rar] = Math.min(SHARE_MAX, Math.max(0, Math.round(v * 10) / 10));
  }
  if (!RARITIES.every((rar) => parsed[rar] === 0)) out.discoveryShares = parsed;
  return out;
}

/** Does this viewer get a feature? */
export function released(release: Release, isAdmin: boolean): boolean {
  return release === 'all' || (release === 'admin' && isAdmin);
}

/** Share of each rarity in percent (rounded to one decimal). */
export function sharePercents(shares: Record<Rarity, number>): Record<Rarity, number> {
  const total = RARITIES.reduce((s, r) => s + shares[r], 0) || 1;
  return Object.fromEntries(RARITIES.map((r) => [r, Math.round((shares[r] / total) * 1000) / 10])) as Record<Rarity, number>;
}
