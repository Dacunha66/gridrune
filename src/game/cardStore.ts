// Connection to the card database, picture storage and admin check of the claude.ai platform.
// Writes are enforced server-side: the database only accepts them from admins (Owner/Editor),
// and only admins get the picture storage at all. Without the platform (local development)
// every function degrades to "no database" and the game uses its built-in cards.
import { CardRecord, parseCardRecord, recordToDoc } from './catalog';
import { GameSettings, parseSettings } from './settings';
import { ARENAS_COLLECTION, Arena, arenaToDoc, parseArena } from './arenas';
import { DESIGNS_COLLECTION, DESIGN_STATE_DOC, Design, DesignState, designToDoc, displaySize, parseDesign, parseDesignState } from './designs';

export const CARDS_COLLECTION = 'cards';
/** Admin game settings live in one document: `settings/game`. */
export const SETTINGS_COLLECTION = 'settings';
export const SETTINGS_DOC = 'game';

/** The parts of the platform API this game uses (see the platform's db/assets/user contracts). */
export interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface CollectionRef {
  doc(id?: string): DocRef;
  get(): Promise<{ docs: DocSnap[] }>;
  onSnapshot(next: (s: { docs: DocSnap[] }) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
export interface Db { collection(path: string): CollectionRef }
export interface Assets {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}
export interface UserApi { canEdit(): Promise<boolean>; isOwner(): Promise<boolean> }
interface ClaudeRuntime { use(name: string): Promise<unknown> }

function runtime(): ClaudeRuntime | null {
  try {
    const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
    return c && typeof c.use === 'function' ? c : null;
  } catch {
    return null;
  }
}

async function use<T>(name: string): Promise<T | null> {
  const rt = runtime();
  if (!rt) return null;
  try {
    return ((await rt.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

export const getDb = () => use<Db>('db');
export const getAssets = () => use<Assets>('assets');

/** True if this viewer may manage cards (claude.ai Owner or Editor of the game page). */
export async function isAdmin(): Promise<boolean> {
  const user = await use<UserApi>('user');
  if (!user) return false;
  try {
    return (await user.canEdit()) || (await user.isOwner());
  } catch {
    return false;
  }
}

export function parseDocs(docs: DocSnap[]): CardRecord[] {
  const out: CardRecord[] = [];
  for (const d of docs) {
    if (!d.exists) continue;
    const rec = parseCardRecord(d.id, d.data());
    if (rec) out.push(rec);
  }
  return out;
}

/** Reads all card records once. null = no database in this view. */
export async function loadCardRecords(db: Db | null): Promise<CardRecord[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(CARDS_COLLECTION).get();
    return parseDocs(snap.docs);
  } catch {
    return null;
  }
}

export async function saveCardRecord(db: Db, rec: CardRecord): Promise<void> {
  await db.collection(CARDS_COLLECTION).doc(rec.id).set(recordToDoc(rec));
}

/** Reads the admin game settings. null = no database or nothing saved yet (built-in defaults apply). */
export async function loadGameSettings(db: Db | null): Promise<GameSettings | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    return snap.exists ? parseSettings(snap.data()) : null;
  } catch {
    return null;
  }
}

export async function saveGameSettings(db: Db, settings: GameSettings): Promise<void> {
  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({ discoveryShares: { ...settings.discoveryShares }, updatedAt: new Date().toISOString() });
}

/** Arenas saved by the admin. null = no database (the built-in arenas apply). */
export async function loadArenas(db: Db | null): Promise<Arena[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(ARENAS_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const a = d.exists ? parseArena(d.id, d.data()) : null;
      return a ? [a] : [];
    });
  } catch {
    return null;
  }
}

export async function saveArena(db: Db, arena: Arena): Promise<void> {
  await db.collection(ARENAS_COLLECTION).doc(arena.id).set(arenaToDoc(arena));
}

export async function deleteArena(db: Db, id: string): Promise<void> {
  await db.collection(ARENAS_COLLECTION).doc(id).delete();
}

/** Designs (board pictures, page backgrounds). null = no database. */
export async function loadDesigns(db: Db | null): Promise<Design[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(DESIGNS_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const x = d.exists ? parseDesign(d.id, d.data()) : null;
      return x ? [x] : [];
    });
  } catch {
    return null;
  }
}

export async function saveDesign(db: Db, design: Design): Promise<void> {
  await db.collection(DESIGNS_COLLECTION).doc(design.id).set(designToDoc(design));
}

/** Which designs are published (`settings/design`). */
export async function loadDesignState(db: Db | null): Promise<DesignState | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(SETTINGS_COLLECTION).doc(DESIGN_STATE_DOC).get();
    return snap.exists ? parseDesignState(snap.data()) : null;
  } catch {
    return null;
  }
}

export async function saveDesignState(db: Db, state: DesignState): Promise<void> {
  await db.collection(SETTINGS_COLLECTION).doc(DESIGN_STATE_DOC).set({ ...state });
}

/**
 * Smaller copy of an uploaded design picture for the game: the whole picture (no crop), scaled down to max.
 * PNG stays PNG so transparency survives; everything else becomes JPEG. The original upload is not touched.
 */
export async function prepareDisplayImage(file: Blob, max: { w: number; h: number }): Promise<{ blob: Blob; type: string; w: number; h: number; srcW: number; srcH: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_decode'));
      el.src = url;
    });
    const srcW = img.naturalWidth, srcH = img.naturalHeight;
    const { w, h } = displaySize(srcW, srcH, max);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, 0.85));
    return { blob, type, w, h, srcW, srcH };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function deleteCardRecord(db: Db, id: string): Promise<void> {
  await db.collection(CARDS_COLLECTION).doc(id).delete();
}

/** German, beginner-friendly message for a failed database or storage call. */
export function describeError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'invalid_argument':
      return 'Speichern abgelehnt – du hast keine Admin-Rechte für diese Spielseite.';
    case 'quota_exceeded':
    case 'quota_or_state':
      return 'Der Speicher ist voll. Lösche nicht mehr benötigte Karten oder Bilder.';
    case 'too_large':
      return 'Das Bild ist zu groß (maximal 20 MB).';
    case 'unsupported_type':
      return 'Dieses Bildformat wird nicht unterstützt. Bitte JPG oder PNG verwenden.';
    case 'rate_limited':
    case 'resource_exhausted':
      return 'Zu viele Änderungen auf einmal. Bitte kurz warten und erneut versuchen.';
    case 'not_granted':
    case 'revoked':
    case 'capability_disabled':
      return 'Keine Verbindung zur Kartendatenbank. Bitte Seite neu laden.';
    default:
      return 'Das hat nicht geklappt. Bitte erneut versuchen.';
  }
}

/**
 * Scales and crops a photo to a 3:4 portrait JPEG (max. 720×960) before upload,
 * so pictures from the iPhone camera stay small and fit the card frame.
 */
export async function prepareCardImage(file: Blob, width = 720, height = 960): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_decode'));
      el.src = url;
    });
    const { sx, sy, sw, sh, outW, outH } = cropToPortrait(img.naturalWidth, img.naturalHeight, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Centre crop of a w×h picture to the 3:4 card format, scaled down to at most maxW×maxH. */
export function cropToPortrait(w: number, h: number, maxW = 720, maxH = 960) {
  const ratio = 3 / 4;
  const sw = w / h > ratio ? Math.round(h * ratio) : w;
  const sh = w / h > ratio ? h : Math.round(w / ratio);
  const scale = Math.min(1, maxW / sw, maxH / sh);
  return {
    sx: Math.round((w - sw) / 2), sy: Math.round((h - sh) / 2), sw, sh,
    outW: Math.max(1, Math.round(sw * scale)), outH: Math.max(1, Math.round(sh * scale)),
  };
}
