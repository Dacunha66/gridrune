// Phase 4: adventure runs that the server can check. A run starts with a seed from the server; the track, the
// arena, the opponent's hand and rune, the coin toss and every move of the computer follow from it. The game
// records the player's lane changes and actions; the server replays everything with exactly this code and only
// then pays the reward. The same functions run in the game (to play) and on the server (to check).
import { ARENAS, Arena, pickArena } from './arenas';
import { chooseCpuMove, chooseCpuRune, drawCpuHand } from './ai';
import { BattleState, HandCard, Outcome, Side, coinToss, cpuChoosesFirst, createBattle, isGameOver, outcome, score } from './battle';
import { deriveRng } from './league';
import { Rng } from './rng';
import { Pick, RunInput, RunnerSim, FINISH_DISTANCE, validateRunInputs } from './runner';
import { Action, basicRunes, isRuneUse, applyAction } from './runes';

/** What the server hands out when a run starts (and keeps to check the result). */
export interface AdventureTicket {
  id: string;
  seed: string;
  /** The 20 deck cards the run is built from (checked against the collection by the server). */
  deck: string[];
  /** Cards owned at the start (decides which discoveries are new). */
  owned: string[];
  playerRune: string | null;
  /** The computer gets a random basic rune only when the player has one. */
  cpuRune: 'random' | null;
}

/** Recorded by the game while playing. */
export interface AdventureLog {
  run: { inputs: RunInput[]; skippedAt: number | null };
  duel: { first: Side; moves: Action[] };
}

export type AdventureCheck =
  | { ok: true; picks: Pick[]; outcome: Outcome; score: Record<Side, number> }
  | { ok: false; error: string };

/** The random sources of one run, each derived from the seed (independent of the order they are used in). */
export function adventureRngs(seed: string) {
  return {
    runner: deriveRng(seed, 'runner'),
    arena: deriveRng(seed, 'arena'),
    cpuHand: deriveRng(seed, 'cpu-hand'),
    cpuRune: deriveRng(seed, 'cpu-rune'),
    toss: deriveRng(seed, 'toss'),
    ai: deriveRng(seed, 'ai'),
  };
}

/** The runner track of the ticket (the game plays on it, the server replays on it). */
export function adventureRunner(ticket: AdventureTicket, rng: Rng = adventureRngs(ticket.seed).runner): RunnerSim {
  return new RunnerSim(ticket.deck, rng, new Set(ticket.owned));
}

/** Arena, opponent hand and runes of the duel – before the coin toss. */
export function adventureDuel(ticket: AdventureTicket, picks: Pick[], rngs = adventureRngs(ticket.seed), arenas: readonly Arena[] = ARENAS): { arena: Arena; start: BattleState } {
  const arena = pickArena(rngs.arena, arenas);
  const basic = basicRunes().map((r) => r.id);
  const cpuRune = ticket.cpuRune === 'random' && basic.length > 0 ? basic[Math.floor(rngs.cpuRune() * basic.length)] : null;
  const hand: HandCard[] = picks.map((p) => ({ cardId: p.cardId, mod: p.mod }));
  const start = createBattle(hand, drawCpuHand(rngs.cpuHand), 'player', [], arena.cells, { player: ticket.playerRune, cpu: cpuRune });
  return { arena, start };
}

/** Replays the run like the game played it: lane changes at their distances, optionally skipped to the end. */
export function replayAdventureRun(ticket: AdventureTicket, log: AdventureLog['run']): { picks: Pick[]; error: string | null } {
  const error = validateRunInputs(log.inputs);
  if (error) return { picks: [], error };
  const sim = adventureRunner(ticket);
  for (const inp of log.inputs) {
    if (log.skippedAt !== null && inp.d > log.skippedAt) return { picks: [], error: 'Eingabe nach dem Überspringen' };
    sim.advanceTo(inp.d);
    sim.setLane(inp.lane);
  }
  if (log.skippedAt !== null) {
    if (!Number.isFinite(log.skippedAt) || log.skippedAt < 0 || log.skippedAt > FINISH_DISTANCE) return { picks: [], error: 'Überspringen außerhalb der Strecke' };
    sim.advanceTo(log.skippedAt);
    sim.skipToEnd();
  } else sim.advanceTo(FINISH_DISTANCE);
  return { picks: sim.picks.slice(), error: null };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Checks a whole adventure: the run gives the hand, the coin toss and the computer's moves follow from the seed,
 * every player action must be legal. Returns the result the server pays out for.
 */
export function checkAdventure(ticket: AdventureTicket, log: AdventureLog, arenas: readonly Arena[] = ARENAS): AdventureCheck {
  const run = replayAdventureRun(ticket, log.run);
  if (run.error) return { ok: false, error: run.error };
  if (run.picks.length !== 8) return { ok: false, error: 'Lauf unvollständig' };
  const rngs = adventureRngs(ticket.seed);
  let state: BattleState;
  try {
    state = adventureDuel(ticket, run.picks, rngs, arenas).start;
  } catch {
    return { ok: false, error: 'Duell konnte nicht aufgebaut werden' };
  }
  // Coin toss: if the player wins, they choose; if the computer wins, it decides.
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : log.duel.first;
  if (first !== 'player' && first !== 'cpu') return { ok: false, error: 'Ungültiger Start' };
  if (winner === 'cpu' && log.duel.first !== first) return { ok: false, error: 'Falscher Start nach dem Münzwurf' };
  state = { ...state, turn: first };
  const moves = log.duel.moves;
  let i = 0;
  let guard = 0;
  while (!isGameOver(state)) {
    if (++guard > 200) return { ok: false, error: 'Duell zu lang' };
    if (state.turn === 'cpu') {
      // Exactly like the game: the computer may use its rune first, then it places a card.
      const use = chooseCpuRune(state, rngs.ai);
      const action: Action = use ?? chooseCpuMove(state, rngs.ai);
      if (!same(moves[i], action)) return { ok: false, error: `Gegnerzug ${i + 1} weicht ab` };
      state = applyAction(state, action);
      i++;
      continue;
    }
    const action = moves[i];
    if (!action) return { ok: false, error: 'Duell nicht zu Ende gespielt' };
    try {
      state = applyAction(state, isRuneUse(action) ? action : { ...action });
    } catch {
      return { ok: false, error: `Unerlaubter Zug ${i + 1}` };
    }
    i++;
  }
  if (i !== moves.length) return { ok: false, error: 'Zusätzliche Züge nach Spielende' };
  return { ok: true, picks: run.picks, outcome: outcome(state), score: score(state) };
}
