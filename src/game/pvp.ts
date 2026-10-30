// Online duels between two players. The server keeps the one true duel state in fixed orientation
// ("player" = the player who created the match, "cpu" = the one who joined) and applies every move with the
// normal rules. Each player only ever gets a view from their own side: the board turned so that they are
// "player", and the opponent's hand hidden (only the number of cards is visible).
import { BattleState, HAND_SIZE, HandCard, Move, Side, createBattle, isGameOver, legalMoves, outcome, score } from './battle';
import { ARENAS, Arena, leagueArena } from './arenas';
import { CARDS, getCard } from './cards';
import { deriveRng, roundRock } from './league';
import { Action, applyAction, isRuneUse } from './runes';

/** Seconds a player has for one move; then the server plays a random card for them. */
export const PVP_TURN_SECONDS = 30;
/** Seconds without a sign of life after which the player who is still there wins. */
export const PVP_ABSENT_SECONDS = 20;
/** Coins for a win (like an adventure win). */
export const PVP_WIN_COINS = 100;
/** Paid wins per day against the same opponent (more wins still count in the statistics). */
export const PVP_DAILY_PAID_WINS = 3;
/** A win by absence only pays if the duel had really started (at least this many moves). */
export const PVP_MIN_MOVES_FOR_COINS = 4;

export type Seat = 'a' | 'b';
export const seatSide = (seat: Seat): Side => (seat === 'a' ? 'player' : 'cpu');
export const otherSeat = (seat: Seat): Seat => (seat === 'a' ? 'b' : 'a');

const HIDDEN = 'hidden';

/** Swaps the two sides everywhere in a value ("player" ↔ "cpu"): side names as text and objects keyed by side. */
export function swapSides<T>(value: T): T {
  const swap = (v: unknown): unknown => {
    if (v === 'player') return 'cpu';
    if (v === 'cpu') return 'player';
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) out[k === 'player' ? 'cpu' : k === 'cpu' ? 'player' : k] = swap(x);
      return out;
    }
    return v;
  };
  return swap(value) as T;
}

/** The duel as one player sees it: own side = "player", the opponent's hand replaced by hidden cards. */
export function viewState(state: BattleState, seat: Seat): BattleState {
  const turned = seat === 'a' ? state : swapSides(state);
  return { ...turned, hands: { player: turned.hands.player, cpu: turned.hands.cpu.map(() => ({ cardId: HIDDEN, mod: 0 })) } };
}

/** Is this a usable hand: 8 different active cards the player owns? */
export function validPvpHand(hand: unknown, owned: readonly string[]): hand is string[] {
  if (!Array.isArray(hand) || hand.length !== HAND_SIZE || new Set(hand).size !== HAND_SIZE) return false;
  const active = new Set(CARDS.map((c) => c.id));
  const have = new Set(owned);
  return hand.every((id) => typeof id === 'string' && active.has(id) && have.has(id));
}

/** Start position: ranked arena and one rock from the seed (fair for both), the seed decides who starts. */
export function startPvp(seed: string, handA: readonly string[], handB: readonly string[], runeA: string | null, runeB: string | null,
  arenas: readonly Arena[] = ARENAS): { state: BattleState; arena: Arena } {
  const arena = leagueArena(seed, 0, arenas);
  const first: Side = deriveRng(seed, 'toss')() < 0.5 ? 'player' : 'cpu';
  const toHand = (ids: readonly string[]): HandCard[] => ids.map((cardId) => ({ cardId, mod: 0 }));
  const rock = roundRock(seed, 0, arena.cells);
  return { arena, state: createBattle(toHand(handA), toHand(handB), first, [rock], arena.cells, { player: runeA, cpu: runeB }) };
}

/** Applies one action of `seat` (sent from that player's own view – hand indices and cells are the same). */
export function pvpAction(state: BattleState, seat: Seat, action: unknown): { ok: true; state: BattleState } | { ok: false; error: string } {
  if (isGameOver(state)) return { ok: false, error: 'over' };
  if (state.turn !== seatSide(seat)) return { ok: false, error: 'not_your_turn' };
  if (!action || typeof action !== 'object') return { ok: false, error: 'bad_action' };
  const a = action as Record<string, unknown>;
  const clean: Action = isRuneUse(action as Action)
    ? (action as Action)
    : {
      handIndex: Number(a.handIndex), cell: Number(a.cell),
      ...(a.target !== undefined ? { target: Number(a.target) } : {}), ...(a.rot !== undefined ? { rot: Number(a.rot) } : {}),
    } as Move;
  try {
    return { ok: true, state: applyAction(state, clean) };
  } catch {
    return { ok: false, error: 'illegal' };
  }
}

/** Time is up: a random legal card for the side to move (recomputable from the seed). */
export function timeoutMove(state: BattleState, seed: string): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  return moves[Math.floor(deriveRng(seed, `timeout:${state.moveCount}`)() * moves.length)];
}

/** Result from seat A's point of view of the finished duel. */
export function pvpWinner(state: BattleState): Seat | 'draw' {
  const o = outcome(state);
  return o === 'win' ? 'a' : o === 'loss' ? 'b' : 'draw';
}

export const pvpScore = (state: BattleState, seat: Seat) => {
  const s = score(state);
  return seat === 'a' ? { me: s.player, opponent: s.cpu } : { me: s.cpu, opponent: s.player };
};

/** Invite codes: 6 characters without easily confused ones (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function inviteCode(random: () => number): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** Shown to a player (written by the server, read live by the game). */
export interface PvpView {
  matchId: string;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  seat: Seat;
  kind: 'invite' | 'random';
  code: string | null;
  opponentName: string | null;
  state: BattleState | null;
  /** Arena name (the cells are in the state). */
  arenaName: string | null;
  /** When the current move must be made (ISO time). */
  turnDeadline: string | null;
  result: null | {
    outcome: 'win' | 'loss' | 'draw';
    reason: 'normal' | 'absent' | 'left';
    score: { me: number; opponent: number };
    coins: number;
  };
  updatedAt: string;
}

/** Text for a card id that may be hidden (the opponent's hand). */
export const isHiddenCard = (id: string) => id === HIDDEN;
export const cardName = (id: string) => (isHiddenCard(id) ? '?' : getCard(id).name);
