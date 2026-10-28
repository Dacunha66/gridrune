// Computer opponent in three levels; the adventure duel uses the classic "medium" opponent.
// Effects are understood through computeFlips, which plays them out exactly like the real move.
import {
  BattleState, DIR_ORDER, HAND_SIZE, HandCard, Move, Side, applyMove, cardValue, cellBreakdown, computeFlips, isGameOver, legalMoves, neighbours, toHand,
  totalMoves,
} from './battle';
import { CARDS, Rarity, getCard, pickByRarity } from './cards';
import { CardClass } from './effects';
import { Rng } from './rng';

/**
 * Strength of the computer opponent (campaign). Every level plays by the same rules and values –
 * only how carefully it chooses differs.
 * - easy: often a random move, sometimes takes an obvious capture
 * - medium: the classic opponent (captures, values facing empty fields, effects, terrain)
 * - hard: also weighs the player's best answer and open sides; checks every continuation in the last 5 moves
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
  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const card = state.hands[side][move.handIndex];
    const s = level === 'hard' ? hardScore(state, move, prefer) + rng() : mediumScore(state, move) + rng() * 3 + preferBonus(card, prefer);
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

/** The classic opponent: prefers immediate captures, then safe placements. */
function mediumScore(state: BattleState, move: Move): number {
  const side = state.turn;
  const card = state.hands[side][move.handIndex];
  const flips = computeFlips(state.board, move.cell, card, side, state.terrain, move.target).length;
  // Defensive bonus: strong values facing empty cells, small penalty for weak exposed sides.
  let defense = 0;
  for (const n of neighbours(move.cell)) {
    if (state.board[n.cell] === null && !state.rocks.includes(n.cell)) defense += cardValue(card, n.mine) - 5;
  }
  // Keep strong cards for later when nothing can be captured.
  const power = cardValue(card, 'top') + cardValue(card, 'right') + cardValue(card, 'bottom') + cardValue(card, 'left');
  return flips * 100 + defense * 2 - (flips === 0 ? power * 0.5 : 0);
}

/** Easy: half of the time a random move; otherwise a capture if there is one. */
function easyMove(state: BattleState, moves: Move[], rng: Rng): Move {
  const random = moves[Math.floor(rng() * moves.length)];
  if (rng() < 0.5) return random;
  const side = state.turn;
  const captures = moves.filter((m) => computeFlips(state.board, m.cell, state.hands[side][m.handIndex], side, state.terrain, m.target).length > 0);
  return captures.length > 0 ? captures[Math.floor(rng() * captures.length)] : random;
}

/** In the last moves the hard opponent looks at every possible continuation (few enough to check them all). */
const ENDGAME_MOVES = 5;

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
 * minus the most the player could capture with the answer, and keeping strong cards when nothing is won.
 * In the last moves it checks every continuation instead.
 */
function hardScore(state: BattleState, move: Move, prefer: ReadonlySet<CardClass>): number {
  const side = state.turn;
  const next = applyMove(state, move);
  if (totalMoves(state) - state.moveCount <= ENDGAME_MOVES) return solve(next, side) * 1000;
  const card = state.hands[side][move.handIndex];
  const flips = next.lastFlips.length;
  const info = cellBreakdown(next.board, next.terrain, move.cell);
  let open = 0;
  for (const n of neighbours(move.cell)) {
    if (next.board[n.cell] === null && !next.rocks.includes(n.cell)) open += info.values[DIR_ORDER.indexOf(n.mine)] - 5;
  }
  // The player's best immediate answer (how many cards they could take back).
  let answer = 0;
  for (const reply of legalMoves(next)) {
    const n = computeFlips(next.board, reply.cell, next.hands[next.turn][reply.handIndex], next.turn, next.terrain, reply.target).length;
    if (n > answer) answer = n;
  }
  const power = info.base.reduce((a, b) => a + b, 0);
  return flips * 100 - answer * 60 + open * 2 - (flips === 0 ? power * 1.5 : 0) + preferBonus(card, prefer);
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
