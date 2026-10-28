// Arenas: templates of 16 cells with terrain. In the league both players duel in the same arena,
// picked from the match seed, so the choice is recomputable and cannot be manipulated.
import { CELL_COUNT } from './battle';
import { TERRAINS, TERRAIN_INFO, Terrain, isTerrain } from './effects';
import { Rng } from './rng';
import { deriveRng } from './league';

export type ArenaStatus = 'draft' | 'active' | 'disabled';
export const ARENA_STATUSES: ArenaStatus[] = ['draft', 'active', 'disabled'];

export interface Arena {
  id: string;
  name: string;
  /** Terrain of the 16 cells, row by row from the top left. */
  cells: Terrain[];
  status: ArenaStatus;
  /** May be used in ranked league matches (must pass `rankedProblems`). */
  ranked: boolean;
  updatedAt: string;
}

export const ARENAS_COLLECTION = 'arenas';
export const ARENA_ID_RE = /^a\d{2,4}$/;
export const ARENA_NAME_MAX = 30;
/** At most half of the board may have terrain in ranked arenas. */
export const RANKED_MAX_TERRAIN = 8;

function layout(spec: Partial<Record<Terrain, number[]>>): Terrain[] {
  const cells = Array<Terrain>(CELL_COUNT).fill('normal');
  for (const [t, list] of Object.entries(spec)) for (const i of list!) cells[i] = t as Terrain;
  return cells;
}

// Every built-in arena is point-symmetric (cell i mirrors cell 15 − i), so no corner or side is better for anyone.
export const BUILTIN_ARENAS: readonly Arena[] = [
  { id: 'a01', name: 'Klassische Arena', cells: layout({}), status: 'active', ranked: true, updatedAt: '' },
  { id: 'a02', name: 'Waldlichtung', cells: layout({ wald: [0, 3, 12, 15] }), status: 'active', ranked: true, updatedAt: '' },
  { id: 'a03', name: 'Vulkankrater', cells: layout({ lava: [1, 5, 10, 14] }), status: 'active', ranked: true, updatedAt: '' },
  { id: 'a04', name: 'Frostsee', cells: layout({ eis: [4, 6, 9, 11] }), status: 'active', ranked: true, updatedAt: '' },
  { id: 'a05', name: 'Schattenhain', cells: layout({ schatten: [2, 7, 8, 13] }), status: 'active', ranked: true, updatedAt: '' },
  { id: 'a06', name: 'Grenzland', cells: layout({ wald: [0, 15], lava: [5, 10], eis: [3, 12], schatten: [6, 9] }), status: 'active', ranked: true, updatedAt: '' },
];

export const CLASSIC_ARENA = BUILTIN_ARENAS[0];

/** Turns an untrusted database document into a valid arena, or null. */
export function parseArena(id: string, raw: unknown): Arena | null {
  if (!ARENA_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, ARENA_NAME_MAX) : '';
  if (!name || !Array.isArray(r.cells) || r.cells.length !== CELL_COUNT || !r.cells.every(isTerrain)) return null;
  const cells = [...r.cells] as Terrain[];
  if (!cells.includes('normal')) return null;
  const status = ARENA_STATUSES.includes(r.status as ArenaStatus) ? (r.status as ArenaStatus) : 'draft';
  return { id, name, cells, status, ranked: r.ranked === true && rankedProblems(cells).length === 0, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '' };
}

export function arenaToDoc(a: Arena): Record<string, unknown> {
  return { name: a.name, cells: [...a.cells], status: a.status, ranked: a.ranked, updatedAt: a.updatedAt };
}

/** Why an arena may not be used in ranked matches (empty = allowed). German, for the admin editor. */
export function rankedProblems(cells: readonly Terrain[]): string[] {
  const problems: string[] = [];
  const terrainCells = cells.filter((t) => t !== 'normal').length;
  if (terrainCells > RANKED_MAX_TERRAIN) problems.push(`Höchstens ${RANKED_MAX_TERRAIN} Geländefelder (jetzt ${terrainCells}).`);
  for (const t of TERRAINS) {
    const n = cells.filter((c) => c === t).length;
    if (t !== 'normal' && n === 1) problems.push(`${TERRAIN_INFO[t].label} kommt nur einmal vor – jedes Gelände 0-mal oder mindestens 2-mal.`);
  }
  if (cells.some((t, i) => t !== cells[CELL_COUNT - 1 - i])) {
    problems.push('Nicht spiegelgleich: Jedes Feld braucht dasselbe Gelände wie das gegenüberliegende Feld (um die Mitte gedreht).');
  }
  return problems;
}

/** Arenas in play: built-ins, replaced or extended by the admin's saved arenas (same id = replaced). */
export const ARENAS: Arena[] = [...BUILTIN_ARENAS];

export function setArenas(saved: readonly Arena[]): void {
  const byId = new Map<string, Arena>(BUILTIN_ARENAS.map((a) => [a.id, a]));
  for (const a of saved) byId.set(a.id, a);
  ARENAS.splice(0, ARENAS.length, ...[...byId.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

/** Random active arena for an adventure duel. */
export function pickArena(rng: Rng, list: readonly Arena[] = ARENAS): Arena {
  const active = list.filter((a) => a.status === 'active');
  return active.length > 0 ? active[Math.floor(rng() * active.length)] : CLASSIC_ARENA;
}

/** Arena of a league round: the same for both players and recomputable from the match seed. */
export function leagueArena(seed: string, round: number, list: readonly Arena[] = ARENAS): Arena {
  const ranked = list.filter((a) => a.status === 'active' && a.ranked && rankedProblems(a.cells).length === 0).sort((a, b) => a.id.localeCompare(b.id));
  if (ranked.length === 0) return CLASSIC_ARENA;
  return ranked[Math.floor(deriveRng(seed, `arena:${round}`)() * ranked.length)];
}

/** Next free arena id: a07, a08, … */
export function nextArenaId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = /^a(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `a${String(max + 1).padStart(2, '0')}`;
}
