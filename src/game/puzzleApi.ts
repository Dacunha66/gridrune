// The game's side of the Puzzle-Events: calls the server function "events" (it gives earned fragments right away),
// loads and saves editions and events for the admin.
import { Db, webBackend } from './cardStore';
import { CloudSave } from './cloudSave';
import { sanitize } from './storage';
import { CampaignProgress, sanitizeProgress } from './campaignProgress';
import type { ImageRef } from './campaign';
import {
  EDITIONS_COLLECTION, EditionDef, EditionFrame, PUZZLES_COLLECTION, PuzzleDef, PuzzlePeriod, PuzzlePhase, PuzzleRun, editionToDoc, parseEdition, parsePuzzle,
  puzzleToDoc,
} from './puzzles';

/** One event as the server shows it to this player. */
export interface EventView {
  id: string;
  name: string;
  description: string;
  image: ImageRef | null;
  pieces: number;
  cols: number;
  rows: number;
  phase: PuzzlePhase;
  run: PuzzleRun;
  reward: { type: 'edition'; editionId: string; cardId: string; name: string; image: ImageRef | null; frame: EditionFrame } | null;
  have: number[];
  completedAt: string | null;
  tasks: { id: string; title: string; description: string; period: PuzzlePeriod; fragments: number; value: number; target: number; done: boolean; claimed: boolean }[];
  /** Pieces given with this request (for the animation). */
  gained: number[];
}

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null } | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('events', { body });
  if (!error) return { status: 200, data: data as Record<string, unknown> };
  const res = (error as { context?: Response }).context;
  if (!res || typeof res.json !== 'function') return null;
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** The events (earned fragments are given on the way); `cloud` = new save when a puzzle was completed. */
export async function fetchEvents(): Promise<{ events: EventView[]; cloud: CloudSave | null } | 'offline'> {
  const r = await call({ action: 'overview' });
  if (!r || !r.data || r.status >= 500 || !Array.isArray(r.data.events)) return 'offline';
  const d = r.data;
  const cloud = typeof d.version === 'number' && d.save
    ? { version: d.version, save: sanitize(d.save), campaign: sanitizeProgress(d.campaign as CampaignProgress) }
    : null;
  return { events: d.events as EventView[], cloud };
}

export interface EventStats {
  participants: number;
  averagePieces: number;
  completed: number;
  claimsByTask: Record<string, number>;
}

export async function fetchEventStats(puzzleId: string, runId: string): Promise<EventStats | null> {
  const r = await call({ action: 'admin-stats', puzzleId, runId });
  return r?.data && typeof r.data.participants === 'number' ? (r.data as unknown as EventStats) : null;
}

// ---------- Admin documents ----------

export async function loadEditions(db: Db | null): Promise<EditionDef[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(EDITIONS_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const x = d.exists ? parseEdition(d.id, d.data()) : null;
      return x ? [x] : [];
    });
  } catch {
    return null;
  }
}

export async function saveEdition(db: Db, e: EditionDef): Promise<void> {
  await db.collection(EDITIONS_COLLECTION).doc(e.id).set(editionToDoc(e));
}

export async function loadPuzzles(db: Db | null): Promise<PuzzleDef[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(PUZZLES_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const x = d.exists ? parsePuzzle(d.id, d.data()) : null;
      return x ? [x] : [];
    });
  } catch {
    return null;
  }
}

export async function savePuzzle(db: Db, p: PuzzleDef): Promise<void> {
  await db.collection(PUZZLES_COLLECTION).doc(p.id).set(puzzleToDoc(p));
}
