// Phase 4: adventure runs that the server can check. A run starts with a seed from the server; the track, the
// arena, the opponent's hand and rune, the coin toss and every move of the computer follow from it. The game
// records the player's lane changes and actions; the server replays everything with exactly this code and only
// then pays the reward. The same functions run in the game (to play) and on the server (to check).
import { ARENAS, Arena, pickArena } from './arenas';
import { AiOptions, chooseCpuMove, chooseCpuRune, drawCpuHand } from './ai';
import { BattleState, HAND_SIZE, HandCard, Outcome, Side, coinToss, cpuChoosesFirst, createBattle, isGameOver, outcome, score, toHand } from './battle';
import { CLASSIC_ARENA } from './arenas';
import { Mission, Opponent, findArena, missionPool } from './campaign';
import { DuelStats, duelStats } from './campaignGoals';
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

/** What a runner track is built from (adventure and campaign runs). */
export interface RunTicket {
  seed: string;
  deck: string[];
  owned: string[];
}

/** A recorded duel: who started (after the coin toss) and every move of both sides. */
export interface DuelLog {
  first: Side;
  moves: Action[];
}

/** Recorded by the game while playing. */
export interface AdventureLog {
  run: { inputs: RunInput[]; skippedAt: number | null };
  duel: DuelLog;
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
export function adventureRunner(ticket: RunTicket, rng: Rng = adventureRngs(ticket.seed).runner): RunnerSim {
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
export function replayAdventureRun(ticket: RunTicket, log: AdventureLog['run']): { picks: Pick[]; error: string | null } {
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
 * Replays a duel from its start position: the coin toss and the computer's moves follow from the random sources,
 * every player action must be legal. `begin` is the position after the toss (start of the recorded moves).
 */
export function replayDuel(start: BattleState, log: DuelLog, rngs: { toss: Rng; ai: Rng }, ai?: AiOptions):
  { ok: true; begin: BattleState; end: BattleState } | { ok: false; error: string } {
  if (!log || !Array.isArray(log.moves)) return { ok: false, error: 'Duell fehlt' };
  // Coin toss: if the player wins, they choose; if the computer wins, it decides.
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : log.first;
  if (first !== 'player' && first !== 'cpu') return { ok: false, error: 'Ungültiger Start' };
  if (winner === 'cpu' && log.first !== first) return { ok: false, error: 'Falscher Start nach dem Münzwurf' };
  const begin: BattleState = { ...start, turn: first };
  let state = begin;
  const moves = log.moves;
  let i = 0;
  let guard = 0;
  while (!isGameOver(state)) {
    if (++guard > 200) return { ok: false, error: 'Duell zu lang' };
    if (state.turn === 'cpu') {
      // Exactly like the game: the computer may use its rune first, then it places a card.
      const use = chooseCpuRune(state, rngs.ai, ai);
      const action: Action = use ?? chooseCpuMove(state, rngs.ai, ai);
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
  return { ok: true, begin, end: state };
}

/**
 * Checks a whole adventure: the run gives the hand, the coin toss and the computer's moves follow from the seed,
 * every player action must be legal. Returns the result the server pays out for.
 */
export function checkAdventure(ticket: AdventureTicket, log: AdventureLog, arenas: readonly Arena[] = ARENAS): AdventureCheck {
  const run = replayAdventureRun(ticket, log.run);
  if (run.error) return { ok: false, error: run.error };
  if (run.picks.length !== 8) return { ok: false, error: 'Lauf unvollständig' };
  const rngs = adventureRngs(ticket.seed);
  let start: BattleState;
  try {
    start = adventureDuel(ticket, run.picks, rngs, arenas).start;
  } catch {
    return { ok: false, error: 'Duell konnte nicht aufgebaut werden' };
  }
  const duel = replayDuel(start, log.duel, rngs);
  if (!duel.ok) return duel;
  return { ok: true, picks: run.picks, outcome: outcome(duel.end), score: score(duel.end) };
}

// ---------- Campaign missions (phase 4c) ----------

/** What the server hands out when a mission starts. */
export interface MissionTicket {
  id: string;
  seed: string;
  missionId: string;
  /** The player's deck (runner missions build the track from it). */
  deck: string[];
  owned: string[];
  /** Duel missions: the 8 cards chosen in the briefing (checked against the mission's card pool). */
  hand: string[] | null;
  playerRune: string | null;
  cpuRune: string | null;
}

export interface MissionLog {
  /** Runner missions only. */
  run: AdventureLog['run'] | null;
  duel: DuelLog;
}

export type MissionCheck =
  | { ok: true; outcome: Outcome; score: Record<Side, number>; stats: DuelStats }
  | { ok: false; error: string };

export function missionRngs(seed: string) {
  return { runner: deriveRng(seed, 'runner'), toss: deriveRng(seed, 'toss'), ai: deriveRng(seed, 'ai') };
}

/** Start position of a mission duel (before the coin toss) – the game plays it, the server replays it. */
export function missionStart(ticket: MissionTicket, mission: Mission, opponent: Opponent, picks: readonly Pick[], arenas: readonly Arena[] = ARENAS): BattleState {
  const arena = findArena(mission.arenaId, arenas) ?? CLASSIC_ARENA;
  return createBattle(picks.map((p) => ({ cardId: p.cardId, mod: p.mod })), toHand(opponent.deck), 'player', [], arena.cells, { player: ticket.playerRune, cpu: ticket.cpuRune });
}

/** The hand of a duel mission as runner picks (no discoveries, no modifiers). */
export const handPicks = (hand: readonly string[]): Pick[] => hand.map((cardId, i) => ({ cardId, kind: 'deck', gate: i, mod: 0 }));

/** Is the chosen hand allowed for this mission (8 different cards from the mission's pool)? */
export function validMissionHand(mission: Mission, deck: readonly string[], hand: unknown): hand is string[] {
  if (!Array.isArray(hand) || hand.length !== HAND_SIZE || new Set(hand).size !== HAND_SIZE) return false;
  const pool = new Set(missionPool(mission, deck).map((c) => c.cardId));
  return hand.every((id) => typeof id === 'string' && pool.has(id));
}

/** Checks a whole mission: run (if any), the duel with the opponent's level, then the star statistics. */
export function checkMission(ticket: MissionTicket, log: MissionLog, mission: Mission, opponent: Opponent, arenas: readonly Arena[] = ARENAS): MissionCheck {
  if (!log || !log.duel) return { ok: false, error: 'Protokoll fehlt' };
  const rngs = missionRngs(ticket.seed);
  let picks: Pick[];
  let stumbles: number | null = null;
  if (mission.mode === 'runner') {
    if (!log.run) return { ok: false, error: 'Lauf fehlt' };
    const run = replayAdventureRun(ticket, log.run);
    if (run.error) return { ok: false, error: run.error };
    if (run.picks.length !== HAND_SIZE) return { ok: false, error: 'Lauf unvollständig' };
    picks = run.picks;
    stumbles = picks.filter((p) => p.mod < 0).length;
  } else {
    if (!ticket.hand) return { ok: false, error: 'Hand fehlt' };
    picks = handPicks(ticket.hand);
  }
  let start: BattleState;
  try {
    start = missionStart(ticket, mission, opponent, picks, arenas);
  } catch {
    return { ok: false, error: 'Duell konnte nicht aufgebaut werden' };
  }
  const duel = replayDuel(start, log.duel, rngs, { level: opponent.level, prefer: opponent.prefer });
  if (!duel.ok) return duel;
  return { ok: true, outcome: outcome(duel.end), score: score(duel.end), stats: duelStats(duel.begin, log.duel.moves, stumbles) };
}
