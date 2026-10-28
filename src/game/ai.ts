// Simple computer opponent: prefers immediate captures, then safe placements.
// Effects are understood through computeFlips, which plays them out exactly like the real move.
import { BattleState, HAND_SIZE, HandCard, Move, cardValue, computeFlips, legalMoves, neighbours, toHand } from './battle';
import { CARDS, Rarity, pickByRarity } from './cards';
import { Rng } from './rng';

export function chooseCpuMove(state: BattleState, rng: Rng): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('No legal moves');
  const side = state.turn;
  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const card = state.hands[side][move.handIndex];
    const flips = computeFlips(state.board, move.cell, card, side, state.terrain, move.target).length;
    // Defensive bonus: strong values facing empty cells, small penalty for weak exposed sides.
    let defense = 0;
    for (const n of neighbours(move.cell)) {
      if (state.board[n.cell] === null && !state.rocks.includes(n.cell)) defense += cardValue(card, n.mine) - 5;
    }
    // Keep strong cards for later when nothing can be captured.
    const power = cardValue(card, 'top') + cardValue(card, 'right') + cardValue(card, 'bottom') + cardValue(card, 'left');
    const s = flips * 100 + defense * 2 - (flips === 0 ? power * 0.5 : 0) + rng() * 3;
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
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
