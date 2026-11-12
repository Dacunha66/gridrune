// Runenschmiede: duplicate cards are no longer turned into coins – they go into the melting pot (Schmelztiegel).
// The player melts them into essences (one kind per rarity) and uses them to make a wished-for card, to refine
// essences (4 → 1 of the next rarity), to get editions of ended events, missing puzzle fragments (running events, at
// most 2 per stage) and cosmetic card frames. The same rules run in the game (guests, offline) and on the server
// (signed-in players – the server decides).
import { CARDS, RARITIES, Rarity, getCard, isCardId } from './cards';
import { deriveRng } from './league';
import {
  EditionDef, PuzzleDef, StageInfo, allEditions, allPuzzles, currentStage, puzzlePhase, puzzleStages, totalPieces,
} from './puzzles';
import { SaveData } from './storage';
import { FORGE_FRAMES, FrameDef, ForgeState, MAX_COPIES, MAX_ESSENCE, emptyForge } from './forgeState';

export { FORGE_FRAMES, emptyForge, isFrameId, sanitizeForge } from './forgeState';
export type { FrameDef, ForgeState } from './forgeState';

export const FORGE_DOC = 'forge';

export const ESSENCE_NAME: Record<Rarity, string> = {
  common: 'Funkenessenz', uncommon: 'Glutessenz', rare: 'Kristallessenz', epic: 'Arkanessenz', legendary: 'Sonnenessenz', mythic: 'Sternenessenz',
};

export interface ForgeConfig {
  /** Essence of the card's own rarity for a wished-for card. */
  craft: Record<Rarity, number>;
  /** How many essences of one rarity make one of the next. */
  refine: number;
  /** A missing puzzle fragment (running events only). */
  fragment: { rarity: Rarity; cost: number; perStage: number };
  /** An edition of an ended event. */
  edition: { rarity: Rarity; cost: number };
  /** Frame prices by frame id (frames themselves are built in). */
  frames: Record<string, number>;
}

export const DEFAULT_FORGE: ForgeConfig = {
  craft: { common: 3, uncommon: 3, rare: 3, epic: 4, legendary: 4, mythic: 5 },
  refine: 4,
  fragment: { rarity: 'rare', cost: 2, perStage: 2 },
  edition: { rarity: 'mythic', cost: 2 },
  frames: Object.fromEntries(FORGE_FRAMES.map((f) => [f.id, f.cost])),
};

let CONFIG: ForgeConfig = structuredClone(DEFAULT_FORGE);
export function forgeConfig(): ForgeConfig {
  return CONFIG;
}
export function setForgeConfig(c: ForgeConfig): void {
  CONFIG = c;
}

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const rarity = (v: unknown, fallback: Rarity): Rarity => (RARITIES.includes(v as Rarity) ? v as Rarity : fallback);

/** Turns an untrusted `settings/forge` document into the configuration (bad values → defaults). */
export function parseForgeDoc(raw: unknown): ForgeConfig {
  const d = DEFAULT_FORGE;
  const r = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
  const craft = Object.fromEntries(RARITIES.map((x) => [x, int(r.craft?.[x], 1, 999, d.craft[x])])) as Record<Rarity, number>;
  const frames = Object.fromEntries(FORGE_FRAMES.map((f) => [f.id, int(r.frames?.[f.id], 1, 999, d.frames[f.id])]));
  return {
    craft,
    refine: int(r.refine, 2, 20, d.refine),
    fragment: { rarity: rarity(r.fragment?.rarity, d.fragment.rarity), cost: int(r.fragment?.cost, 1, 999, d.fragment.cost), perStage: int(r.fragment?.perStage, 0, 20, d.fragment.perStage) },
    edition: { rarity: rarity(r.edition?.rarity, d.edition.rarity), cost: int(r.edition?.cost, 1, 999, d.edition.cost) },
    frames,
  };
}

export function forgeToDoc(c: ForgeConfig): Record<string, unknown> {
  return structuredClone(c) as unknown as Record<string, unknown>;
}

export const frameCost = (f: FrameDef, c: ForgeConfig = CONFIG) => c.frames[f.id] ?? f.cost;

export type ForgeResult<T = object> = ({ ok: true; save: SaveData } & T) | { ok: false; reason: string };

const withForge = (save: SaveData, forge: Partial<ForgeState>): SaveData => ({ ...save, forge: { ...save.forge, ...forge } });
const pay = (save: SaveData, r: Rarity, n: number): SaveData => withForge(save, { essence: { ...save.forge.essence, [r]: save.forge.essence[r] - n } });
const short = (save: SaveData, r: Rarity, n: number) => `Dir fehlen noch ${n - save.forge.essence[r]} ${ESSENCE_NAME[r]}.`;

/** A card the player already owns goes into the melting pot (instead of coins). */
export function addDuplicate(save: SaveData, cardId: string): SaveData {
  const n = Math.min(MAX_COPIES, (save.forge.melt[cardId] ?? 0) + 1);
  return withForge(save, { melt: { ...save.forge.melt, [cardId]: n } });
}

/** Number of duplicates in the melting pot. */
export const meltCount = (save: SaveData) => Object.values(save.forge.melt).reduce((a, b) => a + b, 0);

/** Essence each duplicate in the pot would give (only cards the game knows). */
export function meltPreview(save: SaveData, ids?: readonly string[]): Record<Rarity, number> {
  const out = emptyForge().essence;
  for (const [id, n] of Object.entries(save.forge.melt)) if ((!ids || ids.includes(id)) && isCardId(id)) out[getCard(id).rarity] += n;
  return out;
}

/** Melts duplicates: one essence of the card's rarity per copy. `ids` = these cards only, otherwise all. */
export function meltCards(save: SaveData, ids?: unknown): ForgeResult<{ gained: Record<Rarity, number> }> {
  const only = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : undefined;
  const gained = meltPreview(save, only);
  if (RARITIES.every((r) => gained[r] === 0)) return { ok: false, reason: 'Im Schmelztiegel liegt nichts.' };
  const melt = { ...save.forge.melt };
  for (const id of Object.keys(melt)) if ((!only || only.includes(id)) && isCardId(id)) delete melt[id];
  const essence = { ...save.forge.essence };
  for (const r of RARITIES) essence[r] = Math.min(MAX_ESSENCE, essence[r] + gained[r]);
  return { ok: true, gained, save: withForge(save, { melt, essence }) };
}

/** Refines essence: `refine` of one rarity → 1 of the next (`times` at once). */
export function refineEssence(save: SaveData, from: unknown, times: unknown = 1, c: ForgeConfig = CONFIG): ForgeResult<{ to: Rarity; amount: number }> {
  const i = RARITIES.indexOf(from as Rarity);
  if (i < 0 || i >= RARITIES.length - 1) return { ok: false, reason: 'Diese Essenz lässt sich nicht veredeln.' };
  const r = from as Rarity;
  const n = int(times, 1, 10000, 1);
  if (save.forge.essence[r] < c.refine * n) return { ok: false, reason: short(save, r, c.refine * n) };
  const to = RARITIES[i + 1];
  const s = pay(save, r, c.refine * n);
  return { ok: true, to, amount: n, save: withForge(s, { essence: { ...s.forge.essence, [to]: Math.min(MAX_ESSENCE, s.forge.essence[to] + n) } }) };
}

/** Cards that can be made: every booster card the player does not own yet (never reward-only cards). */
export function craftableCards(save: SaveData): string[] {
  const owned = new Set(save.unlocked);
  return CARDS.filter((card) => !card.rewardOnly && !owned.has(card.id)).map((card) => card.id);
}

export const craftCost = (cardId: string, c: ForgeConfig = CONFIG) => c.craft[getCard(cardId).rarity];

/** Makes a wished-for card from essence of its rarity. */
export function craftCard(save: SaveData, cardId: unknown, c: ForgeConfig = CONFIG): ForgeResult<{ cardId: string }> {
  if (typeof cardId !== 'string' || !isCardId(cardId)) return { ok: false, reason: 'Diese Karte gibt es nicht.' };
  if (save.unlocked.includes(cardId)) return { ok: false, reason: 'Diese Karte hast du schon.' };
  if (!craftableCards(save).includes(cardId)) return { ok: false, reason: 'Diese Karte kann man nicht schmieden.' };
  const r = getCard(cardId).rarity;
  const cost = c.craft[r];
  if (save.forge.essence[r] < cost) return { ok: false, reason: short(save, r, cost) };
  const s = pay(save, r, cost);
  return { ok: true, cardId, save: { ...s, unlocked: [...s.unlocked, cardId] } };
}

/**
 * Editions that can be made: the stage editions of events that have ended (or are archived) – never one of a running
 * or planned event (those stay the event's reward) – that the player does not own yet and whose card exists.
 */
export function craftableEditions(save: SaveData, now: Date = new Date(), puzzles: readonly PuzzleDef[] = allPuzzles()): EditionDef[] {
  const running = new Set<string>();
  const past = new Set<string>();
  for (const p of puzzles) {
    const phase = puzzlePhase(p, now);
    const ids = puzzleStages(p).map((st) => st.editionId);
    if (phase === 'ended' || phase === 'archived') ids.forEach((id) => past.add(id));
    else ids.forEach((id) => running.add(id));
  }
  return allEditions().filter((e) => past.has(e.id) && !running.has(e.id) && !save.editions.owned.includes(e.id) && isCardId(e.cardId));
}

export function craftEdition(save: SaveData, editionId: unknown, now: Date = new Date(), c: ForgeConfig = CONFIG): ForgeResult<{ editionId: string }> {
  const e = craftableEditions(save, now).find((x) => x.id === editionId);
  if (!e) return { ok: false, reason: 'Diese Edition kann man nicht schmieden.' };
  const { rarity: r, cost } = c.edition;
  if (save.forge.essence[r] < cost) return { ok: false, reason: short(save, r, cost) };
  const s = pay(save, r, cost);
  return { ok: true, editionId: e.id, save: { ...s, editions: { ...s.editions, owned: [...s.editions.owned, e.id] } } };
}

export function buyFrame(save: SaveData, frameId: unknown, c: ForgeConfig = CONFIG): ForgeResult<{ frameId: string }> {
  const f = FORGE_FRAMES.find((x) => x.id === frameId);
  if (!f) return { ok: false, reason: 'Diesen Rahmen gibt es nicht.' };
  if (save.forge.frames.includes(f.id)) return { ok: false, reason: 'Diesen Rahmen hast du schon.' };
  const cost = frameCost(f, c);
  if (save.forge.essence[f.rarity] < cost) return { ok: false, reason: short(save, f.rarity, cost) };
  const s = pay(save, f.rarity, cost);
  return { ok: true, frameId: f.id, save: withForge(s, { frames: [...s.forge.frames, f.id], frame: f.id }) };
}

/** Shows an owned frame on the own cards (null = none). A choice of the device – no server needed. */
export function equipFrame(save: SaveData, frameId: string | null): SaveData {
  return withForge(save, { frame: frameId && save.forge.frames.includes(frameId) ? frameId : null });
}

// ---------- Puzzle fragments ----------

/** Claim key of the n-th fragment made for a stage (run-scoped, so a new run starts again). */
export const fragmentKey = (p: PuzzleDef, stage: number, n: number) => `${p.run.id}:forge:${stage}:f${n}`;

/** How many fragments may still be made for the stage the player is collecting (0 = none, or no running stage). */
export function fragmentsLeft(p: PuzzleDef, have: readonly number[], claimed: readonly string[], now: Date = new Date(), c: ForgeConfig = CONFIG): { stage: StageInfo | null; left: number } {
  const stage = puzzlePhase(p, now) === 'active' ? currentStage(p, have) : null;
  if (!stage) return { stage: null, left: 0 };
  const used = claimed.filter((k) => k.startsWith(`${p.run.id}:forge:${stage.index}:`)).length;
  return { stage, left: Math.max(0, c.fragment.perStage - used) };
}

/**
 * One missing fragment of the stage being collected, for essence. Returns the claim (key, piece, total) and the save
 * with the essence paid – and the stage's edition when the fragment completes it.
 */
export function forgeFragment(save: SaveData, p: PuzzleDef, have: readonly number[], claimed: readonly string[], seed: string, now: Date = new Date(), c: ForgeConfig = CONFIG):
  { ok: true; key: string; piece: number; total: number; save: SaveData } | { ok: false; reason: string } {
  const { stage, left } = fragmentsLeft(p, have, claimed, now, c);
  if (!stage) return { ok: false, reason: 'Für dieses Event kann man keine Fragmente schmieden.' };
  if (left <= 0) return { ok: false, reason: `Für diese Stufe hast du schon ${c.fragment.perStage} Fragmente geschmiedet.` };
  const { rarity: r, cost } = c.fragment;
  if (save.forge.essence[r] < cost) return { ok: false, reason: short(save, r, cost) };
  const own = new Set(have);
  const free = Array.from({ length: stage.pieces }, (_, i) => stage.offset + i).filter((i) => !own.has(i));
  if (!free.length) return { ok: false, reason: 'Diese Stufe ist schon vollständig.' };
  const piece = free[Math.floor(deriveRng(seed, `forge:${p.id}`)() * free.length)];
  const used = c.fragment.perStage - left;
  // A stage completed this way: its card comes into the Postfach (server function "events"), like any other stage.
  const s = pay(save, r, cost);
  return { ok: true, key: fragmentKey(p, stage.index, used + 1), piece, total: totalPieces(p), save: s };
}
