// Pure duel rules: 4×4 board, 8 cards per side, orthogonal captures, no chains.
// Special effects (effects.ts) only change values for the current duel; printed values never change.
import { getCard } from './cards';
import { CLASS_TERRAIN, EFFECTS, ELEMENT_BONUS, TERRAIN_INFO, Terrain } from './effects';

export type Side = 'player' | 'cpu';

export const BOARD_SIZE = 4;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const HAND_SIZE = 8;

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
}

/** Something an effect did during the last move (shown as a short popup). */
export interface EffectEvent {
  cell: number;
  text: string;
  kind: 'buff' | 'debuff' | 'shield';
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
}

export function other(side: Side): Side {
  return side === 'player' ? 'cpu' : 'player';
}

export const NORMAL_TERRAIN: Terrain[] = Array<Terrain>(16).fill('normal');

export function createBattle(
  playerHand: HandCard[], cpuHand: HandCard[], first: Side = 'player', rocks: number[] = [], terrain: readonly Terrain[] = NORMAL_TERRAIN,
): BattleState {
  if (playerHand.length !== HAND_SIZE || cpuHand.length !== HAND_SIZE) {
    throw new Error(`Each side needs exactly ${HAND_SIZE} cards`);
  }
  return {
    board: Array<BoardCell | null>(CELL_COUNT).fill(null),
    hands: { player: playerHand.map((c) => ({ ...c })), cpu: cpuHand.map((c) => ({ ...c })) },
    turn: first,
    moveCount: 0,
    lastFlips: [],
    lastClashes: [],
    lastPlaced: null,
    rocks: [...new Set(rocks)].filter((c) => Number.isInteger(c) && c >= 0 && c < CELL_COUNT),
    terrain: terrain.length === CELL_COUNT ? [...terrain] : [...NORMAL_TERRAIN],
    lastEvents: [],
  };
}

/** A random rock cell for a balanced duel – only on normal (terrain-free) cells. */
export function randomRock(rng: () => number, terrain: readonly Terrain[] = NORMAL_TERRAIN): number {
  const free = terrain.flatMap((t, i) => (t === 'normal' ? [i] : []));
  const cells = free.length > 0 ? free : [...Array(CELL_COUNT).keys()];
  return cells[Math.floor(rng() * cells.length)];
}

/** Neighbour directions: own side vs. the neighbour's opposite side. */
const DIRS = [
  { dr: -1, dc: 0, mine: 'top', theirs: 'bottom' },
  { dr: 0, dc: 1, mine: 'right', theirs: 'left' },
  { dr: 1, dc: 0, mine: 'bottom', theirs: 'top' },
  { dr: 0, dc: -1, mine: 'left', theirs: 'right' },
] as const;

export function neighbours(cell: number): { cell: number; mine: Dir; theirs: Dir }[] {
  const r = Math.floor(cell / BOARD_SIZE);
  const c = cell % BOARD_SIZE;
  const out = [];
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
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
  base: Values;
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
    ? [{ source: `Element ${TERRAIN_INFO[here].icon} ${TERRAIN_INFO[here].label}`, d: [ELEMENT_BONUS, ELEMENT_BONUS, ELEMENT_BONUS, ELEMENT_BONUS], kind: 'element' }]
    : [];
  // Terrain gives at most +1: a terrain effect (Wurzelkraft, …) never adds to the element bonus.
  const effect = def.effect ? EFFECTS[def.effect] : null;
  const effectParts = element.length > 0 && effect?.terrain ? [] : effectAura(board, terrain, cell);
  return [...element, ...effectParts];
}

/** Conditional bonus from the card's own effect. */
function effectAura(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number): Part[] {
  const card = board[cell];
  if (!card) return [];
  const effect = getCard(card.cardId).effect;
  if (!effect) return [];
  const def = EFFECTS[effect];
  const here = terrain[cell] ?? 'normal';
  switch (effect) {
    case 'schildwall':
    case 'naturbund': {
      const near = neighbours(cell);
      const friends = near.filter((n) => board[n.cell]?.owner === card.owner);
      const active = effect === 'schildwall' ? friends.length > 0 : friends.some((n) => getCard(board[n.cell]!.cardId).cls === 'natur');
      if (!active) return [];
      const facingFriend = new Set(friends.map((n) => DIR_ORDER.indexOf(n.mine)));
      return [{ source: def.name, d: onlyAt([0, 1, 2, 3].filter((i) => !facingFriend.has(i)), 1), kind: 'aura' }];
    }
    case 'wurzelkraft':
      return here === 'wald' ? [{ source: def.name, d: [1, 1, 1, 1], kind: 'aura' }] : [];
    case 'flammenherz':
      return here === 'lava' ? [{ source: def.name, d: [2, 0, 0, 0], kind: 'aura' }] : [];
    case 'frostpanzer':
      return here === 'eis' ? [{ source: def.name, d: [0, 1, 0, 1], kind: 'aura' }] : [];
    case 'schattenmantel':
      return here === 'schatten' ? [{ source: def.name, d: onlyAt([extremeIndex(lastingValues(card), 'min')], 2), kind: 'aura' }] : [];
    default:
      return [];
  }
}

/** Full value breakdown of a card on the board (for the details view and every comparison). */
export function cellBreakdown(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number): Breakdown {
  const card = board[cell];
  if (!card) throw new Error('Empty cell');
  const parts: Part[] = [];
  if (card.mod !== 0) parts.push({ source: 'Stolperstein', d: [card.mod, card.mod, card.mod, card.mod], kind: 'stone' });
  for (const ch of card.changes ?? []) parts.push({ source: ch.source, d: ch.d, kind: 'play' });
  const auras = auraParts(board, terrain, cell);
  parts.push(...auras);
  const values = auras.reduce((v, p) => sum(v, p.d), lastingValues(card)).map(clampValue) as Values;
  return { base: printed(card.cardId), parts, values, barrier: !!card.barrier };
}

/** Effective value of the card on `cell` in direction `dir` (1–10). */
export function boardValue(board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, dir: Dir): number {
  return cellBreakdown(board, terrain, cell).values[DIR_ORDER.indexOf(dir)];
}

/** Enemy cards "Schwächender Blick" could target if `card` were placed on `cell` (empty for other effects). */
export function blickTargets(board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side): number[] {
  if (getCard(card.cardId).effect !== 'schwaechender_blick') return [];
  return neighbours(cell).filter((n) => board[n.cell] && board[n.cell]!.owner !== side).map((n) => n.cell);
}

export interface Placement {
  board: (BoardCell | null)[];
  clashes: Clash[];
  events: EffectEvent[];
}

/**
 * Places a card: on-play effects first (own effect, then "Schwächender Blick" on its target),
 * then every comparison against the board at that moment, then all captures at once.
 * Captures never trigger anything else (no chains, nothing retroactive).
 */
export function resolvePlacement(
  board: readonly (BoardCell | null)[], terrain: readonly Terrain[], cell: number, card: HandCard, side: Side, target?: number,
): Placement {
  const next = [...board];
  const events: EffectEvent[] = [];
  const placed: BoardCell = { cardId: card.cardId, mod: card.mod, owner: side, placedBy: side };
  const effect = getCard(card.cardId).effect;
  if (effect && EFFECTS[effect].trigger === 'play') {
    const name = EFFECTS[effect].name;
    const v = lastingValues(placed);
    if (effect === 'kampfgeist') {
      placed.changes = [{ source: name, d: onlyAt([extremeIndex(v, 'max')], 1) }];
      events.push({ cell, text: `${name} +1`, kind: 'buff' });
    } else if (effect === 'arkane_kraft') {
      placed.changes = [{ source: name, d: [1, 1, 1, 1] }];
      events.push({ cell, text: `${name} +1`, kind: 'buff' });
    } else if (effect === 'magische_barriere') {
      const low = Math.min(...v);
      placed.changes = [{ source: name, d: onlyAt([0, 1, 2, 3].filter((i) => v[i] === low), 1) }];
      placed.barrier = true;
      events.push({ cell, text: '🛡 Barriere', kind: 'shield' });
    } else if (effect === 'schwaechender_blick') {
      const targets = blickTargets(board, cell, card, side);
      const t = target ?? (targets.length === 1 ? targets[0] : undefined);
      if (t !== undefined && targets.includes(t)) {
        const victim = { ...next[t]! };
        if (victim.barrier) {
          victim.barrier = false;
          events.push({ cell: t, text: '🛡 geblockt', kind: 'shield' });
        } else {
          victim.changes = [...(victim.changes ?? []), { source: name, d: [-1, -1, -1, -1] }];
          events.push({ cell: t, text: `${name} −1`, kind: 'debuff' });
        }
        next[t] = victim;
      }
    }
  }
  next[cell] = placed;
  const clashes: Clash[] = [];
  for (const n of neighbours(cell)) {
    const other = next[n.cell];
    if (!other || other.owner === side) continue;
    const attack = boardValue(next, terrain, cell, n.mine);
    const defense = boardValue(next, terrain, n.cell, n.theirs);
    clashes.push({ cell: n.cell, dir: n.mine, attack, defense, captured: attack > defense });
  }
  for (const c of clashes) if (c.captured) next[c.cell] = { ...next[c.cell]!, owner: side };
  return { board: next, clashes, events };
}

/** All comparisons if `card` owned by `side` were placed on `cell` (effects included). */
export function computeClashes(
  board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side, terrain: readonly Terrain[] = NORMAL_TERRAIN, target?: number,
): Clash[] {
  return resolvePlacement(board, terrain, cell, card, side, target).clashes;
}

/** Cells that would be captured if `card` owned by `side` were placed on `cell`. */
export function computeFlips(
  board: readonly (BoardCell | null)[], cell: number, card: HandCard, side: Side, terrain: readonly Terrain[] = NORMAL_TERRAIN, target?: number,
): number[] {
  return computeClashes(board, cell, card, side, terrain, target).filter((c) => c.captured).map((c) => c.cell);
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
    !Number.isInteger(move.cell) || move.cell < 0 || move.cell >= CELL_COUNT ||
    state.board[move.cell] !== null ||
    state.rocks.includes(move.cell) ||
    !Number.isInteger(move.handIndex) || move.handIndex < 0 || move.handIndex >= state.hands[state.turn].length
  ) return false;
  // "Schwächender Blick": with several adjacent enemies the target must be named; it must be one of them.
  const targets = blickTargets(state.board, move.cell, state.hands[state.turn][move.handIndex], state.turn);
  if (move.target === undefined) return targets.length <= 1;
  return targets.includes(move.target);
}

export function legalMoves(state: BattleState): Move[] {
  if (isGameOver(state)) return [];
  const moves: Move[] = [];
  state.board.forEach((cell, i) => {
    if (cell || state.rocks.includes(i)) return;
    state.hands[state.turn].forEach((card, h) => {
      const targets = blickTargets(state.board, i, card, state.turn);
      if (targets.length > 1) for (const target of targets) moves.push({ handIndex: h, cell: i, target });
      else moves.push({ handIndex: h, cell: i });
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
  const { board, clashes, events } = resolvePlacement(state.board, state.terrain, move.cell, card, side, move.target);
  return {
    board,
    hands: { ...state.hands, [side]: hand },
    turn: other(side),
    moveCount: state.moveCount + 1,
    lastFlips: clashes.filter((c) => c.captured).map((c) => c.cell),
    lastClashes: clashes,
    lastPlaced: move.cell,
    rocks: state.rocks,
    terrain: state.terrain,
    lastEvents: events,
  };
}

/** Number of moves in a duel: one per free field (16, or 15 with a rock). */
export function totalMoves(state: Pick<BattleState, 'rocks'>): number {
  return CELL_COUNT - state.rocks.length;
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
