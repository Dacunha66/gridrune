import { describe, expect, it } from 'vitest';
import { AdventureLog, AdventureTicket, adventureDuel, adventureRngs, adventureRunner, checkAdventure } from '../src/game/verify';
import { STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyMove, coinToss, cpuChoosesFirst, isGameOver, legalMoves, outcome } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';

const ticket = (seed: string, rune: string | null = null): AdventureTicket => ({
  id: 't1', seed, deck: [...STARTER_DECK], owned: [...STARTING_UNLOCKED], playerRune: rune, cpuRune: rune ? 'random' : null,
});

/** Plays a run and a duel exactly like the game does (random lane changes and moves for the player). */
function play(t: AdventureTicket, choices: number, skip = false): { log: AdventureLog; result: string; picks: string[] } {
  const me = createRng(choices);
  const sim = adventureRunner(t);
  let steps = 0;
  while (!sim.finished && steps++ < 5000) {
    if (me() < 0.04) sim.moveLane(me() < 0.5 ? -1 : 1);
    if (skip && sim.distance > 30) {
      const at = sim.distance;
      sim.skipToEnd();
      return finishDuel(t, { inputs: sim.inputs.slice(), skippedAt: at }, sim.picks, me);
    }
    sim.update(1 / 30);
  }
  return finishDuel(t, { inputs: sim.inputs.slice(), skippedAt: null }, sim.picks, me);
}

function finishDuel(t: AdventureTicket, run: AdventureLog['run'], picks: { cardId: string }[], me: () => number) {
  const rngs = adventureRngs(t.seed);
  // The game asks for runner rng first (same seed) – adventureDuel derives its own sources.
  let state = adventureDuel(t, picks as never, rngs).start;
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const moves: Action[] = [];
  while (!isGameOver(state)) {
    if (state.turn === 'cpu') {
      const use = chooseCpuRune(state, rngs.ai);
      const a: Action = use ?? chooseCpuMove(state, rngs.ai);
      moves.push(a);
      state = applyAction(state, a);
    } else {
      const legal = legalMoves(state);
      const m = legal[Math.floor(me() * legal.length)];
      moves.push(m);
      state = applyMove(state, m);
    }
  }
  return { log: { run, duel: { first, moves } }, result: outcome(state), picks: picks.map((p) => p.cardId) };
}

describe('Abenteuer vom Server geprüft (Phase 4)', () => {
  it('ein ehrlich gespielter Lauf + Duell wird bestätigt – mit identischem Ergebnis', () => {
    for (let s = 1; s <= 12; s++) {
      const t = ticket(`seed-${s}`, s % 3 === 0 ? 'rn01' : null);
      const { log, result, picks } = play(t, s, s % 4 === 0);
      const check = checkAdventure(t, log);
      expect(check.ok, JSON.stringify(check)).toBe(true);
      if (check.ok) {
        expect(check.outcome).toBe(result);
        expect(check.picks.map((p) => p.cardId)).toEqual(picks);
      }
    }
  });
  it('manipulierte Protokolle werden abgelehnt', () => {
    const t = ticket('seed-x');
    const { log } = play(t, 7);
    const firstPlayer = log.duel.moves.findIndex((_, i) => (log.duel.first === 'player' ? i % 2 === 0 : i % 2 === 1));
    const cheat1 = structuredClone(log);
    (cheat1.duel.moves[firstPlayer] as { cell: number }).cell = 99;
    expect(checkAdventure(t, cheat1)).toMatchObject({ ok: false });
    const cpuIdx = log.duel.moves.findIndex((_, i) => (log.duel.first === 'cpu' ? i % 2 === 0 : i % 2 === 1));
    const cheat2 = structuredClone(log);
    const other = cheat2.duel.moves[cpuIdx] as { cell: number };
    other.cell = (other.cell + 1) % 16;
    expect(checkAdventure(t, cheat2)).toMatchObject({ ok: false });
    const cheat3 = structuredClone(log);
    cheat3.duel.moves.pop();
    expect(checkAdventure(t, cheat3)).toMatchObject({ ok: false });
    const cheat4 = structuredClone(log);
    cheat4.run.inputs = [{ d: 5, lane: 0 }, { d: 5.1, lane: 2 }];
    expect(checkAdventure(t, cheat4)).toMatchObject({ ok: false });
  });
  it('ein anderer Seed ergibt einen anderen Lauf (Protokoll passt nicht mehr)', () => {
    const { log } = play(ticket('seed-a'), 3);
    expect(checkAdventure(ticket('seed-b'), log).ok).toBe(false);
  });
});
