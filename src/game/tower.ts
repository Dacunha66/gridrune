// Turm der Prüfungen: a permanent single-player mode. Floors are climbed one after the other; each floor is a duel
// against a computer opponent with the game's own rules (the same duel as a campaign mission – one goal: win).
// Floors are content (content_docs "tower_floors", admin-editable, any number); the progress of a player lives in the
// database (tower_progress: highest cleared floor) and only the server function "game" changes it, after replaying
// the duel. A floor's reward is paid once per account (tower_rewards). No stars, no energy, no seasons.
import { ARENA_ID_RE } from './arenas';
import { CONTENT_STATUSES, ContentStatus, Mission, Opponent, Reward, parseOpponent, parseReward } from './campaign';

export const TOWER_COLLECTION = 'tower_floors';
export const TOWER_FLOOR_ID_RE = /^t\d{3,5}$/;
/** Floors per section ("Etage 6 von 10"); section names come from the floors themselves. */
export const TOWER_SECTION_SIZE = 10;

/** Difficulty shown to players (the computer's real strength is its level, deck and rune). */
export type TowerDifficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'boss';
export const TOWER_DIFFICULTIES: TowerDifficulty[] = ['very_easy', 'easy', 'medium', 'hard', 'boss'];
export const DIFFICULTY_LABEL: Record<TowerDifficulty, string> = { very_easy: 'Sehr leicht', easy: 'Leicht', medium: 'Mittel', hard: 'Schwer', boss: 'Boss' };

export interface TowerFloor {
  id: string;
  /** 1, 2, 3 … – floors are climbed in this order. */
  number: number;
  /** Name of the tower section, e.g. "Die Erwachenden Hallen". */
  section: string;
  name: string;
  description: string;
  difficulty: TowerDifficulty;
  arenaId: string;
  /** The computer opponent (same data as a campaign opponent: 8 cards, level, favourite classes, rune). */
  opponent: Opponent;
  /** Paid once, at the first win of this floor. */
  reward: Reward | null;
  status: ContentStatus;
  updatedAt: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Turns an untrusted database document into a floor, or null. */
export function parseFloor(id: string, raw: unknown): TowerFloor | null {
  if (!TOWER_FLOOR_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const number = typeof r.number === 'number' && Number.isInteger(r.number) && r.number >= 1 && r.number <= 9999 ? r.number : 0;
  const name = str(r.name, 40);
  // The opponent gets its own id from the floor (t001 → o9001), apart from the campaign opponents.
  const opponent = parseOpponent(`o9${id.slice(1)}`, r.opponent);
  if (!number || !name || !opponent || opponent.deck.length === 0) return null;
  return {
    id, number, name,
    section: str(r.section, 60) || 'Turm der Prüfungen',
    description: str(r.description, 300),
    difficulty: TOWER_DIFFICULTIES.includes(r.difficulty as TowerDifficulty) ? (r.difficulty as TowerDifficulty) : 'medium',
    arenaId: typeof r.arenaId === 'string' && ARENA_ID_RE.test(r.arenaId) ? r.arenaId : 'a01',
    opponent,
    reward: parseReward(r.reward),
    status: CONTENT_STATUSES.includes(r.status as ContentStatus) ? (r.status as ContentStatus) : 'draft',
    updatedAt: str(r.updatedAt, 40),
  };
}

/** The floors in play (published; the admin preview also sees drafts), by number; one floor per number. */
export function visibleFloors(all: readonly TowerFloor[], preview = false): TowerFloor[] {
  const shown = all.filter((f) => f.status === 'active' || (preview && f.status === 'draft')).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  return shown.filter((f, i) => i === 0 || shown[i - 1].number !== f.number);
}

export type FloorState = 'done' | 'current' | 'locked';

/** `cleared` = highest floor number the player has won (0 = none yet). */
export function floorState(floor: TowerFloor, cleared: number): FloorState {
  return floor.number <= cleared ? 'done' : floor.number === cleared + 1 ? 'current' : 'locked';
}

/** A floor can be played when it is cleared already or the next one (floors are never skipped). */
export const canPlayFloor = (floor: TowerFloor, cleared: number) => floor.number <= cleared + 1;

/** What the tower page shows on top: the current floor and the progress in its section. */
export function towerProgress(floors: readonly TowerFloor[], cleared: number) {
  const current = floors.find((f) => f.number === cleared + 1) ?? null;
  const focus = current ?? floors[floors.length - 1] ?? null;
  const section = focus ? floors.filter((f) => f.section === focus.section) : [];
  return {
    current,
    /** Every published floor is won (more floors come later). */
    top: floors.length > 0 && !current && cleared >= floors[floors.length - 1].number,
    done: floors.filter((f) => f.number <= cleared).length,
    section: focus?.section ?? '',
    sectionDone: section.filter((f) => f.number <= cleared).length,
    sectionSize: section.length,
    /** Position inside the section, 1-based ("Etage 6 von 10"). */
    sectionPos: focus ? section.indexOf(focus) + 1 : 0,
  };
}

/**
 * A floor as a campaign mission with a single goal ("win"): the duel, its checking on the server and the battle screen
 * are exactly the campaign's.
 */
export function floorMission(floor: TowerFloor): Mission {
  return {
    id: floor.id, worldId: 'tower', order: floor.number, name: floor.name, description: floor.description,
    kind: floor.difficulty === 'boss' ? 'boss' : 'normal', mode: 'duel', arenaId: floor.arenaId, opponentId: floor.opponent.id,
    goals: [{ id: `${floor.id}-g1`, type: 'win', n: 0 }], goalRewards: [null], firstReward: floor.reward, tips: [],
    pos: { x: 0.5, y: 0.5 }, icon: null, status: 'active', updatedAt: floor.updatedAt,
  };
}

export function floorToDoc(f: TowerFloor): Record<string, unknown> {
  const { id: _id, opponent, ...rest } = f;
  void _id;
  const { id: _oid, ...opp } = opponent;
  void _oid;
  return JSON.parse(JSON.stringify({ ...rest, opponent: opp })) as Record<string, unknown>;
}

// ---------- Floors loaded with the game content (the server function reads them from the database) ----------

let FLOORS: TowerFloor[] = [];
export const towerFloors = () => FLOORS;
export function setTowerFloors(list: readonly TowerFloor[]): void {
  FLOORS = [...list];
}
