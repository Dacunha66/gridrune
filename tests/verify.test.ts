import { describe, expect, it } from 'vitest';
import {
  AdventureLog, AdventureTicket, LeagueLog, LeagueTicket, adventureDuel, adventureRngs, adventureRunner, checkAdventure, checkLeague, leagueCpuHand, leagueCpuRune, leagueRound,
} from '../src/game/verify';
import { RunnerSim } from '../src/game/runner';
import { leagueLayout } from '../src/game/league';
import { emptyMatch, nextStep, recordRound } from '../src/game/match';
import { createBattle } from '../src/game/battle';
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
  const ai = { level: t.level ?? 'medium' } as const;
  const rngs = adventureRngs(t.seed);
  // The game asks for runner rng first (same seed) – adventureDuel derives its own sources.
  let state = adventureDuel(t, picks as never, rngs).start;
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const moves: Action[] = [];
  while (!isGameOver(state)) {
    if (state.turn === 'cpu') {
      const use = chooseCpuRune(state, rngs.ai, ai);
      const a: Action = use ?? chooseCpuMove(state, rngs.ai, ai);
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

/** Plays a whole league match like the game: run on the league track, then rounds until the match is decided. */
function playLeague(t: LeagueTicket, choices: number): { log: LeagueLog; winner: string } {
  const me = createRng(choices);
  const sim = new RunnerSim(leagueLayout(t.seed, 'du', t.deck));
  let steps = 0;
  while (!sim.finished && steps++ < 5000) {
    if (me() < 0.04) sim.moveLane(me() < 0.5 ? -1 : 1);
    sim.update(1 / 30);
  }
  const hand = sim.picks.map((p) => ({ cardId: p.cardId, mod: p.mod }));
  let match = emptyMatch();
  const rounds: LeagueLog['rounds'] = [];
  for (;;) {
    const step = nextStep(match);
    if (step.kind === 'done') return { log: { run: sim.inputs.slice(), rounds }, winner: step.winner };
    const r = leagueRound(t.seed, step.round);
    let state = createBattle(hand, leagueCpuHand(t.seed), 'player', r.rocks, r.arena.cells, { player: t.playerRune, cpu: t.cpuRune });
    let first = step.first;
    if (!first) {
      const w = coinToss(r.toss);
      first = w === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
    }
    state = { ...state, turn: first };
    const moves: Action[] = [];
    while (!isGameOver(state)) {
      if (state.turn === 'cpu') {
        const a: Action = chooseCpuRune(state, r.ai) ?? chooseCpuMove(state, r.ai);
        moves.push(a);
        state = applyAction(state, a);
      } else {
        const legal = legalMoves(state);
        const m = legal[Math.floor(me() * legal.length)];
        moves.push(m);
        state = applyMove(state, m);
      }
    }
    rounds.push({ first, moves });
    const res = outcome(state);
    match = recordRound(match, first, res === 'win' ? 'player' : res === 'loss' ? 'cpu' : 'draw');
  }
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

describe('Schwierigkeit im einfachen Spiel', () => {
  it('Leicht und Schwer werden mit der gewählten Stufe nachgespielt', () => {
    for (const level of ['easy', 'hard'] as const) {
      for (let s = 1; s <= 4; s++) {
        const t = { ...ticket(`lvl-${level}-${s}`), level };
        const { log, result } = play(t, s);
        const check = checkAdventure(t, log);
        expect(check.ok, JSON.stringify(check)).toBe(true);
        if (check.ok) expect(check.outcome).toBe(result);
      }
    }
  });
  it('ein Duell gegen Leicht gilt nicht als Duell gegen Schwer', () => {
    let rejected = 0;
    for (let s = 1; s <= 6; s++) {
      const easy = { ...ticket(`swap-${s}`), level: 'easy' as const };
      const { log } = play(easy, s);
      if (!checkAdventure({ ...easy, level: 'hard' }, log).ok) rejected++;
    }
    expect(rejected).toBeGreaterThanOrEqual(5);
  });
});

describe('Rangliste vom Server geprüft', () => {
  const deck = [...STARTER_DECK];
  const lt = (seed: string): LeagueTicket => ({ id: 'l1', seed, deck, playerRune: null, cpuRune: leagueCpuRune(seed, false) });

  it('ein ehrlich gespieltes Match wird bestätigt – mit demselben Sieger', () => {
    let playerWins = 0;
    for (let s = 1; s <= 10; s++) {
      const t = lt(`league-${s}`);
      const { log, winner } = playLeague(t, s);
      const check = checkLeague(t, log);
      expect(check.ok, JSON.stringify(check).slice(0, 300)).toBe(true);
      if (check.ok) {
        expect(check.winner).toBe(winner);
        expect(check.rounds.length).toBe(log.rounds.length);
        expect(check.picks).toHaveLength(8);
        if (winner === 'player') playerWins++;
      }
    }
    expect(playerWins).toBeLessThan(10);
  });

  it('manipulierte Matches werden abgelehnt', () => {
    const t = lt('league-cheat');
    const { log } = playLeague(t, 3);
    const noLast = structuredClone(log);
    noLast.rounds.pop();
    expect(checkLeague(t, noLast).ok).toBe(false);
    const extra = structuredClone(log);
    extra.rounds.push(structuredClone(log.rounds[0]));
    expect(checkLeague(t, extra).ok).toBe(false);
    const wrongStart = structuredClone(log);
    wrongStart.rounds[1].first = wrongStart.rounds[1].first === 'player' ? 'cpu' : 'player';
    expect(checkLeague(t, wrongStart).ok).toBe(false);
    const badMove = structuredClone(log);
    const i = badMove.rounds[0].first === 'player' ? 0 : 1;
    (badMove.rounds[0].moves[i] as { cell: number }).cell = 99;
    expect(checkLeague(t, badMove).ok).toBe(false);
    const otherDeck = { ...t, deck: [...deck].reverse() };
    expect(checkLeague(otherDeck, log).ok).toBe(false);
  });
});
