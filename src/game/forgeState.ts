// The Runenschmiede part of the save (kept apart from the forge rules so the save code can use it without a loop).
import { RARITIES, Rarity } from './cards';

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Cosmetic card frames (look only). The look lives in the stylesheet (`.frame-<id>`); the admin sets the price. */
export interface FrameDef {
  id: string;
  name: string;
  description: string;
  /** Paid with essence of this rarity. */
  rarity: Rarity;
  cost: number;
}

export const FORGE_FRAMES: FrameDef[] = [
  { id: 'fr-runen', name: 'Runenrahmen', description: 'Eingravierte Runen leuchten in den Ecken.', rarity: 'rare', cost: 6 },
  { id: 'fr-glut', name: 'Glutrahmen', description: 'Ein glühender Rand aus Schmiedefeuer.', rarity: 'epic', cost: 3 },
  { id: 'fr-sterne', name: 'Sternenrahmen', description: 'Silberne Sterne funkeln um die Karte.', rarity: 'legendary', cost: 2 },
];
const FRAME_IDS = new Set(FORGE_FRAMES.map((f) => f.id));
export const isFrameId = (v: unknown): v is string => typeof v === 'string' && FRAME_IDS.has(v);


export interface ForgeState {
  essence: Record<Rarity, number>;
  /** Duplicates waiting to be melted: card id → copies. */
  melt: Record<string, number>;
  /** Frames made in the forge and the one shown on the own cards (null = none). */
  frames: string[];
  frame: string | null;
}

export const MAX_ESSENCE = 1_000_000;
export const MAX_COPIES = 999;

export function emptyForge(): ForgeState {
  return { essence: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }, melt: {}, frames: [], frame: null };
}

export function sanitizeForge(raw: unknown): ForgeState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
  const base = emptyForge();
  for (const x of RARITIES) base.essence[x] = int(r.essence?.[x], 0, MAX_ESSENCE, 0);
  if (r.melt && typeof r.melt === 'object') {
    for (const [id, n] of Object.entries(r.melt as Record<string, unknown>).slice(0, 1000)) {
      const k = int(n, 0, MAX_COPIES, 0);
      if (k > 0 && /^[a-z]\d{1,4}$/.test(id)) base.melt[id] = k;
    }
  }
  base.frames = Array.isArray(r.frames) ? [...new Set(r.frames.filter(isFrameId))] as string[] : [];
  base.frame = isFrameId(r.frame) && base.frames.includes(r.frame) ? r.frame : null;
  return base;
}

