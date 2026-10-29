// Computer opponent in three levels; the adventure duel uses the classic "medium" opponent.
// Effects, Wirbelwind turns and Kettenübernahme are understood through the real rules (computeFlips /
// applyMove play them out exactly). The computer never uses hidden information: the player's hand cards
// are unknown to it – where it thinks ahead it uses cautious stand-ins with the strongest values the player
// has shown on the board so far.
import {
  BattleState, DIR_ORDER, HAND_SIZE, HandCard, Move, Side, Values, applyMove, cardValue, cellBreakdown, computeFlips, isGameOver, legalMoves,
  neighbours, other, rotateValues, score, toHand, totalMoves,
} from './battle';
import { CARDS, Rarity, getCard, pickByRarity, virtualCard } from './cards';
import { CardClass } from './effects';
import { Rng } from './rng';
import { RuneUse, applyRune, echoCapturable, findRune, runeChoices, runeProblem, runeRules } from './runes';

/**
 * Strength of the computer opponent (campaign). Every level plays by the same rules and values –
 * only how carefully it chooses differs.
 * - easy: often a random move, sometimes takes an obvious capture
 * - medium: the classic opponent (captures, values facing empty fields, effects, terrain)
 * - hard: also weighs the player's likely answer and open sides; checks every continuation in the last moves
 */
export type AiLevel = 'easy' | 'medium' | 'hard';
export const AI_LEVELS: AiLevel[] = ['easy', 'medium', 'hard'];

export interface AiOptions {
  level?: AiLevel;
  /** Classes the opponent likes to play early (small preference, no extra strength). */
  prefer?: readonly CardClass[];
}

export function chooseCpuMove(state: BattleState, rng: Rng, options: AiOptions = {}): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('No legal moves');
  const level = options.level ?? 'medium';
  if (level === 'easy') return easyMove(state, moves, rng);
  const side = state.turn;
  const prefer = new Set(options.prefer ?? []);
  const view = level === 'hard' ? publicView(state, side) : state;
  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const card = state.hands[side][move.handIndex];
    const s = level === 'hard' ? hardScore(view, move, prefer) + rng() : mediumScore(state, move) + rng() * 3 + preferBonus(card, prefer);
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
}

function preferBonus(card: HandCard, prefer: ReadonlySet<CardClass>): number {
  const cls = getCard(card.cardId).cls;
  return cls && prefer.has(cls) ? 2 : 0;
}

function handValues(card: HandCard, rot = 0): Values {
  return rotateValues([cardValue(card, 'top'), cardValue(card, 'right'), cardValue(card, 'bottom'), cardValue(card, 'left')], rot);
}

/** The classic opponent: prefers immediate captures (chains included), then safe placements. */
function mediumScore(state: BattleState, move: Move): number {
  const side = state.turn;
  const card = state.hands[side][move.handIndex];
  const flips = computeFlips(state.board, move.cell, card, side, state.terrain, move.target, move.rot ?? 0).length;
  const v = handValues(card, move.rot ?? 0);
  // Defensive bonus: strong values facing empty cells, small penalty for weak exposed sides.
  let defense = 0;
  for (const n of neighbours(move.cell)) {
    if (state.board[n.cell] === null && !state.rocks.includes(n.cell)) defense += v[DIR_ORDER.indexOf(n.mine)] - 5;
  }
  // Keep strong cards for later when nothing can be captured.
  const power = v[0] + v[1] + v[2] + v[3];
  return flips * 100 + defense * 2 - (flips === 0 ? power * 0.5 : 0);
}

/** Easy: half of the time a random move; otherwise a capture if there is one. */
function easyMove(state: BattleState, moves: Move[], rng: Rng): Move {
  const random = moves[Math.floor(rng() * moves.length)];
  if (rng() < 0.5) return random;
  const side = state.turn;
  const captures = moves.filter((m) => computeFlips(state.board, m.cell, state.hands[side][m.handIndex], side, state.terrain, m.target, m.rot ?? 0).length > 0);
  return captures.length > 0 ? captures[Math.floor(rng() * captures.length)] : random;
}

/**
 * What `side` can know: the opponent's hand is replaced by cautious stand-ins – per side the strongest value
 * among the cards the opponent has placed so far (6/6/6/6 before any card is shown).
 */
export function publicView(state: BattleState, side: Side): BattleState {
  const opp = other(side);
  const shown = state.board.filter((c) => c && c.placedBy === opp).map((c) => getCard(c!.cardId));
  const avg = (k: 'top' | 'right' | 'bottom' | 'left') => (shown.length ? Math.max(...shown.map((c) => c[k])) : 6);
  const id = virtualCard([avg('top'), avg('right'), avg('bottom'), avg('left')]);
  return { ...state, hands: { ...state.hands, [opp]: state.hands[opp].map(() => ({ cardId: id, mod: 0 })) } };
}

/** In the last moves the hard opponent looks at every possible continuation (few enough to check them all). */
const ENDGAME_MOVES = 5;
/** Above this many possibilities per move (e.g. Wirbelwind turns) the endgame search waits one more move. */
const ENDGAME_BRANCH_LIMIT = 40;

/** Board difference from `side`'s point of view after perfect play by both sides. */
function solve(state: BattleState, side: Side): number {
  if (isGameOver(state)) {
    let d = 0;
    for (const c of state.board) if (c) d += c.owner === side ? 1 : -1;
    return d;
  }
  let best = state.turn === side ? -Infinity : Infinity;
  for (const m of legalMoves(state)) {
    const v = solve(applyMove(state, m), side);
    best = state.turn === side ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/**
 * Hard: the move itself (captures, effective values after effects and terrain facing open fields),
 * minus the most the player could capture with a likely answer, and keeping strong cards when nothing is won.
 * In the last moves it checks every continuation instead. `state` is the public view (no hidden cards).
 */
function hardScore(state: BattleState, move: Move, prefer: ReadonlySet<CardClass>): number {
  const side = state.turn;
  const next = applyMove(state, move);
  const left = totalMoves(state) - state.moveCount;
  if (left <= ENDGAME_MOVES && legalMoves(state).length <= ENDGAME_BRANCH_LIMIT) return solve(next, side) * 1000;
  const card = state.hands[side][move.handIndex];
  const flips = next.lastFlips.length;
  const info = cellBreakdown(next.board, next.terrain, move.cell);
  let open = 0;
  for (const n of neighbours(move.cell)) {
    if (next.board[n.cell] === null && !next.rocks.includes(n.cell)) open += info.values[DIR_ORDER.indexOf(n.mine)] - 5;
  }
  // The player's likely answer with the stand-in cards (how many cards they could take back).
  let answer = 0;
  for (const reply of legalMoves(next)) {
    const n = computeFlips(next.board, reply.cell, next.hands[next.turn][reply.handIndex], next.turn, next.terrain, reply.target, reply.rot ?? 0).length;
    if (n > answer) answer = n;
  }
  const power = info.base.reduce((a, b) => a + b, 0);
  return flips * 100 - answer * 60 + open * 2 - (flips === 0 ? power * 1.5 : 0) + preferBonus(card, prefer);
}

// ---------- Runes ----------

/**
 * Value of a position for `side`: cards owned on the board, how well the own cards are protected (values facing
 * free fields – what Verdrehung and Glut improve), and the best placement available now.
 */
function positionValue(state: BattleState, side: Side): number {
  const s = score(state);
  let guard = 0;
  state.board.forEach((c, i) => {
    if (!c || c.owner !== side) return;
    const v = cellBreakdown(state.board, state.terrain, i).values;
    for (const n of neighbours(i)) if (state.board[n.cell] === null && !state.rocks.includes(n.cell)) guard += v[DIR_ORDER.indexOf(n.mine)] - 5;
  });
  const material = (side === 'player' ? s.player - s.cpu : s.cpu - s.player) * 100 + guard * 8;
  if (isGameOver(state) || state.turn !== side) return material;
  let best = -Infinity;
  for (const m of legalMoves(state)) best = Math.max(best, mediumScore(state, m));
  return material + (best === -Infinity ? 0 : best);
}

/** Every valid way to use the rune right now (small lists: at most a few dozen). */
export function runeOptions(state: BattleState): RuneUse[] {
  const slot = state.runes[state.turn];
  const def = slot && !slot.used ? findRune(slot.id) : null;
  if (!def) return [];
  const r = runeRules(def);
  const { cells, classes } = runeChoices(state, state.turn, def);
  const subsets = (list: number[]): number[][] => {
    const out: number[][] = [];
    const rec = (start: number, acc: number[]) => {
      if (acc.length > 0) out.push(acc);
      if (acc.length === r.maxTargets) return;
      for (let i = start; i < list.length; i++) rec(i + 1, [...acc, list[i]]);
    };
    rec(0, []);
    return out;
  };
  const uses: RuneUse[] = [];
  if (r.effect === 'twist') for (const c of cells) for (const dir of [1, -1] as const) uses.push({ rune: true, cell: c, dir });
  if (r.effect === 'echo') {
    for (const c of cells) {
      const can = echoCapturable(state, c);
      if (can.length > r.maxTargets) for (const sub of subsets(can).filter((x) => x.length === r.maxTargets)) uses.push({ rune: true, cell: c, capture: sub });
      else uses.push({ rune: true, cell: c });
    }
  }
  if (r.effect === 'empower') for (const sub of subsets(cells)) uses.push({ rune: true, cells: sub });
  if (r.effect === 'curse') {
    for (const cls of classes) for (const sub of subsets(cells.filter((c) => getCard(state.board[c]!.cardId).cls === cls))) uses.push({ rune: true, cls, cells: sub });
  }
  return uses.filter((u) => runeProblem(state, u) === null);
}

/**
 * Should the computer use its rune now – and how? Only when it clearly pays off: the bar is high early in
 * the duel (the rune may be worth more later) and drops towards the end; on its last placement it uses
 * the rune whenever it helps at all. Easy opponents rarely think of their rune.
 */
export function chooseCpuRune(state: BattleState, rng: Rng, options: AiOptions = {}): RuneUse | null {
  const side = state.turn;
  const slot = state.runes[side];
  if (!slot || slot.used || isGameOver(state)) return null;
  const level = options.level ?? 'medium';
  if (level === 'easy' && rng() > 0.25) return null;
  const view = publicView(state, side);
  const before = positionValue(view, side);
  let best: RuneUse | null = null;
  let gain = 0;
  for (const use of runeOptions(state)) {
    const g = positionValue(applyRune(view, use), side) - before;
    if (g > gain) {
      gain = g;
      best = use;
    }
  }
  if (!best) return null;
  const ownMovesLeft = state.hands[side].length;
  const bar = ownMovesLeft <= 1 ? 1 : ownMovesLeft <= 3 ? 60 : level === 'hard' ? 140 : 110;
  return gain >= bar ? best : null;
}

/** Chance per rarity for the computer's cards – tuned (by simulation) to match the difficulty of version 1.1. */
export const CPU_SHARE: Record<Rarity, number> = { common: 60, uncommon: 35, rare: 5, epic: 0, legendary: 0, mythic: 0 };

/** Draws 8 distinct cards for the computer, mostly commons and uncommons. */
export function drawCpuHand(rng: Rng): HandCard[] {
  const pool = [...CARDS];
  const hand: string[] = [];
  while (hand.length < HAND_SIZE) {
    // Fall back to any card if the active catalog has none of the usual rarities left.
    const card = pickByRarity(rng, pool, CPU_SHARE) ?? pool[Math.floor(rng() * pool.length)];
    pool.splice(pool.indexOf(card), 1);
    hand.push(card.id);
  }
  return toHand(hand);
}
