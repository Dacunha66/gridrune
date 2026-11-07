// Pure duel rules: 4×4 board, 8 cards per side, orthogonal captures, no chains.
// Special effects (effects.ts) only change values for the current duel; printed values never change.
import { getCard } from './cards';
import { CLASS_TERRAIN, EFFECTS, ELEMENT_BONUS, EffectId, TERRAIN_INFO, Terrain } from './effects';
import { SETTINGS } from './settings';
import { Rng, createRng } from './rng';

export type Side = 'player' | 'cpu';

export const BOARD_SIZE = 4;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/**
 * Board shapes: always 4 columns. 16 cells = the classic 4×4 square; 20 cells = the Kristall shape, 5 rows
 * without its 4 corners (16 playable fields). The shape follows from the number of cells of the arena.
 */
export const KRISTALL_CELLS = 20;
export const BOARD_CELL_COUNTS = [CELL_COUNT, KRISTALL_CELLS] as const;
const KRISTALL_HOLES = [0, 3, 16, 19];
/** Cells that are not part of the board (no field there). */
export function boardHoles(count: number): number[] {
  return count === KRISTALL_CELLS ? KRISTALL_HOLES : [];
}
export const boardRows = (count: number) => Math.round(count / BOARD_SIZE);
export const isBoardCount = (n: number) => (BOARD_CELL_COUNTS as readonly number[]).includes(n);
export const HAND_SIZE = 8;
/** Nachziehen (admin switch): cards on the hand; the rest of the 8 lie face down and one is drawn before each own move. */
export const DRAW_HAND_SIZE = 5;

export type Dir = 'top' | 'right' | 'bottom' | 'left';

/** A card instance in a hand or on the board. `mod` is added to all four values (e.g. -1 after a stumble). */
export interface HandCard {
  cardId: string;
  mod: number;
}

export const MIN_VALUE = 1;
export const MAX_VALUE = 10;

/** Values in the order top, right, bottom, left. */
export type Values = [number, number, number, number];
export const DIR_ORDER: Dir[] = ['top', 'right', 'bottom', 'left'];

export function clampValue(n: number): number {
  return Math.min(MAX_VALUE, Math.max(MIN_VALUE, n));
}

/** Value of a hand card (printed value + stumble), always 1–10. */
export function cardValue(card: HandCard, dir: Dir): number {
  return clampValue(getCard(card.cardId)[dir] + card.mod);
}

export function toHand(ids: string[]): HandCard[] {
  return ids.map((cardId) => ({ cardId, mod: 0 }));
}

/** A lasting change from an effect (until the end of this duel). */
export interface Change {
  source: string;
  d: Values;
}

export interface BoardCell extends HandCard {
  owner: Side;
  /** Who originally played the card. */
  placedBy: Side;
  /** Lasting changes from on-play effects (Kampfgeist, Arkane Kraft, Schwächender Blick, …). */
  changes?: Change[];
  /** Shield of the Magische Barriere: blocks the next weakening by an enemy effect. */
  barrier?: boolean;
  /** Orientation in quarter turns clockwise (Wirbelwind, Rune der Verdrehung); 0 = as printed. */
  rot?: number;
}

/** Something an effect did during the last move (shown as a short popup). */
export interface EffectEvent {
  cell: number;
  text: string;
  kind: 'buff' | 'debuff' | 'shield';
  /** Effect that caused it and the side owning that effect's card (for campaign goals). */
  effect?: EffectId;
  by?: Side;
}

export interface BattleState {
  board: (BoardCell | null)[];
  hands: Record<Side, HandCard[]>;
  turn: Side;
  moveCount: number;
  /** Cells flipped by the most recent move (for animations). */
  lastFlips: number[];
  /** Every comparison of the most recent move, captured or not (for the fight animation). */
  lastClashes: Clash[];
  lastPlaced: number | null;
  /**
   * Blocked cells ("Felsfeld"). With one rock there are 15 fields: the starting side places the
   * last card and nobody can draw – this removes the second mover's advantage (see BALANCING.md).
   */
  rocks: number[];
  /** Terrain of each cell (arena). */
  terrain: Terrain[];
  /** Effects triggered by the most recent move. */
  lastEvents: EffectEvent[];
  /** Kettenübernahme of the most recent move: each further capture, wave by wave. */
  lastChain: ChainStep[];
  /** Every comparison of that Kettenübernahme (also those that failed) – for the display. */
  lastChainClashes?: ChainClash[];
  /** Equipped rune of each side and whether it was used (null = no rune). */
  runes: Record<Side, RuneSlot | null>;
  /** Everything that happened, in order (public duel log). */
  log: LogEntry[];
  /** Cell the comparisons of the most recent action start from (placed card or rune target). */
  lastOrigin: number | null;
  /** Rune used in the most recent action (for the animation). */
  lastRune: { side: Side; id: string } | null;
  /**
   * Nachziehen: the face-down cards of each side, drawn from the front (absent = all 8 on the hand from the start).
   * Hidden from the other side and – in the order – from the owner too.
   */
  piles?: Record<Side, HandCard[]>;
  /** Side that drew a card with the most recent move (for the animation), if any. */
  lastDraw?: Side | null;
}

/**
 * Does the attacking card take the defending one? The higher value wins. On a tie the attacker wins only with
 * Dominanz – and never against a card with Standhaft.
 */
export function beats(attack: number, defense: number, attackerId: string, defenderId: string): boolean {
  if (attack !== defense) return attack > defense;
  return getCard(attackerId).effect === 'dominanz' && getCard(defenderId).effect !== 'standhaft';
}

/** One capture of a Kettenübernahme: the captured card `from` took `cell` in wave `level` (1 = after the first capture). */
export interface ChainStep {
  from: number;
  cell: number;
  level: number;
}

/** In the chain a card attacks with this much less on every value (Kettenübernahme). */
export const CHAIN_PENALTY = 1;

/** One comparison in a Kettenübernahme wave (captured or not), shown to the player: base value − penalty vs. defense. */
export interface ChainClash {
  from: number;
  cell: number;
  level: number;
  /** Attack value before the chain penalty. */
  base: number;
  /** Attack value used (base − CHAIN_PENALTY, at least 1). */
  attack: number;
  defense: number;
  captured: boolean;
}

export interface RuneSlot {
  id: string;
  used: boolean;
}

export interface LogEntry {
  side: Side;
  kind: 'place' | 'rune';
  text: string;
}

/** One comparison between the placed card and an opposing neighbour. */
export interface Clash {
  cell: number;
  /** Side of the placed card facing the neighbour. */
  dir: Dir;
  attack: number;
  defense: number;
  captured: boolean;
}

export interface Move {
  handIndex: number;
  cell: number;
  /** Target of "Schwächender Blick" – required when several enemy cards are adjacent. */
  target?: number;
  /** Wirbelwind: orientation chosen when placing (quarter turns clockwise, 0–3). */
  rot?: number;
}

export function other(side: Side): Side {
  return side === 'player' ? 'cpu' : 'player';
}

export const NORMAL_TERRAIN: Terrain[] = Array<Terrain>(16).fill('normal');

/** Fisher–Yates with the given random source (the same seed gives the same order in the game and on the server). */
function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cards a side still has to play: the hand plus the face-down pile (Nachziehen). */
export function cardsLeft(state: Pick<BattleState, 'hands' | 'piles'>, side: Side): number {
  return state.hands[side].length + (state.piles?.[side].length ?? 0);
}

export function createBattle(
  playerHand: HandCard[], cpuHand: HandCard[], first: Side = 'player', rocks: number[] = [], terrain: readonly Terrain[] = NORMAL_TERRAIN,
  runes: Partial<Record<Side, string | null>> = {},
  /** Random source of the shuffle when the admin switch "Nachziehen" is on (checked games: from the seed). */
  deal?: Rng,
): BattleState {
  if (playerHand.length !== HAND_SIZE || cpuHand.length !== HAND_SIZE) {
    throw new Error(`Each side needs exactly ${HAND_SIZE} cards`);
  }
  const count = isBoardCount(terrain.length) ? terrain.length : CELL_COUNT;
  const holes = boardHoles(count);
  let hands: Record<Side, HandCard[]> = { player: playerHand.map((c) => ({ ...c })), cpu: cpuHand.map((c) => ({ ...c })) };
  let piles: Record<Side, HandCard[]> | undefined;
  if (SETTINGS.drawHand) {
    // Nachziehen: both sides' 8 cards are shuffled; 5 are the hand, the other 3 are drawn one per own move.
    const rng = deal ?? createRng();
    const player = shuffle(hands.player, rng);
    const cpu = shuffle(hands.cpu, rng);
    hands = { player: player.slice(0, DRAW_HAND_SIZE), cpu: cpu.slice(0, DRAW_HAND_SIZE) };
    piles = { player: player.slice(DRAW_HAND_SIZE), cpu: cpu.slice(DRAW_HAND_SIZE) };
  }
  return {
    board: Array<BoardCell | null>(count).fill(null),
    hands,
    ...(piles ? { piles, lastDraw: null } : {}),
    turn: first,
    moveCount: 0,
    lastFlips: [],
    lastClashes: [],
    lastPlaced: null,
    rocks: [...new Set(rocks)].filter((c) => Number.isInteger(c) && c >= 0 && c < count && !holes.includes(c)),
    terrain: isBoardCount(terrain.length) ? [...terrain] : [...NORMAL_TERRAIN],
    lastEvents: [],
    lastChain: [],
    runes: { player: runes.player ? { id: runes.player, used: false } : null, cpu: runes.cpu ? { id: runes.cpu, used: false } : null },
    log: [],
    lastOrigin: null,
    lastRune: null,
  };
}

/** Values turned by quarter turns clockwise: the top value moves to the right, the left value to the top. */
export function rotateValues(v: Values, rot = 0): Values {
  let out = [...v] as Values;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) out = [out[3], out[0], out[1], out[2]];
  return out;
}

/** A random rock cell for a balanced duel – only on normal (terrain-free) fields of the board. */
export function randomRock(rng: () => number, terrain: readonly Terrain[] = NORMAL_TERRAIN): number {
  const holes = boardHoles(terrain.length);
  const free = terrain.flatMap((t, i) => (t === 'normal' && !holes.includes(i) ? [i] : []));
  const cells = free.length > 0 ? free : [...Array(terrain.length).keys()].filter((i) => !holes.includes(i));
  return cells[Math.floor(rng() * cells.length)];
}

/** Neighbour directions: own side vs. the neighbour's opposite side. */
const DIRS = [
  { dr: -1, dc: 0, mine: 'top', theirs: 'bottom' },
  { dr: 0, dc: 1, mine: 'right', theirs: 'left' },
  { dr: 1, dc: 0, mine: 'bottom', theirs: 'top' },
  { dr: 0, dc: -1, mine: 'left', theirs: 'right' },
] as const;

/** The fields next to `cell` on a board of `count` cells (holes of the shape are left out). */
export function neighbours(cell: number, count: number = CELL_COUNT): { cell: number; mine: Dir; theirs: Dir }[] {
  const rows = boardRows(count);
  const holes = boardHoles(count);
  const r = Math.floor(cell / BOARD_SIZE);
  const c = cell % BOARD_SIZE;
  const out = [];
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < BOARD_SIZE && !holes.includes(nr * BOARD_SIZE + nc)) {
      out.push({ cell: nr * BOARD_SIZE + nc, mine: d.mine, theirs: d.theirs });
    }
  }
  return out;
}

// ---------- Effects ----------

function sum(a: Values, b: Values): Values {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

/** One line of a value breakdown, e.g. "Wurzelkraft +1 auf alle Werte". */
export interface Part {
  source: string;
  d: Values;
  /** stone = Stolperstein, play = on-play effect (lasting), aura = while a condition holds, element = class on its terrain. */
  kind: 'stone' | 'play' | 'aura' | 'element';
}

export interface Breakdown {
  /** Printed values in the card's current orientation. */
  base: Values;
  /** Orientation in quarter turns clockwise. */
  rot: number;
  parts: Part[];
  /** Effective values (1–10) used in every comparison. */
  values: Values;
  barrier: boolean;
}

function printed(cardId: string): Values {
  const c = getCard(cardId);
  return [c.top, c.right, c.bottom, c.left];
}

/** Values before conditional bonuses: printed + stumble + lasting changes, each kept within 1–10. */
function lastingValues(card: HandCard & { changes?: Change[] }): Values {
  let v = sum(printed(card.cardId), [card.mod, card.mod, card.mod, card.mod]);
  for (const ch of card.changes ?? []) v = sum(v, ch.d);
  return v.map(clampValue) as Values;
}

/** Lasting values turned to the card's orientation on the board (boni turn with their side). */
function orientedLasting(card: HandCard & { changes?: Change[]; rot?: number }): Values {
  return rotateValues(lastingValues(card), card.rot ?? 0);
}

/** Index of the highest/lowest value; ties go to top, right, bottom, left (in this order). */
function extremeIndex(v: Values, pick: 'max' | 'min'): number {
  let best = 0;
  for (let i = 1; i < 4; i++) if (pick === 'max' ? v[i] > v[best] : v[i] < v[best]) best = i;
  return best;
}

function onlyAt(indexes: number[], amount: number): Values {
  const d: Values = [0, 0, 0, 0];
  for (const i of indexes) d[i] = amount;
  return d;
}

/** Conditional bonuses of the card on `cell` – recomputed live, so ownership changes count immediately. */
function auraParts(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number): Part[] {
  const card = board[cell];
  if (!card) return [];
  const def = getCard(card.cardId);
  const here = terrain[cell] ?? 'normal';
  // Element: a card on the terrain of its class gets +1 on all values (Natur → Wald, Feuer → Lava, Frost → Eis, Schatten → Schatten).
  const element: Part[] = def.cls && here !== 'normal' && CLASS_TERRAIN[def.cls] === here
    ? [{ source: `Element ${TERRAIN_INFO[here].label}`, d: [ELEMENT_BONUS, ELEMENT_BONUS, ELEMENT_BONUS, ELEMENT_BONUS], kind: 'element' }]
    : [];
  return [...element, ...effectAura(board, cell)];
}

/** Conditional bonus from the card's own effect. */
function effectAura(board: readonly (BoardCell | null)[], cell: number): Part[] {
  const card = board[cell];
  if (!card) return [];
  const effect = getCard(card.cardId).effect;
  if (!effect) return [];
  const def = EFFECTS[effect];
  switch (effect) {
    case 'schildwall':
    case 'naturbund': {
      const near = neighbours(cell, board.length);
      const friends = near.filter((n) => board[n.cell]?.owner === card.owner);
      const active = effect === 'schildwall' ? friends.length > 0 : friends.some((n) => getCard(board[n.cell]!.cardId).cls === 'natur');
      if (!active) return [];
      const facingFriend = new Set(friends.map((n) => DIR_ORDER.indexOf(n.mine)));
      return [{ source: def.name, d: onlyAt([0, 1, 2, 3].filter((i) => !facingFriend.has(i)), 1), kind: 'aura' }];
    }
    default:
      return [];
  }
}

/** Full value breakdown of a card on the board (for the details view and every comparison). */
export function cellBreakdown(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number): Breakdown {
  const card = board[cell];
  if (!card) throw new Error('Empty cell');
  const parts: Part[] = [];
  const rot = card.rot ?? 0;
  if (card.mod !== 0) parts.push({ source: 'Stolperstein', d: [card.mod, card.mod, card.mod, card.mod], kind: 'stone' });
  for (const ch of card.changes ?? []) parts.push({ source: ch.source, d: rotateValues(ch.d, rot), kind: 'play' });
  const auras = auraParts(board, terrain, cell);
  parts.push(...auras);
  const values = auras.reduce((v, p) => sum(v, p.d), orientedLasting(card)).map(clampValue) as Values;
  return { base: rotateValues(printed(card.cardId), rot), rot, parts, values, barrier: !!card.barrier };
}

/** Effective value of the card on `cell` in direction `dir` (1–10). */
export function boardValue(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, dir: Dir): number {
  return cellBreakdown(board, terrain, cell).values[DIR_ORDER.indexOf(dir)];
}

/** Bonus in a comparison: Flammenherz +1 when this card attacks, Frostpanzer +1 when it is attacked. */
export const ATTACK_BONUS = 1;
export const DEFENSE_BONUS = 1;

/** Value of the card on `cell` when it attacks in direction `dir` (Flammenherz included, 1–10). */
export function attackValue(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, dir: Dir): number {
  const v = boardValue(board, terrain, cell, dir);
  return getCard(board[cell]!.cardId).effect === 'flammenherz' ? clampValue(v + ATTACK_BONUS) : v;
}

/** Value of the card on `cell` when it is attacked from direction `dir` (Frostpanzer included, 1–10). */
export function defenseValue(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, dir: Dir): number {
  const v = boardValue(board, terrain, cell, dir);
  return getCard(board[cell]!.cardId).effect === 'frostpanzer' ? clampValue(v + DEFENSE_BONUS) : v;
}

/** Popups for Flammenherz / Frostpanzer when they took part in comparisons (once per card). */
export function comparisonEvents(board: readonly (BoardCell | null)[], attacker: number, defenders: readonly number[]): EffectEvent[] {
  const out: EffectEvent[] = [];
  if (defenders.length === 0) return out;
  const a = board[attacker]!;
  if (getCard(a.cardId).effect === 'flammenherz') out.push({ cell: attacker, text: 'Flammenherz +1', kind: 'buff', effect: 'flammenherz', by: a.owner });
  for (const d of defenders) {
    const c = board[d]!;
    if (getCard(c.cardId).effect === 'frostpanzer') out.push({ cell: d, text: 'Frostpanzer +1', kind: 'buff', effect: 'frostpanzer', by: c.owner });
  }
  return out;
}

/**
 * Schattenmantel: every captured card with it curses the card that captured it (−1 on all values until the end
 * of the duel; a Magische Barriere blocks it). Changes `board` in place, after all captures of one step.
 */
export function applyCurses(board: (BoardCell | null)[], captures: readonly { from: number; cell: number }[], events: EffectEvent[]): void {
  for (const c of captures) {
    const victim = board[c.cell]!;
    if (getCard(victim.cardId).effect !== 'schattenmantel') continue;
    const capturer = { ...board[c.from]! };
    const by = capturer.owner === 'player' ? 'cpu' : 'player';
    if (capturer.barrier) {
      capturer.barrier = false;
      events.push({ cell: c.from, text: '🛡 geblockt', kind: 'shield', effect: 'schattenmantel', by });
    } else {
      capturer.changes = [...(capturer.changes ?? []), { source: EFFECTS.schattenmantel.name, d: [-1, -1, -1, -1] }];
      events.push({ cell: c.from, text: 'Schattenmantel −1', kind: 'debuff', effect: 'schattenmantel', by });
    }
    board[c.from] = capturer;
  }
}

/** Wurzelkraft: growth steps at most per card. */
export const ROOT_GROWTH_MAX = 2;

/**
 * Wurzelkraft: after a move of `side`, each Wurzelkraft card it played and still owns (except the one just placed)
 * grows +1 on its lowest value, at most ROOT_GROWTH_MAX times per card. A captured card does not grow for its new
 * owner. Changes `board` in place.
 */
export function growRoots(board: (BoardCell | null)[], side: Side, placedAt: number, events: EffectEvent[]): void {
  const name = EFFECTS.wurzelkraft.name;
  board.forEach((c, i) => {
    if (!c || i === placedAt || c.owner !== side || c.placedBy !== side || getCard(c.cardId).effect !== 'wurzelkraft') return;
    const grown = (c.changes ?? []).filter((ch) => ch.source === name).length;
    if (grown >= ROOT_GROWTH_MAX) return;
    const v = lastingValues(c);
    if (v[extremeIndex(v, 'min')] >= MAX_VALUE) return;
    board[i] = { ...c, changes: [...(c.changes ?? []), { source: name, d: onlyAt([extremeIndex(v, 'min')], 1) }] };
    events.push({ cell: i, text: 'Wurzelkraft +1', kind: 'buff', effect: 'wurzelkraft', by: side });
  });
}

/** Enemy cards "Schwächender Blick" could target if `card` were placed on `cell` (empty for other effects). */
export function blickTargets(board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side): number[] {
  if (getCard(card.cardId).effect !== 'schwaechender_blick') return [];
  return neighbours(cell, board.length).filter((n) => board[n.cell] && board[n.cell]!.owner !== side).map((n) => n.cell);
}

export interface Placement {
  board: (BoardCell | null)[];
  clashes: Clash[];
  events: EffectEvent[];
  /** Further captures of a Kettenübernahme. */
  chain: ChainStep[];
  chainClashes: ChainClash[];
}

/**
 * Places a card: on-play effects first (own effect, then "Schwächender Blick" on its target),
 * then every comparison against the board at that moment, then all captures at once.
 * Captures trigger nothing else – except Kettenübernahme (further waves) and Schattenmantel (curses the capturer).
 */
export function resolvePlacement(
  board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, card: HandCard, side: Side, target?: number, rot = 0,
): Placement {
  const next = [...board];
  const events: EffectEvent[] = [];
  const placed: BoardCell = { cardId: card.cardId, mod: card.mod, owner: side, placedBy: side };
  if (rot % 4 !== 0) {
    placed.rot = ((rot % 4) + 4) % 4;
    events.push({ cell, text: `↻ ${placed.rot * 90}°`, kind: 'buff', effect: 'wirbelwind', by: side });
  }
  const effect = getCard(card.cardId).effect;
  if (effect && EFFECTS[effect].trigger === 'play') {
    const name = EFFECTS[effect].name;
    const v = lastingValues(placed);
    if (effect === 'kampfgeist') {
      placed.changes = [{ source: name, d: onlyAt([extremeIndex(v, 'max')], 1) }];
      events.push({ cell, text: `${name} +1`, kind: 'buff', effect, by: side });
    } else if (effect === 'arkane_kraft') {
      placed.changes = [{ source: name, d: [1, 1, 1, 1] }];
      events.push({ cell, text: `${name} +1`, kind: 'buff', effect, by: side });
    } else if (effect === 'magische_barriere') {
      const low = Math.min(...v);
      placed.changes = [{ source: name, d: onlyAt([0, 1, 2, 3].filter((i) => v[i] === low), 1) }];
      placed.barrier = true;
      events.push({ cell, text: '🛡 Barriere', kind: 'shield', effect, by: side });
    } else if (effect === 'wurzelkraft') {
      placed.changes = [{ source: name, d: onlyAt([extremeIndex(v, 'min')], 1) }];
      events.push({ cell, text: `${name} +1`, kind: 'buff', effect, by: side });
    } else if (effect === 'schwaechender_blick') {
      const targets = blickTargets(board, cell, card, side);
      const t = target ?? (targets.length === 1 ? targets[0] : undefined);
      if (t !== undefined && targets.includes(t)) {
        const victim = { ...next[t]! };
        if (victim.barrier) {
          victim.barrier = false;
          events.push({ cell: t, text: '🛡 geblockt', kind: 'shield', effect, by: side });
        } else {
          victim.changes = [...(victim.changes ?? []), { source: name, d: [-1, -1, -1, -1] }];
          events.push({ cell: t, text: `${name} −1`, kind: 'debuff', effect, by: side });
        }
        next[t] = victim;
      }
    }
  }
  next[cell] = placed;
  const clashes: Clash[] = [];
  for (const n of neighbours(cell, next.length)) {
    const other = next[n.cell];
    if (!other || other.owner === side) continue;
    const attack = attackValue(next, terrain, cell, n.mine);
    const defense = defenseValue(next, terrain, n.cell, n.theirs);
    clashes.push({ cell: n.cell, dir: n.mine, attack, defense, captured: beats(attack, defense, placed.cardId, other.cardId) });
  }
  events.push(...comparisonEvents(next, cell, clashes.map((c) => c.cell)));
  const firstCaptures = clashes.filter((c) => c.captured).map((c) => c.cell);
  for (const c of firstCaptures) next[c] = { ...next[c]!, owner: side };
  // Kettenübernahme: the captured cards attack before a Schattenmantel curse lands on the placed card.
  const chainClashes: ChainClash[] = [];
  const chain = effect === 'kettenuebernahme' ? runChain(next, terrain, firstCaptures, side, cell, events, chainClashes) : [];
  if (chain.length > 0) events.push({ cell, text: `⚡ Kette ×${chain.length}`, kind: 'buff', effect, by: side });
  applyCurses(next, firstCaptures.map((c) => ({ from: cell, cell: c })), events);
  return { board: next, clashes, events, chain, chainClashes };
}

/**
 * Kettenübernahme: the freshly captured cards attack their enemy neighbours (current values − CHAIN_PENALTY), wave by
 * wave, at most SETTINGS.chainDepth waves (0 = unlimited). In the chain only a higher value captures – a tie never does,
 * not even with Dominanz. Every card attacks at most once; order is fixed (wave, then cell number, then
 * top/right/bottom/left), so the result is always the same. Changes `board` in place.
 */
function runChain(
  board: (BoardCell | null)[], terrain: readonly Terrain[], firstCaptures: number[], side: Side, placedAt: number, events: EffectEvent[],
  tries: ChainClash[] = [],
): ChainStep[] {
  const steps: ChainStep[] = [];
  const attacked = new Set<number>([placedAt]);
  let wave = [...firstCaptures].sort((a, b) => a - b);
  const maxWaves = SETTINGS.chainDepth > 0 ? SETTINGS.chainDepth : Infinity;
  for (let level = 1; wave.length > 0 && level <= maxWaves; level++) {
    const captured: { from: number; cell: number }[] = [];
    for (const from of wave) {
      if (attacked.has(from)) continue;
      attacked.add(from);
      for (const n of neighbours(from, board.length)) {
        const other = board[n.cell];
        if (!other || other.owner === side || captured.some((c) => c.cell === n.cell)) continue;
        const base = attackValue(board, terrain, from, n.mine);
        const attack = clampValue(base - CHAIN_PENALTY);
        const defense = defenseValue(board, terrain, n.cell, n.theirs);
        const won = attack > defense;
        tries.push({ from, cell: n.cell, level, base, attack, defense, captured: won });
        if (won) captured.push({ from, cell: n.cell });
      }
    }
    // All captures of a wave happen together (like the normal capture), then the next wave starts.
    for (const c of captured) board[c.cell] = { ...board[c.cell]!, owner: side };
    applyCurses(board, captured, events);
    steps.push(...captured.map((c) => ({ ...c, level })));
    wave = captured.map((c) => c.cell).sort((a, b) => a - b);
  }
  return steps;
}

/** All comparisons if `card` owned by `side` were placed on `cell` (effects included). */
export function computeClashes(
  board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side, terrain: readonly Terrain[] = NORMAL_TERRAIN, target?: number, rot = 0,
): Clash[] {
  return resolvePlacement(board, terrain, cell, card, side, target, rot).clashes;
}

/** Cells that would be captured if `card` owned by `side` were placed on `cell` (Kettenübernahme included). */
export function computeFlips(
  board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side, terrain: readonly Terrain[] = NORMAL_TERRAIN, target?: number, rot = 0,
): number[] {
  const p = resolvePlacement(board, terrain, cell, card, side, target, rot);
  return [...p.clashes.filter((c) => c.captured).map((c) => c.cell), ...p.chain.map((c) => c.cell)];
}

/** Coin toss before the duel. */
export function coinToss(rng: () => number): Side {
  return rng() < 0.5 ? 'player' : 'cpu';
}

/**
 * The computer's choice after winning the toss. Placing the last card is a clear advantage
 * (simulated: second mover wins about 4× as often), so it lets the player start.
 */
export function cpuChoosesFirst(): Side {
  return 'player';
}

export function isLegalMove(state: BattleState, move: Move): boolean {
  if (
    isGameOver(state) ||
    !Number.isInteger(move.cell) || move.cell < 0 || move.cell >= state.board.length ||
    state.board[move.cell] !== null ||
    state.rocks.includes(move.cell) || boardHoles(state.board.length).includes(move.cell) ||
    !Number.isInteger(move.handIndex) || move.handIndex < 0 || move.handIndex >= state.hands[state.turn].length
  ) return false;
  // Only Wirbelwind cards may be turned when placed.
  const card = state.hands[state.turn][move.handIndex];
  if (move.rot !== undefined && (!Number.isInteger(move.rot) || move.rot < 0 || move.rot > 3)) return false;
  if (move.rot && getCard(card.cardId).effect !== 'wirbelwind') return false;
  // "Schwächender Blick": with several adjacent enemies the target must be named; it must be one of them.
  const targets = blickTargets(state.board, move.cell, card, state.turn);
  if (move.target === undefined) return targets.length <= 1;
  return targets.includes(move.target);
}

export function legalMoves(state: BattleState): Move[] {
  if (isGameOver(state)) return [];
  const moves: Move[] = [];
  const holes = boardHoles(state.board.length);
  state.board.forEach((cell, i) => {
    if (cell || state.rocks.includes(i) || holes.includes(i)) return;
    state.hands[state.turn].forEach((card, h) => {
      const targets = blickTargets(state.board, i, card, state.turn);
      const rots = getCard(card.cardId).effect === 'wirbelwind' ? [0, 1, 2, 3] : [0];
      for (const rot of rots) {
        const extra = rot ? { rot } : {};
        if (targets.length > 1) for (const target of targets) moves.push({ handIndex: h, cell: i, target, ...extra });
        else moves.push({ handIndex: h, cell: i, ...extra });
      }
    });
  });
  return moves;
}

/** Applies a move for the side whose turn it is and returns the new state. */
export function applyMove(state: BattleState, move: Move): BattleState {
  if (!isLegalMove(state, move)) throw new Error('Illegal move');
  const side = state.turn;
  const hand = [...state.hands[side]];
  const [card] = hand.splice(move.handIndex, 1);
  const { board, clashes, events, chain, chainClashes } = resolvePlacement(state.board, state.terrain, move.cell, card, side, move.target, move.rot ?? 0);
  growRoots(board, side, move.cell, events);
  const flips = [...clashes.filter((c) => c.captured).map((c) => c.cell), ...chain.map((c) => c.cell)];
  const name = getCard(card.cardId).name;
  const text = `${name} auf ${cellName(move.cell)}${move.rot ? ` (↻ ${move.rot * 90}°)` : ''}${flips.length ? ` – erobert ${flips.length}` : ''}${chain.length ? ` (Kette ×${chain.length})` : ''}`;
  // Nachziehen: before its move the next side draws its top card (as long as its pile has cards).
  const next = other(side);
  let hands: Record<Side, HandCard[]> = { ...state.hands, [side]: hand };
  let piles = state.piles;
  let lastDraw: Side | null = null;
  if (piles && piles[next].length > 0 && hands[next].length < DRAW_HAND_SIZE) {
    const [drawn, ...rest] = piles[next];
    hands = { ...hands, [next]: [...hands[next], drawn] };
    piles = { ...piles, [next]: rest };
    lastDraw = next;
  }
  return {
    ...state,
    board,
    hands,
    ...(piles ? { piles, lastDraw } : {}),
    turn: next,
    moveCount: state.moveCount + 1,
    lastFlips: flips,
    lastClashes: clashes,
    lastPlaced: move.cell,
    lastEvents: events,
    lastChain: chain,
    lastChainClashes: chainClashes,
    lastOrigin: move.cell,
    lastRune: null,
    log: [...state.log, { side, kind: 'place', text }],
  };
}

/** Field name for the log, e.g. "B3" (column letter, row number). */
export function cellName(cell: number): string {
  return `${'ABCD'[cell % BOARD_SIZE]}${Math.floor(cell / BOARD_SIZE) + 1}`;
}

/** Number of moves in a duel: one per free field (16, or 15 with a rock – on every board shape). */
export function totalMoves(state: Pick<BattleState, 'rocks' | 'board'>): number {
  return playableFields(state.board.length) - state.rocks.length;
}

/** Fields of a board shape without its holes (16 on both shapes). */
export function playableFields(count: number): number {
  return count - boardHoles(count).length;
}

export function isGameOver(state: BattleState): boolean {
  return state.moveCount >= totalMoves(state);
}

export function score(state: BattleState): Record<Side, number> {
  const s = { player: 0, cpu: 0 };
  for (const cell of state.board) if (cell) s[cell.owner]++;
  return s;
}

export type Outcome = 'win' | 'draw' | 'loss';

export function outcome(state: BattleState): Outcome {
  const s = score(state);
  if (s.player > s.cpu) return 'win';
  if (s.player < s.cpu) return 'loss';
  return 'draw';
}
