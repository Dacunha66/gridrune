// Match format for leagues: two duels with swapped start; 2:0 wins, 1:1 goes to a decider.
import { Side, other } from './battle';

export type RoundWinner = Side | 'draw';

export interface MatchProgress {
  /** Who started each round played so far. */
  starts: Side[];
  winners: RoundWinner[];
}

export type NextStep =
  | { kind: 'round'; round: number; /** null = decided by a coin toss with choice */ first: Side | null; decider: boolean }
  | { kind: 'done'; winner: Side };

export function emptyMatch(): MatchProgress {
  return { starts: [], winners: [] };
}

export function wins(p: MatchProgress, side: Side): number {
  return p.winners.filter((w) => w === side).length;
}

/**
 * Round 1: coin toss decides who starts. Round 2: the other side starts.
 * After two rounds: 2:0 (or 1:0 with a draw) wins; otherwise a decider with a new coin toss,
 * repeated until somebody wins (with the rock rule a duel cannot end in a draw).
 */
export function nextStep(p: MatchProgress): NextStep {
  const n = p.winners.length;
  if (n === 0) return { kind: 'round', round: 1, first: null, decider: false };
  if (n === 1) return { kind: 'round', round: 2, first: other(p.starts[0]), decider: false };
  const a = wins(p, 'player');
  const b = wins(p, 'cpu');
  if (a !== b) return { kind: 'done', winner: a > b ? 'player' : 'cpu' };
  return { kind: 'round', round: n + 1, first: null, decider: true };
}

export function recordRound(p: MatchProgress, first: Side, winner: RoundWinner): MatchProgress {
  return { starts: [...p.starts, first], winners: [...p.winners, winner] };
}
