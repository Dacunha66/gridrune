// Tutorial: a fixed first duel on the real board. The first moves are explained step by step (speech bubble, the card
// and field to use light up), then the player finishes the duel alone. Both decks keep their order (no shuffle) and the
// computer's moves follow from a fixed seed, so the server can replay a finished tutorial and pay the reward once
// per account: 7 Abenteurer-Packs and 1 Helden-Pack (into the Postfach). Only cards without effects, normal arena.
import { BattleState, Side, computeFlips, createBattle, isGameOver, legalMoves, toHand } from './battle';
import type { AiOptions } from './ai';
import { getCard, isCardId } from './cards';
import { deriveRng } from './league';
import { DuelLog, replayDuel } from './verify';

export const TUTORIAL_SEED = 'gridrune-tutorial-v1';
/** The player's deck (first 5 = hand, then drawn in this order): sturdy uncommons without effects (also in the admin's catalog). */
export const TUTORIAL_PLAYER = ['u20', 'u05', 'u01', 'u17', 'u03', 'u16', 'c29', 'c25'];
/** The computer: commons without effects in the admin's catalog, playing like "Normal". */
export const TUTORIAL_CPU = ['c08', 'c104', 'c02', 'c16', 'c105', 'c107', 'c108', 'c167'];
/** Without the admin's catalog (offline): built-in commons, none of which has an effect there. */
export const TUTORIAL_CPU_BUILTIN = ['c02', 'c08', 'c16', 'c05', 'c11', 'c03', 'c21', 'c17'];
export const tutorialCpu = (): string[] => (TUTORIAL_CPU.every(isCardId) ? TUTORIAL_CPU : TUTORIAL_CPU_BUILTIN);
export const TUTORIAL_AI: AiOptions = { level: 'medium' };
export const TUTORIAL_REWARD_TEXT = '7 Abenteurer-Packs und 1 Helden-Pack';
/** The computer places the first card, so the player can capture right away. */
export const TUTORIAL_FIRST: Side = 'cpu';

export const tutorialStart = (): BattleState => createBattle(toHand(TUTORIAL_PLAYER), toHand(tutorialCpu()), TUTORIAL_FIRST);
export const tutorialAiRng = () => deriveRng(TUTORIAL_SEED, 'ai');

/** The server's check: the tutorial duel played to the end with legal moves (any result counts). */
export function checkTutorial(log: unknown): { ok: true } | { ok: false; error: string } {
  const l = log as DuelLog | null;
  if (!l || l.first !== TUTORIAL_FIRST) return { ok: false, error: 'Tutorial fehlt' };
  const r = replayDuel(tutorialStart(), l, { toss: deriveRng(TUTORIAL_SEED, 'toss'), ai: tutorialAiRng() }, TUTORIAL_AI, TUTORIAL_FIRST);
  if (!r.ok) return r;
  return isGameOver(r.end) ? { ok: true } : { ok: false, error: 'Tutorial nicht zu Ende gespielt' };
}

// ---------- The speech bubbles ----------

export interface GuideBubble {
  /** Unique per bubble (an info bubble disappears once "Weiter" was tapped). */
  key: string;
  title: string;
  text: string;
  /** Info: the player taps "Weiter" first (nothing else can be done meanwhile). */
  info?: boolean;
  /** A required move: only this hand card and this field can be used. */
  hand?: number;
  cell?: number;
}

const DIR_NAME = ['oben', 'rechts', 'unten', 'links'] as const;
const VALUE_KEYS = ['top', 'right', 'bottom', 'left'] as const;

/** The player's best capture right now (most cards won), with what to say about it. */
function bestCapture(state: BattleState): { hand: number; cell: number; text: string } | null {
  let best: { hand: number; cell: number; flips: number[] } | null = null;
  for (const m of legalMoves(state)) {
    if (m.target !== undefined || m.rot) continue;
    const flips = computeFlips(state.board, m.cell, state.hands.player[m.handIndex], 'player', state.terrain);
    if (flips.length > 0 && (!best || flips.length > best.flips.length)) best = { hand: m.handIndex, cell: m.cell, flips };
  }
  if (!best) return null;
  const mine = getCard(state.hands.player[best.hand].cardId);
  const victim = best.flips[0];
  const theirs = getCard(state.board[victim]!.cardId);
  // Which side of my card touches the captured card, and the opposite side of theirs.
  const size = 4;
  const dr = Math.floor(victim / size) - Math.floor(best.cell / size);
  const dc = (victim % size) - (best.cell % size);
  const dir = dr < 0 ? 0 : dc > 0 ? 1 : dr > 0 ? 2 : 3;
  const opp = (dir + 2) % 4;
  const a = mine[VALUE_KEYS[dir]];
  const b = theirs[VALUE_KEYS[opp]];
  return {
    hand: best.hand,
    cell: best.cell,
    text: `Lege „${mine.name}“ auf das leuchtende Feld. Ihre Zahl ${DIR_NAME[dir]} (${a}) ist höher als die Zahl ${DIR_NAME[opp]} von „${theirs.name}“ (${b}) – damit eroberst du die Karte!`,
  };
}

/**
 * The bubble for the current position. `seen` = info bubbles already closed with "Weiter" (while one is open the
 * computer waits). Player cards placed so far decide the step: 0 = first capture, 1 = protecting the sides,
 * 2 = drawing, then the player goes on alone.
 */
export function tutorialBubble(state: BattleState, seen: ReadonlySet<string>): GuideBubble | null {
  if (isGameOver(state)) return null;
  const mine = state.board.filter((c) => c && c.placedBy === 'player').length;
  const info = (key: string, title: string, text: string): GuideBubble | null => (seen.has(key) ? null : { key, title, text, info: true });
  if (mine === 0) {
    const a = info('goal', 'Willkommen bei GridRune!', 'Ihr legt abwechselnd Karten auf das Feld. Wenn alle Felder voll sind, gewinnt, wem mehr Karten gehören. Deine Karten sind blau, die des Gegners rot.');
    if (a) return a;
    const b = info('values', 'Die vier Zahlen', 'Jede Karte hat vier Zahlen: oben, rechts, unten und links. Je höher die Zahl, desto stärker ist diese Seite. Der Gegner legt jetzt seine erste Karte.');
    if (b) return b;
    if (state.turn !== 'player') return null;
    const c = bestCapture(state);
    if (c) return { key: 'capture', title: 'Erobern', hand: c.hand, cell: c.cell, text: `${c.text} Tippe erst die Karte an, dann das leuchtende Feld.` };
    return info('capture-none', 'Dein Zug', 'Wähle eine Karte und lege sie auf ein freies Feld. Liegt sie neben einer gegnerischen Karte und ist deine Zahl auf dieser Seite höher, eroberst du sie.');
  }
  if (mine === 1) {
    const a = info('captured', 'Erobert!', 'Die eroberte Karte gehört jetzt dir. Der Gegner kann sie zurückholen, wenn er neben ihr eine höhere Zahl anlegt. Achte deshalb auf deine offenen Seiten.');
    if (a) return a;
    if (state.turn !== 'player') return null;
    return info('edges', 'Schwache Seiten an den Rand', 'Am Rand kann niemand angreifen. Lege deine nächste Karte so, dass ihre kleinen Zahlen zum Rand zeigen und die großen zu freien Feldern.');
  }
  if (mine === 2) {
    const a = info('draw', 'Nachziehen', 'Nach jedem Zug ziehst du eine Karte vom Stapel unten links nach. Halte eine Karte lange gedrückt, um sie groß zu sehen.');
    if (a) return a;
    return info('alone', 'Jetzt du!', 'Spiel das Duell selbst zu Ende. Tipp: Starke Seiten neben gegnerische Karten, schwache Seiten an den Rand.');
  }
  return null;
}

/** Local memory on this device: tutorial finished or skipped, and a finished tutorial not yet rewarded (guests). */
const KEY = 'gridrune/tutorial';
const LOG_KEY = 'gridrune/tutorial-log';
export type TutorialState = 'done' | 'skipped' | null;
export function tutorialState(): TutorialState {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}
export function setTutorialState(v: Exclude<TutorialState, null>): void {
  try {
    if (v === 'skipped' && localStorage.getItem(KEY) === 'done') return;
    localStorage.setItem(KEY, v);
  } catch {
    // Without storage the offer simply comes again.
  }
}
export function pendingTutorialLog(): DuelLog | null {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as DuelLog) : null;
  } catch {
    return null;
  }
}
export function setPendingTutorialLog(log: DuelLog | null): void {
  try {
    if (log) localStorage.setItem(LOG_KEY, JSON.stringify(log));
    else localStorage.removeItem(LOG_KEY);
  } catch {
    // Nothing to keep.
  }
}

export type { Side };
