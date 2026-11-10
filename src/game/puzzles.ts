// Puzzle-Events: players earn fragments of a card picture by doing event tasks; a complete puzzle unlocks the reward
// for good (version 1: a card edition – the same card with its own picture, never other values).
// Admin documents: `editions/<id>` (edition of an existing card) and `puzzles/<id>` (the event: reward, pieces, tasks,
// the current run with start and end). Each puzzle keeps its id for ever: a repeated event is a new run of the same
// puzzle, so the pieces a player has stay. Counters and claims are kept by the server (tables puzzle_*), raised only
// after results the server checked itself. Pure rules – the same code runs in the game and on the server.
import { CARDS, Rarity, getCard, isCardId } from './cards';
import { ImageRef, parseImage } from './campaign';
import { COUNTED_METRICS, METRIC_TEXT, QuestMetric, questDay, questWeek } from './quests';
import { deriveRng } from './league';
import { SaveData } from './storage';

export const PUZZLES_COLLECTION = 'puzzles';
export const EDITIONS_COLLECTION = 'editions';
export const PUZZLE_ID_RE = /^pz\d{2,4}$/;
export const EDITION_ID_RE = /^ed\d{2,4}$/;
export const RUN_ID_RE = /^r\d{1,4}$/;
export const TASK_ID_RE = /^t[a-z0-9_-]{1,20}$/;

// ---------- Editions ----------

export type EditionFrame = 'none' | 'moon' | 'gold' | 'ember' | 'frost';
export const EDITION_FRAMES: EditionFrame[] = ['none', 'moon', 'gold', 'ember', 'frost'];
export const FRAME_LABEL: Record<EditionFrame, string> = { none: 'Kein Rahmen', moon: 'Mondsilber', gold: 'Runengold', ember: 'Glut', frost: 'Frost' };

/** A special look of an existing card: own picture, frame and name – values, class and ability stay the card's. */
export interface EditionDef {
  id: string;
  cardId: string;
  /** Edition name, e.g. "Mondfinsternis" (shown as "Runenwolf – Mondfinsternis"). */
  name: string;
  /** Uploaded picture (admin); null = the built-in picture of this edition (if any). */
  image: ImageRef | null;
  frame: EditionFrame;
}

export const BUILTIN_EDITIONS: EditionDef[] = [
  { id: 'ed01', cardId: 'r02', name: 'Mondfinsternis', image: null, frame: 'moon' },
];

export function parseEdition(id: string, raw: unknown): EditionDef | null {
  if (!EDITION_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.cardId !== 'string' || !/^[a-z]\d{2,4}$/.test(r.cardId)) return null;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
  return { id, cardId: r.cardId, name: name || 'Edition', image: parseImage(r.image), frame: EDITION_FRAMES.includes(r.frame as EditionFrame) ? r.frame as EditionFrame : 'none' };
}

export function editionToDoc(e: EditionDef): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ cardId: e.cardId, name: e.name, image: e.image, frame: e.frame, updatedAt: new Date().toISOString() }));
}

let EDITIONS: EditionDef[] = [...BUILTIN_EDITIONS];
export function setEditions(saved: readonly EditionDef[]): void {
  const byId = new Map(BUILTIN_EDITIONS.map((e) => [e.id, e]));
  for (const e of saved) byId.set(e.id, e);
  EDITIONS = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function allEditions(): EditionDef[] {
  return EDITIONS;
}
export function findEdition(id: string | null | undefined): EditionDef | null {
  return (id && EDITIONS.find((e) => e.id === id)) || null;
}
export function editionsOf(cardId: string): EditionDef[] {
  return EDITIONS.filter((e) => e.cardId === cardId);
}
export function editionTitle(e: EditionDef): string {
  return `${isCardId(e.cardId) ? getCard(e.cardId).name : e.cardId} – ${e.name}`;
}
export function nextEditionId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) if (EDITION_ID_RE.test(id)) max = Math.max(max, Number(id.slice(2)));
  return `ed${String(max + 1).padStart(2, '0')}`;
}

/** Picks an edition for a card (or back to the original). Only editions the player owns. */
export function equipEdition(save: SaveData, cardId: string, editionId: string | null): SaveData {
  const equipped = { ...save.editions.equipped };
  if (editionId === null) delete equipped[cardId];
  else {
    const e = findEdition(editionId);
    if (!e || e.cardId !== cardId || !save.editions.owned.includes(editionId)) return save;
    equipped[cardId] = editionId;
  }
  return { ...save, editions: { ...save.editions, equipped } };
}

// ---------- Puzzle events ----------

export type PuzzlePeriod = 'daily' | 'weekly' | 'once';
export const PERIOD_LABEL: Record<PuzzlePeriod, string> = { daily: 'Täglich', weekly: 'Wöchentlich', once: 'Einmalig' };
/** Results the server counts reliably (the same counters as the Erfolge). */
export const PUZZLE_METRICS: QuestMetric[] = COUNTED_METRICS;

export interface PuzzleTask {
  id: string;
  /** Own title; empty = generated from metric and target ("Gewinne 2 Spiele"). */
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  /** Fragments for completing it (once per day / week / run). */
  fragments: number;
  period: PuzzlePeriod;
}

export type PuzzleReward = { type: 'edition'; editionId: string };
export type PuzzleStatus = 'draft' | 'published' | 'archived';
/** What players see: planned (published, not started), active, ended, archived. Drafts are never shown. */
export type PuzzlePhase = 'draft' | 'planned' | 'active' | 'ended' | 'archived';
export const PHASE_LABEL: Record<PuzzlePhase, string> = { draft: 'Entwurf', planned: 'Geplant', active: 'Aktiv', ended: 'Beendet', archived: 'Archiviert' };

export interface PuzzleRun {
  /** New id for every repetition of the event ("r1", "r2", …); the pieces of the puzzle stay. */
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface PuzzleDef {
  id: string;
  name: string;
  description: string;
  /** Picture of the event tile; null = the reward's picture. */
  image: ImageRef | null;
  reward: PuzzleReward;
  pieces: number;
  cols: number;
  rows: number;
  status: PuzzleStatus;
  run: PuzzleRun;
  tasks: PuzzleTask[];
}

/** Suggested number of fragments per rarity of the card. */
export const PIECES_BY_RARITY: Record<Rarity, number> = { common: 4, uncommon: 4, rare: 6, epic: 9, legendary: 12, mythic: 16 };
/** A grid for a number of pieces (cols × rows, as square as the card allows). */
export function gridFor(pieces: number): { cols: number; rows: number } {
  const options: Record<number, [number, number]> = { 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4], 16: [4, 4], 20: [4, 5] };
  const o = options[pieces] ?? [Math.ceil(Math.sqrt(pieces)), Math.ceil(pieces / Math.ceil(Math.sqrt(pieces)))];
  return { cols: o[0], rows: o[1] };
}

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const time = (v: unknown, fallback: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback);

export function parsePuzzle(id: string, raw: unknown): PuzzleDef | null {
  if (!PUZZLE_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rw = (r.reward && typeof r.reward === 'object' ? r.reward : {}) as Record<string, unknown>;
  if (rw.type !== 'edition' || typeof rw.editionId !== 'string' || !EDITION_ID_RE.test(rw.editionId)) return null;
  const pieces = int(r.pieces, 2, 30, 9);
  const g = gridFor(pieces);
  let cols = int(r.cols, 1, 6, g.cols);
  let rows = int(r.rows, 1, 6, g.rows);
  if (cols * rows < pieces) ({ cols, rows } = g);
  const run = (r.run && typeof r.run === 'object' ? r.run : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const tasks = (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 12).flatMap((t): PuzzleTask[] => {
    if (!t || typeof t !== 'object') return [];
    const x = t as Record<string, unknown>;
    if (typeof x.id !== 'string' || !TASK_ID_RE.test(x.id) || !PUZZLE_METRICS.includes(x.metric as QuestMetric)) return [];
    const period: PuzzlePeriod = x.period === 'daily' || x.period === 'weekly' ? x.period : 'once';
    return [{ id: x.id, title: str(x.title, 60), description: str(x.description, 140), metric: x.metric as QuestMetric, target: int(x.target, 1, 100000, 1), fragments: int(x.fragments, 1, 10, 1), period }];
  });
  return {
    id,
    name: str(r.name, 40) || 'Puzzle-Event',
    description: str(r.description, 300),
    image: parseImage(r.image),
    reward: { type: 'edition', editionId: rw.editionId },
    pieces, cols, rows,
    status: r.status === 'published' || r.status === 'archived' ? r.status : 'draft',
    run: { id: typeof run.id === 'string' && RUN_ID_RE.test(run.id) ? run.id : 'r1', startsAt: time(run.startsAt, now), endsAt: time(run.endsAt, now) },
    tasks: [...new Map(tasks.map((t) => [t.id, t])).values()],
  };
}

export function puzzleToDoc(p: PuzzleDef): Record<string, unknown> {
  const { id: _id, ...rest } = p;
  return JSON.parse(JSON.stringify({ ...rest, updatedAt: new Date().toISOString() }));
}

let PUZZLES: PuzzleDef[] = [];
export function setPuzzles(list: readonly PuzzleDef[]): void {
  PUZZLES = [...list].sort((a, b) => a.id.localeCompare(b.id));
}
export function allPuzzles(): PuzzleDef[] {
  return PUZZLES;
}
export function nextPuzzleId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) if (PUZZLE_ID_RE.test(id)) max = Math.max(max, Number(id.slice(2)));
  return `pz${String(max + 1).padStart(2, '0')}`;
}

export function puzzlePhase(p: PuzzleDef, now: Date = new Date()): PuzzlePhase {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'archived') return 'archived';
  const t = now.getTime();
  if (t < Date.parse(p.run.startsAt)) return 'planned';
  if (t >= Date.parse(p.run.endsAt)) return 'ended';
  return 'active';
}

/** Problems that keep the admin from publishing (German). */
export function puzzleProblems(p: PuzzleDef): string[] {
  const out: string[] = [];
  const e = findEdition(p.reward.editionId);
  if (!e) out.push('Die Belohnungs-Edition gibt es nicht.');
  else if (!isCardId(e.cardId)) out.push('Die Karte der Edition gibt es nicht.');
  if (p.tasks.length === 0) out.push('Mindestens eine Aufgabe fehlt.');
  if (p.cols * p.rows < p.pieces) out.push('Das Raster hat zu wenige Felder für die Fragmente.');
  if (Date.parse(p.run.endsAt) <= Date.parse(p.run.startsAt)) out.push('Das Ende liegt vor dem Start.');
  return out;
}

export function taskTitle(t: PuzzleTask): string {
  return t.title || METRIC_TEXT[t.metric](t.target);
}

// ---------- Progress and fragments ----------

/** The server's counters of one player for one run: per Berlin day, per ISO week and in total (since the run started). */
export interface PuzzleCounters {
  day: string;
  week: string;
  daily: Record<string, number>;
  weekly: Record<string, number>;
  total: Record<string, number>;
}

/** Claim key of a task in the current period (unique per player and puzzle in the database – never paid twice). */
export function taskKey(p: PuzzleDef, t: PuzzleTask, now: Date = new Date()): string {
  const period = t.period === 'daily' ? `d:${questDay(now)}` : t.period === 'weekly' ? `w:${questWeek(now)}` : 'o';
  return `${p.run.id}:${period}:${t.id}`;
}

export interface TaskView {
  task: PuzzleTask;
  title: string;
  value: number;
  target: number;
  done: boolean;
  /** Already rewarded in this period. */
  claimed: boolean;
  key: string;
}

export function taskViews(p: PuzzleDef, counters: PuzzleCounters | null, claimed: readonly string[], now: Date = new Date()): TaskView[] {
  const day = questDay(now);
  const week = questWeek(now);
  return p.tasks.map((t) => {
    const src = !counters ? {} : t.period === 'daily' ? (counters.day === day ? counters.daily : {}) : t.period === 'weekly' ? (counters.week === week ? counters.weekly : {}) : counters.total;
    const value = Math.max(0, Math.floor(Number(src[t.metric]) || 0));
    const key = taskKey(p, t, now);
    return { task: t, title: taskTitle(t), value: Math.min(value, t.target), target: t.target, done: value >= t.target, claimed: claimed.includes(key), key };
  });
}

/** Missing pieces (0-based) of a puzzle, in order. */
export function missingPieces(p: PuzzleDef, have: readonly number[]): number[] {
  const own = new Set(have);
  return Array.from({ length: p.pieces }, (_, i) => i).filter((i) => !own.has(i));
}

export interface PuzzleClaim {
  keys: string[];
  /** New pieces (never one the player already has). */
  pieces: number[];
  /** All pieces collected with this claim. */
  complete: boolean;
}

/**
 * Fragments the player has earned and not received yet. Only while the run is active and the puzzle is not complete.
 * Each finished task of the current period gives its fragments once; pieces are picked among the missing ones
 * (random order from `seed`, never twice). Tasks finished when everything is collected are not claimed.
 */
export function earnedClaim(p: PuzzleDef, have: readonly number[], counters: PuzzleCounters | null, claimed: readonly string[], seed: string, now: Date = new Date()): PuzzleClaim | null {
  if (puzzlePhase(p, now) !== 'active') return null;
  let missing = missingPieces(p, have);
  if (missing.length === 0) return null;
  const rng = deriveRng(seed, `puzzle:${p.id}`);
  const keys: string[] = [];
  const pieces: number[] = [];
  for (const v of taskViews(p, counters, claimed, now)) {
    if (!v.done || v.claimed || missing.length === 0) continue;
    keys.push(v.key);
    for (let i = 0; i < v.task.fragments && missing.length > 0; i++) {
      const k = Math.floor(rng() * missing.length);
      pieces.push(missing[k]);
      missing = missing.filter((_, j) => j !== k);
    }
  }
  return keys.length ? { keys, pieces, complete: missing.length === 0 } : null;
}

/** Adds the reward of a complete puzzle to the save (once – an edition already owned stays as it is). */
export function grantPuzzleReward(save: SaveData, p: PuzzleDef): SaveData {
  const id = p.reward.editionId;
  if (save.editions.owned.includes(id)) return save;
  return { ...save, editions: { ...save.editions, owned: [...save.editions.owned, id] } };
}

/** The card of a puzzle's reward. */
export function rewardCard(p: PuzzleDef): string | null {
  const e = findEdition(p.reward.editionId);
  return e && CARDS.some((c) => c.id === e.cardId) ? e.cardId : null;
}

/** Time left as "3 T. 4 Std." / "5 Std. 12 Min.". */
export function timeLeftText(until: string, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((Date.parse(until) - now) / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return d > 0 ? `${d} T. ${h} Std.` : `${h} Std. ${min % 60} Min.`;
}
