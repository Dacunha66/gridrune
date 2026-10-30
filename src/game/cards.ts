// All 100 cards of GridRune. Names and art are original placeholders.
// Strength follows rarity: each rarity has a fixed range for the sum of the four values.
import { Rng, pickWeighted } from './rng';
import { CardClass, EFFECTS, EffectId } from './effects';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** Allowed range for the sum of the four values, per rarity. */
export const RARITY_POWER: Record<Rarity, [min: number, max: number]> = {
  common: [13, 16], uncommon: [17, 19], rare: [20, 22], epic: [23, 25], legendary: [26, 28], mythic: [29, 32],
};

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Directional values 1–10. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Placeholder illustration (emoji) and background hue. */
  art: string;
  hue: number;
  /** Optional picture (URL or data URI). Shown instead of the emoji; cards are 3:4 portrait. */
  image?: string;
  /** Small copy of the picture for hand, board and lists (loads much faster); falls back to `image`. */
  thumb?: string;
  /** Optional flavour text, shown in the card details. */
  description?: string;
  /** false: never offered as a new card in the runner (default true). */
  inRunner?: boolean;
  /** true: only obtainable as a duel reward – never in booster packs (default false). */
  rewardOnly?: boolean;
  /** Class (Krieger, Magier, …). On the terrain of its element the card gets +1 (see CLASS_TERRAIN). */
  cls?: CardClass;
  /** At most one special effect from the central list (effects.ts). */
  effect?: EffectId;
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Gewöhnlich',
  uncommon: 'Ungewöhnlich',
  rare: 'Selten',
  epic: 'Episch',
  legendary: 'Legendär',
  mythic: 'Mystisch',
};

export const RARITY_ORDER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

type Row = [id: string, name: string, rarity: Rarity, t: number, r: number, b: number, l: number, art: string, hue: number];

// [top, right, bottom, left]
const ROWS: Row[] = [
  // Gewöhnlich (30) – Wertesumme 13–16
  ['c01', 'Moosling', 'common', 4, 2, 3, 6, '🌿', 110],
  ['c02', 'Funkenwicht', 'common', 6, 5, 1, 4, '✨', 50],
  ['c03', 'Kieselkrabbe', 'common', 2, 5, 4, 2, '🦀', 15],
  ['c04', 'Nebelmotte', 'common', 4, 2, 5, 4, '🦋', 260],
  ['c05', 'Dornenigel', 'common', 1, 4, 4, 4, '🦔', 30],
  ['c06', 'Sumpfunke', 'common', 4, 4, 3, 4, '🐸', 130],
  ['c07', 'Glutkäfer', 'common', 6, 2, 4, 2, '🐞', 0],
  ['c08', 'Windhase', 'common', 3, 7, 1, 5, '🐇', 190],
  ['c09', 'Pilzwächter', 'common', 4, 4, 5, 2, '🍄', 340],
  ['c10', 'Eisspatz', 'common', 6, 2, 2, 4, '🐦', 200],
  ['c11', 'Rindenwurm', 'common', 1, 4, 6, 4, '🪱', 25],
  ['c12', 'Schlammschnecke', 'common', 4, 4, 4, 2, '🐌', 70],
  ['c13', 'Dämmerfledermaus', 'common', 5, 1, 3, 5, '🦇', 280],
  ['c14', 'Bernsteinfuchs', 'common', 3, 4, 2, 4, '🦊', 35],
  ['c15', 'Flussotter', 'common', 2, 4, 6, 3, '🦦', 180],
  ['c16', 'Felsbock', 'common', 7, 4, 1, 4, '🐐', 45],
  ['c17', 'Wurzelkobold', 'common', 4, 3, 2, 4, '🌱', 100],
  ['c18', 'Grillenbarde', 'common', 4, 1, 5, 5, '🦗', 80],
  ['c19', 'Moospanzer', 'common', 4, 3, 6, 2, '🐢', 150],
  ['c20', 'Staubmaus', 'common', 4, 3, 4, 3, '🐭', 30],
  ['c21', 'Zapfenwicht', 'common', 2, 4, 5, 2, '🌰', 25],
  ['c22', 'Federling', 'common', 5, 2, 3, 3, '🪶', 200],
  ['c23', 'Netzweberin', 'common', 4, 6, 3, 2, '🕸️', 270],
  ['c24', 'Borstenkeiler', 'common', 5, 3, 2, 5, '🐗', 20],
  ['c25', 'Muschelwächter', 'common', 4, 6, 3, 3, '🐚', 190],
  ['c26', 'Laternenkäfer', 'common', 5, 5, 2, 3, '🪲', 50],
  ['c27', 'Rabenbote', 'common', 3, 5, 1, 5, '🐦‍⬛', 260],
  ['c28', 'Distelbock', 'common', 5, 2, 2, 4, '🌾', 70],
  ['c29', 'Pfützengeist', 'common', 3, 5, 5, 3, '💧', 210],
  ['c30', 'Hornschaf', 'common', 3, 4, 6, 2, '🐑', 40],
  // Ungewöhnlich (24) – Wertesumme 17–19
  ['u01', 'Dachsritter', 'uncommon', 5, 5, 5, 4, '🦡', 30],
  ['u02', 'Sumpfkaiman', 'uncommon', 4, 5, 4, 4, '🐊', 140],
  ['u03', 'Flamingoseherin', 'uncommon', 7, 3, 5, 4, '🦩', 330],
  ['u04', 'Pfauenmagier', 'uncommon', 2, 6, 5, 5, '🦚', 160],
  ['u05', 'Papageienpirat', 'uncommon', 4, 6, 5, 4, '🦜', 110],
  ['u06', 'Schwanenmaid', 'uncommon', 5, 3, 7, 4, '🦢', 200],
  ['u07', 'Eichhornspäher', 'uncommon', 3, 6, 3, 6, '🐿️', 25],
  ['u08', 'Biberbaumeister', 'uncommon', 2, 5, 5, 5, '🦫', 30],
  ['u09', 'Hirschwächter', 'uncommon', 4, 5, 5, 3, '🦌', 35],
  ['u10', 'Kaktusgolem', 'uncommon', 3, 3, 4, 7, '🌵', 100],
  ['u11', 'Sonnenblumenhexe', 'uncommon', 3, 6, 3, 5, '🌻', 50],
  ['u12', 'Herbstgeist', 'uncommon', 3, 5, 4, 5, '🍁', 20],
  ['u13', 'Kleeblattfee', 'uncommon', 6, 5, 5, 1, '🍀', 120],
  ['u14', 'Bienenkönigin', 'uncommon', 3, 6, 7, 3, '🐝', 48],
  ['u15', 'Ameisenkrieger', 'uncommon', 5, 4, 6, 3, '🐜', 10],
  ['u16', 'Scherenkrebs', 'uncommon', 5, 4, 3, 7, '🦞', 5],
  ['u17', 'Kugelfisch', 'uncommon', 4, 5, 6, 4, '🐡', 190],
  ['u18', 'Riffschwimmer', 'uncommon', 6, 6, 5, 1, '🐠', 185],
  ['u19', 'Seehundbarde', 'uncommon', 4, 4, 5, 4, '🦭', 210],
  ['u20', 'Lehmgolem', 'uncommon', 5, 7, 3, 4, '🗿', 30],
  ['u21', 'Bogenschützin', 'uncommon', 5, 6, 2, 6, '🏹', 90],
  ['u22', 'Schildträger', 'uncommon', 6, 3, 6, 2, '🛡️', 220],
  ['u23', 'Kerzenwächter', 'uncommon', 7, 3, 5, 3, '🕯️', 45],
  ['u24', 'Knochensammler', 'uncommon', 5, 4, 5, 4, '🦴', 40],
  // Selten (20) – Wertesumme 20–22
  ['r01', 'Klingenfalke', 'rare', 7, 5, 3, 5, '🦅', 40],
  ['r02', 'Runenwolf', 'rare', 5, 6, 5, 4, '🐺', 220],
  ['r03', 'Kristallskorpion', 'rare', 3, 5, 7, 6, '🦂', 300],
  ['r04', 'Sturmross', 'rare', 5, 8, 3, 5, '🐎', 210],
  ['r05', 'Irrlichthexe', 'rare', 7, 3, 5, 5, '🧙', 270],
  ['r06', 'Eichenhüter', 'rare', 5, 5, 5, 5, '🌳', 120],
  ['r07', 'Lavaechse', 'rare', 8, 4, 5, 4, '🦎', 10],
  ['r08', 'Gezeitenschlange', 'rare', 3, 5, 5, 7, '🐍', 170],
  ['r09', 'Schattenluchs', 'rare', 5, 3, 8, 5, '🐆', 250],
  ['r10', 'Mondeule', 'rare', 6, 6, 3, 6, '🦉', 230],
  ['r11', 'Frostbär', 'rare', 7, 5, 5, 5, '🐻', 195],
  ['r12', 'Knochenritter', 'rare', 4, 7, 6, 5, '💀', 0],
  ['r13', 'Haifischjäger', 'rare', 5, 7, 6, 4, '🦈', 200],
  ['r14', 'Delfinrufer', 'rare', 5, 5, 4, 7, '🐬', 195],
  ['r15', 'Elfenwaldläuferin', 'rare', 7, 3, 4, 8, '🧝', 120],
  ['r16', 'Tiefenmaid', 'rare', 3, 4, 8, 5, '🧜', 185],
  ['r17', 'Funkenfee', 'rare', 6, 6, 2, 6, '🧚', 300],
  ['r18', 'Nebelgeist', 'rare', 5, 5, 6, 6, '👻', 240],
  ['r19', 'Säbelzahn', 'rare', 8, 4, 5, 5, '🐅', 30],
  ['r20', 'Bisonwalze', 'rare', 6, 4, 4, 6, '🦬', 25],
  // Episch (14) – Wertesumme 23–25
  ['e01', 'Aschenphönix', 'epic', 7, 6, 5, 6, '🔥', 20],
  ['e02', 'Tiefseekraken', 'epic', 4, 8, 7, 6, '🐙', 285],
  ['e03', 'Donnertitan', 'epic', 9, 4, 6, 6, '⚡', 55],
  ['e04', 'Sternenweberin', 'epic', 5, 7, 5, 6, '🌌', 245],
  ['e05', 'Smaragddrache', 'epic', 6, 6, 4, 8, '🐉', 140],
  ['e06', 'Grabkönig', 'epic', 6, 4, 8, 6, '👑', 300],
  ['e07', 'Spiegelgolem', 'epic', 6, 6, 6, 6, '🪞', 190],
  ['e08', 'Wüstensphinx', 'epic', 4, 9, 5, 5, '🦁', 40],
  ['e09', 'Vampirgraf', 'epic', 6, 5, 6, 6, '🧛', 340],
  ['e10', 'Flaschengeist', 'epic', 5, 6, 7, 5, '🧞', 220],
  ['e11', 'Sturmbringer', 'epic', 9, 4, 6, 5, '🌪️', 210],
  ['e12', 'Kristallorakel', 'epic', 5, 4, 8, 8, '🔮', 280],
  ['e13', 'Meteorreiter', 'epic', 6, 6, 6, 6, '☄️', 20],
  ['e14', 'Mammutfürst', 'epic', 6, 6, 6, 5, '🦣', 25],
  // Legendär (8) – Wertesumme 26–28
  ['l01', 'Himmelswal', 'legendary', 8, 7, 6, 7, '🐋', 205],
  ['l02', 'Chronomagier', 'legendary', 6, 9, 7, 5, '⏳', 45],
  ['l03', 'Weltenbaum-Avatar', 'legendary', 7, 5, 9, 6, '🌲', 125],
  ['l04', 'Nachtdrachin Vyrax', 'legendary', 10, 6, 4, 7, '🌑', 265],
  ['l05', 'Vulkanherz', 'legendary', 9, 7, 7, 3, '🌋', 10],
  ['l06', 'Ozeanwächter', 'legendary', 6, 10, 5, 7, '🌊', 200],
  ['l07', 'Sonnenkönig', 'legendary', 6, 5, 5, 10, '☀️', 45],
  ['l08', 'Urzeitrex', 'legendary', 7, 6, 10, 5, '🦖', 120],
  // Mystisch (4) – Wertesumme 29–32
  ['m01', 'Aurora-Schlange', 'mythic', 7, 7, 6, 9, '🌈', 300],
  ['m02', 'Mondweberin Lyra', 'mythic', 6, 10, 10, 5, '🌙', 250],
  ['m03', 'Himmelsschmied', 'mythic', 7, 5, 8, 10, '⚒️', 30],
  ['m04', 'Urdrache Ignivor', 'mythic', 10, 4, 5, 10, '🐲', 0],
];

/** Suggested class per card (by name and picture). Cards not listed here start as Krieger. */
export const SUGGESTED_CLASS: Record<string, CardClass> = {
  ...Object.fromEntries('c03 c05 c16 c24 c30 u01 u02 u05 u15 u16 u20 u21 u22 r01 r04 r13 r19 r20 e03 e08 e14 l08 m03'.split(' ').map((id) => [id, 'krieger' as CardClass])),
  ...Object.fromEntries('c18 c22 u03 u04 u11 u13 u19 r02 r05 r17 e04 e07 e10 e11 e12 l02 l07 m01 m02 k001'.split(' ').map((id) => [id, 'magier' as CardClass])),
  ...Object.fromEntries('c01 c06 c08 c09 c11 c12 c14 c17 c19 c20 c21 c28 u06 u07 u08 u09 u10 u12 u14 r06 r15 e05 l03'.split(' ').map((id) => [id, 'natur' as CardClass])),
  ...Object.fromEntries('c02 c07 c26 u23 r07 e01 e13 l05 m04'.split(' ').map((id) => [id, 'feuer' as CardClass])),
  ...Object.fromEntries('c10 c15 c25 c29 u17 u18 r08 r11 r14 r16 e02 l01 l06'.split(' ').map((id) => [id, 'frost' as CardClass])),
  ...Object.fromEntries('c04 c13 c23 c27 u24 r03 r09 r10 r12 r18 e06 e09 l04'.split(' ').map((id) => [id, 'schatten' as CardClass])),
};

export function suggestedClass(id: string): CardClass {
  return SUGGESTED_CLASS[id] ?? 'krieger';
}

/** The 100 cards shipped with the game – used when no card database is reachable. */
export const BUILTIN_CARDS: readonly CardDef[] = ROWS.map(([id, name, rarity, top, right, bottom, left, art, hue]) => ({
  id, name, rarity, top, right, bottom, left, art, hue, cls: suggestedClass(id),
}));

/**
 * Cards currently in play (active). Updated in place by `setCardCatalog`, so every
 * game system that reads CARDS automatically uses cards managed in the admin dashboard.
 */
export const CARDS: CardDef[] = [...BUILTIN_CARDS];

/** Every known card, including drafts and disabled ones, so old saves still render. */
const BY_ID = new Map<string, CardDef>(BUILTIN_CARDS.map((c) => [c.id, c]));

/**
 * Replaces the card catalog: `active` are the cards in play, `known` additionally
 * contains disabled/draft cards that players may still own.
 */
export function setCardCatalog(active: readonly CardDef[], known: readonly CardDef[] = active): void {
  CARDS.splice(0, CARDS.length, ...active);
  BY_ID.clear();
  for (const c of BUILTIN_CARDS) BY_ID.set(c.id, c);
  for (const c of known) BY_ID.set(c.id, c);
  for (const c of active) BY_ID.set(c.id, c);
}

export function isActiveCard(id: string): boolean {
  return CARDS.some((c) => c.id === id);
}

/** Shape of every card id (built-in c01…m04, dashboard cards k001…). */
export const CARD_ID_RE = /^[a-z]\d{2,4}$/;

/** True for any well-formed id – also for cards that are not loaded yet (e.g. from the database). */
export function isPlausibleCardId(id: unknown): id is string {
  return typeof id === 'string' && CARD_ID_RE.test(id);
}

/** The player's owned cards that are currently in play. */
export function ownedActiveIds(unlocked: readonly string[]): string[] {
  const active = new Set(CARDS.map((c) => c.id));
  return unlocked.filter((id) => active.has(id));
}

/**
 * A stand-in card with given values and no class or effect – the computer uses it for cards it cannot see
 * (the player's hand), so it never plays with hidden information. Not part of any catalog or collection.
 */
export function virtualCard(v: readonly [number, number, number, number]): string {
  const id = `__v${v.join('_')}`;
  if (!BY_ID.has(id)) BY_ID.set(id, { id, name: 'Unbekannte Karte', rarity: 'common', top: v[0], right: v[1], bottom: v[2], left: v[3], art: '?', hue: 0 });
  return id;
}

export function getCard(id: string): CardDef {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export function isCardId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Cards unlocked for a brand-new player: 16 commons and 8 uncommons (24). */
export const STARTING_UNLOCKED: string[] = [
  'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16',
  'u01', 'u02', 'u03', 'u04', 'u05', 'u06', 'u07', 'u08',
];

/** Predefined starter deck: 20 distinct cards from the starting collection. */
export const STARTER_DECK: string[] = [
  'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c13', 'c14',
  'u01', 'u02', 'u03', 'u04', 'u05', 'u06', 'u07', 'u08',
];

export const DECK_SIZE = 20;

export function cardPower(c: CardDef): number {
  return c.top + c.right + c.bottom + c.left;
}

/** Strength of the card's effect in Σ points (0 without effect). */
export function effectValue(c: Pick<CardDef, 'effect'>): number {
  return c.effect ? EFFECTS[c.effect].value : 0;
}

/** Value sum plus effect strength – used for balancing. */
export function cardScore(c: CardDef): number {
  return Math.round((cardPower(c) + effectValue(c)) * 10) / 10;
}

/**
 * Picks a card where `shares` is the chance per rarity (not per card), so adding more
 * commons does not make mythic cards rarer or more common. Returns null if nothing matches.
 */
export function pickByRarity(rng: Rng, pool: readonly CardDef[], shares: Partial<Record<Rarity, number>>): CardDef | null {
  const candidates = pool.filter((c) => (shares[c.rarity] ?? 0) > 0);
  if (candidates.length === 0) return null;
  const count: Partial<Record<Rarity, number>> = {};
  for (const c of candidates) count[c.rarity] = (count[c.rarity] ?? 0) + 1;
  return pickWeighted(rng, candidates, (c) => shares[c.rarity]! / count[c.rarity]!);
}
