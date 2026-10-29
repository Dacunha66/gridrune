// Runes: one per player and duel, used at most once, in the own turn before placing a card – it does not
// use up the placement. Runes are collection items (never creature cards, never offered in the runner).
// The four effect kinds are rules; name, texts, strength, targets, classes, modes and pictures are data
// the admin can change. Variants (rarity, artwork) always keep the effect of their base rune.
import {
  BattleState, BoardCell, Clash, Move, Side, applyMove, boardValue, cellName, isGameOver, neighbours,
} from './battle';
import { Rarity, RARITIES, getCard } from './cards';
import { CLASS_INFO, CLASSES, CardClass, isCardClass } from './effects';
import { ContentStatus, CONTENT_STATUSES, ImageRef, parseImage } from './campaign';

export type RuneEffect = 'twist' | 'echo' | 'empower' | 'curse';
export const RUNE_EFFECTS: RuneEffect[] = ['twist', 'echo', 'empower', 'curse'];
export const RUNE_EFFECT_LABEL: Record<RuneEffect, string> = {
  twist: 'Drehen (eigene Karte um 90°)',
  echo: 'Erneut angreifen (ohne Kette)',
  empower: 'Stärken (eigene Karten einer Klasse)',
  curse: 'Schwächen (Gegnerkarten einer gewählten Klasse)',
};

export type GameMode = 'adventure' | 'campaign' | 'league';
export const GAME_MODES: GameMode[] = ['adventure', 'campaign', 'league'];
export const MODE_NAME: Record<GameMode, string> = { adventure: 'Abenteuer', campaign: 'Kampagne', league: 'Liga' };

/** How a player gets the rune: from the start, or later in the campaign. */
export type RuneUnlock = { kind: 'start' } | { kind: 'mission'; missionId: string } | { kind: 'stars'; n: number };

export interface RuneDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  effect: RuneEffect;
  /** Value change for empower/curse (1–2). */
  amount: number;
  /** empower/curse: how many cards may be chosen; echo: how many cards may be captured at most (1–3). */
  maxTargets: number;
  /** Usable only once at least this many cards lie on the board (0 = from the start; 8 = from mid-duel). */
  minPlaced: number;
  /** empower: only own cards of this class. */
  cls?: CardClass;
  modes: Record<GameMode, boolean>;
  unlock: RuneUnlock;
  /** Cosmetic variant of another rune: same effect, own name/artwork/rarity. */
  variantOf?: string;
  status: ContentStatus;
  image: ImageRef | null;
  icon: ImageRef | null;
  /** Symbol without an uploaded icon. */
  glyph: string;
  updatedAt: string;
}

export const RUNES_COLLECTION = 'runes';
export const RUNE_ID_RE = /^rn\d{2,4}$/;
const ALL_MODES: Record<GameMode, boolean> = { adventure: true, campaign: true, league: true };

function rune(id: string, name: string, effect: RuneEffect, glyph: string, description: string, extra: Partial<RuneDef> = {}): RuneDef {
  return {
    id, name, description, rarity: 'common', effect, amount: 1, maxTargets: 1, minPlaced: 0, modes: { ...ALL_MODES }, unlock: { kind: 'start' },
    status: 'active', image: null, icon: null, glyph, updatedAt: '', ...extra,
  };
}

/** The four basic runes – every player has them from the start (fair in ranked play). */
export const BUILTIN_RUNES: readonly RuneDef[] = [
  rune('rn01', 'Rune der Verdrehung', 'twist', 'ᛃ', 'Drehe die Werte einer eigenen gelegten Karte einmal um 90° nach links oder rechts. Es wird dabei nicht neu gekämpft.'),
  rune('rn02', 'Rune des Nachhalls', 'echo', 'ᛇ', 'Eine eigene gelegte Karte greift ihre angrenzenden Gegnerkarten erneut an – normale Regeln, höchstens eine Übernahme (bei mehreren wählst du), keine Kettenreaktion. Einsetzbar ab der Spielmitte (8 Karten auf dem Feld).', { minPlaced: 8 }),
  rune('rn03', 'Rune der Glut', 'empower', 'ᚲ', 'Bis zu zwei eigene Feuerkarten auf dem Spielfeld erhalten +1 auf alle vier Werte bis Duellende. Später gelegte Karten nicht.', { cls: 'feuer', maxTargets: 2 }),
  rune('rn04', 'Rune des Fluchs', 'curse', 'ᚦ', 'Wähle eine gegnerische Klasse: Bis zu zwei Gegnerkarten dieser Klasse auf dem Spielfeld erhalten −1 auf alle vier Werte bis Duellende.', { maxTargets: 2 }),
];

export const RUNES: RuneDef[] = [...BUILTIN_RUNES];

/** Runes in use: built-ins replaced or extended by the admin's saved runes (same id = replaced). */
export function setRunes(saved: readonly RuneDef[]): void {
  const byId = new Map<string, RuneDef>(BUILTIN_RUNES.map((r) => [r.id, r]));
  for (const r of saved) byId.set(r.id, r);
  RUNES.splice(0, RUNES.length, ...[...byId.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

export function findRune(id: string | null | undefined): RuneDef | null {
  return (id && RUNES.find((r) => r.id === id)) || null;
}

/** The rules of a rune: a variant always uses its base rune's effect (never stronger). */
export function runeRules(def: RuneDef): RuneDef {
  const base = def.variantOf ? findRune(def.variantOf) : null;
  return base && !base.variantOf ? { ...def, effect: base.effect, amount: base.amount, maxTargets: base.maxTargets, minPlaced: base.minPlaced, cls: base.cls } : def;
}

/** Runes this player may choose in a mode (published, allowed in the mode, owned – ranked: all basic runes). */
export function availableRunes(mode: GameMode, owned: readonly string[]): RuneDef[] {
  return RUNES.filter((r) => r.status === 'active' && r.modes[mode] && (mode === 'league' ? r.unlock.kind === 'start' && !r.variantOf : r.unlock.kind === 'start' || owned.includes(r.id)));
}

// ---------- Using a rune ----------

/** A rune activation as recorded in the duel (replayable like a move). */
export interface RuneUse {
  rune: true;
  /** twist/echo: the own card. */
  cell?: number;
  /** twist: −1 = left, 1 = right. */
  dir?: -1 | 1;
  /** echo: the enemy cards to take when more could be captured than allowed. */
  capture?: number[];
  /** empower/curse: the chosen cards. */
  cells?: number[];
  /** curse: the chosen enemy class. */
  cls?: CardClass;
}

/** Everything a player can do in a duel: place a card, or use the rune (before placing). */
export type Action = Move | RuneUse;

export function isRuneUse(a: Action): a is RuneUse {
  return (a as RuneUse).rune === true;
}

/** What can be chosen right now (for the selection on the board and for the computer). */
export function runeChoices(state: BattleState, side: Side, def: RuneDef): { cells: number[]; classes: CardClass[] } {
  const r = runeRules(def);
  if (!runeOpen(state, r)) return { cells: [], classes: [] };
  const mine = (i: number) => state.board[i]?.owner === side;
  const theirs = (i: number) => state.board[i] && state.board[i]!.owner !== side;
  const all = state.board.map((_, i) => i);
  switch (r.effect) {
    case 'twist':
      return { cells: all.filter(mine), classes: [] };
    case 'echo':
      return { cells: all.filter((i) => mine(i) && neighbours(i).some((n) => theirs(n.cell))), classes: [] };
    case 'empower':
      return { cells: all.filter((i) => mine(i) && (!r.cls || getCard(state.board[i]!.cardId).cls === r.cls)), classes: [] };
    case 'curse': {
      const classes = CLASSES.filter((c) => all.some((i) => theirs(i) && getCard(state.board[i]!.cardId).cls === c));
      return { cells: all.filter((i) => theirs(i) && !!getCard(state.board[i]!.cardId).cls), classes };
    }
  }
}

/** Cards on the board (rocks do not count). */
export function placedCount(state: BattleState): number {
  return state.board.filter(Boolean).length;
}

/** Is the rune's mid-duel threshold reached? */
export function runeOpen(state: BattleState, def: RuneDef): boolean {
  return placedCount(state) >= runeRules(def).minPlaced;
}

/**
 * Rune des Nachhalls: the enemy neighbours the card on `cell` would capture with a new attack (normal comparison,
 * current values). Never a chain – the Kettenübernahme ability of the attacking card plays no part here.
 */
export function echoCapturable(state: BattleState, cell: number, side: Side = state.turn): number[] {
  return neighbours(cell).filter((n) => {
    const o = state.board[n.cell];
    return !!o && o.owner !== side && boardValue(state.board, state.terrain, cell, n.mine) > boardValue(state.board, state.terrain, n.cell, n.theirs);
  }).map((n) => n.cell);
}

/** Why the rune cannot be used like this (German), or null if it can. Prevents double use and invalid targets. */
export function runeProblem(state: BattleState, use: RuneUse): string | null {
  const side = state.turn;
  const slot = state.runes[side];
  if (isGameOver(state)) return 'Das Duell ist vorbei.';
  if (!slot) return 'Keine Rune ausgerüstet.';
  if (slot.used) return 'Die Rune wurde schon eingesetzt.';
  const def = findRune(slot.id);
  if (!def) return 'Diese Rune gibt es nicht.';
  const r = runeRules(def);
  if (!runeOpen(state, def)) return `Einsetzbar ab ${r.minPlaced} Karten auf dem Spielfeld.`;
  const choices = runeChoices(state, side, def);
  const okCell = (c: unknown): c is number => Number.isInteger(c) && choices.cells.includes(c as number);
  switch (r.effect) {
    case 'twist':
      if (!okCell(use.cell)) return 'Wähle eine eigene Karte auf dem Spielfeld.';
      if (use.dir !== 1 && use.dir !== -1) return 'Wähle links oder rechts.';
      return null;
    case 'echo': {
      if (!okCell(use.cell)) return 'Wähle eine eigene Karte mit einer Gegnerkarte daneben.';
      const can = echoCapturable(state, use.cell);
      // More possible captures than allowed: the player picks which one(s).
      if (can.length > r.maxTargets) {
        const pick = use.capture ?? [];
        if (pick.length < 1 || pick.length > r.maxTargets || new Set(pick).size !== pick.length || !pick.every((c) => can.includes(c))) {
          return r.maxTargets === 1 ? 'Wähle, welche Gegnerkarte übernommen wird.' : `Wähle bis zu ${r.maxTargets} Gegnerkarten, die übernommen werden.`;
        }
      } else if (use.capture && use.capture.length > 0) {
        return 'Hier gibt es nichts zu wählen.';
      }
      return null;
    }
    case 'empower':
    case 'curse': {
      const cells = use.cells ?? [];
      if (cells.length < 1 || cells.length > r.maxTargets || new Set(cells).size !== cells.length || !cells.every(okCell)) {
        return `Wähle 1 bis ${r.maxTargets} passende Karten.`;
      }
      if (r.effect === 'curse') {
        if (!isCardClass(use.cls) || !choices.classes.includes(use.cls)) return 'Wähle eine gegnerische Klasse, die auf dem Spielfeld liegt.';
        if (!cells.every((c) => getCard(state.board[c]!.cardId).cls === use.cls)) return 'Alle gewählten Karten müssen zu dieser Klasse gehören.';
      }
      return null;
    }
  }
}

/** Uses the rune: the effect happens, the rune is marked as used, it is still the same player's turn. */
export function applyRune(state: BattleState, use: RuneUse): BattleState {
  const problem = runeProblem(state, use);
  if (problem) throw new Error(problem);
  const side = state.turn;
  const def = findRune(state.runes[side]!.id)!;
  const r = runeRules(def);
  const board = [...state.board];
  const events: BattleState['lastEvents'] = [];
  let clashes: Clash[] = [];
  let text = '';
  switch (r.effect) {
    case 'twist': {
      const c = board[use.cell!]!;
      board[use.cell!] = { ...c, rot: (((c.rot ?? 0) + use.dir!) % 4 + 4) % 4 };
      events.push({ cell: use.cell!, text: use.dir === 1 ? '↻ 90°' : '↺ 90°', kind: 'buff' });
      text = `${getCard(c.cardId).name} auf ${cellName(use.cell!)} um 90° nach ${use.dir === 1 ? 'rechts' : 'links'} gedreht`;
      break;
    }
    case 'echo': {
      for (const n of neighbours(use.cell!)) {
        const o = board[n.cell];
        if (!o || o.owner === side) continue;
        const attack = boardValue(board, state.terrain, use.cell!, n.mine);
        const defense = boardValue(board, state.terrain, n.cell, n.theirs);
        clashes.push({ cell: n.cell, dir: n.mine, attack, defense, captured: attack > defense });
      }
      // At most `maxTargets` captures (chosen by the player if more were possible); nothing else happens – no chain.
      const can = clashes.filter((c) => c.captured).map((c) => c.cell);
      const take = new Set(can.length > r.maxTargets ? use.capture! : can);
      clashes = clashes.map((c) => ({ ...c, captured: take.has(c.cell) }));
      for (const c of clashes) if (c.captured) board[c.cell] = { ...board[c.cell]!, owner: side };
      const n = take.size;
      text = `${getCard(board[use.cell!]!.cardId).name} auf ${cellName(use.cell!)} greift erneut an – erobert ${n}${n ? ` (${[...take].map(cellName).join(', ')})` : ''}`;
      break;
    }
    case 'empower':
    case 'curse': {
      const d = r.effect === 'empower' ? r.amount : -r.amount;
      const names: string[] = [];
      for (const i of use.cells!) {
        const c: BoardCell = { ...board[i]! };
        // The Magische Barriere blocks the next weakening by an enemy effect – runes included.
        if (d < 0 && c.barrier) {
          c.barrier = false;
          events.push({ cell: i, text: '🛡 geblockt', kind: 'shield' });
        } else {
          c.changes = [...(c.changes ?? []), { source: def.name, d: [d, d, d, d] }];
          events.push({ cell: i, text: `ᚱ ${d > 0 ? '+' : '−'}${Math.abs(d)}`, kind: d > 0 ? 'buff' : 'debuff' });
        }
        board[i] = c;
        names.push(`${getCard(c.cardId).name} (${cellName(i)})`);
      }
      text = `${r.effect === 'curse' && use.cls ? `${CLASS_INFO[use.cls].label}: ` : ''}${names.join(', ')} ${d > 0 ? '+' : '−'}${Math.abs(d)} bis Duellende`;
      break;
    }
  }
  return {
    ...state,
    board,
    runes: { ...state.runes, [side]: { ...state.runes[side]!, used: true } },
    lastFlips: clashes.filter((c) => c.captured).map((c) => c.cell),
    lastClashes: clashes,
    lastEvents: events,
    lastChain: [],
    lastOrigin: r.effect === 'echo' ? use.cell! : null,
    lastRune: { side, id: def.id },
    log: [...state.log, { side, kind: 'rune', text: `${def.name}: ${text}` }],
    turn: side,
  };
}

export function applyAction(state: BattleState, action: Action): BattleState {
  return isRuneUse(action) ? applyRune(state, action) : applyMove(state, action);
}


// ---------- Parsing (admin documents) ----------

export function parseRune(id: string, raw: unknown): RuneDef | null {
  if (!RUNE_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
  if (!name || !RUNE_EFFECTS.includes(r.effect as RuneEffect)) return null;
  const int = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
  const m = (r.modes && typeof r.modes === 'object' ? r.modes : {}) as Record<string, unknown>;
  const u = (r.unlock && typeof r.unlock === 'object' ? r.unlock : {}) as Record<string, unknown>;
  const unlock: RuneUnlock = u.kind === 'mission' && typeof u.missionId === 'string' ? { kind: 'mission', missionId: u.missionId }
    : u.kind === 'stars' ? { kind: 'stars', n: int(u.n, 1, 999, 10) } : { kind: 'start' };
  const out: RuneDef = {
    id, name,
    description: typeof r.description === 'string' ? r.description.trim().slice(0, 300) : '',
    rarity: RARITIES.includes(r.rarity as Rarity) ? (r.rarity as Rarity) : 'common',
    effect: r.effect as RuneEffect,
    amount: int(r.amount, 1, 2, 1),
    maxTargets: int(r.maxTargets, 1, 3, 1),
    // Older saved runes have no threshold yet: they keep the built-in value of the same id.
    minPlaced: int(r.minPlaced, 0, 15, BUILTIN_RUNES.find((b) => b.id === id)?.minPlaced ?? 0),
    modes: { adventure: m.adventure !== false, campaign: m.campaign !== false, league: m.league !== false },
    unlock,
    status: CONTENT_STATUSES.includes(r.status as ContentStatus) ? (r.status as ContentStatus) : 'draft',
    image: parseImage(r.image),
    icon: parseImage(r.icon),
    glyph: typeof r.glyph === 'string' && r.glyph.trim() ? r.glyph.trim().slice(0, 4) : 'ᚱ',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  };
  if (isCardClass(r.cls)) out.cls = r.cls;
  if (typeof r.variantOf === 'string' && RUNE_ID_RE.test(r.variantOf) && r.variantOf !== id) out.variantOf = r.variantOf;
  return out;
}

export function runeToDoc(r: RuneDef): Record<string, unknown> {
  const { id: _id, ...rest } = r;
  void _id;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

export function nextRuneId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = /^rn(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `rn${String(max + 1).padStart(2, '0')}`;
}
