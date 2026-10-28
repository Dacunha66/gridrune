// Visual designs an admin can upload: a picture under the 4×4 board and a page background.
// Designs only change how things look – the board is always the same 16 cells for the game logic.

export type DesignKind = 'board' | 'page';

/**
 * Picture position, stored separately from the untouched original.
 * zoom 1 = the picture just covers the area (no empty edges); px/py 0…1 = which part is visible
 * (0 = left/top edge, 0.5 = centre, 1 = right/bottom edge). Relative values look the same on every screen.
 */
export interface ImageFit {
  zoom: number;
  px: number;
  py: number;
}

/** How the 4×4 grid is drawn (never where the cells are in the game logic). */
export interface BoardLayout {
  /** Share of the available space used by the board, 0.7–1. */
  size: number;
  /** Vertical position inside the free space: 0 = top, 1 = as low as possible without hiding the hand. */
  offsetY: number;
  /** Gap between the cells in px. */
  gap: number;
  /** Width of the outer frame in px. */
  frame: number;
  /** Opacity of the empty cells (0 = picture fully visible, 1 = solid like the standard board). */
  cellAlpha: number;
  /** Thin outline around every cell. */
  cellBorders: boolean;
}

export interface PageLook {
  /** Darkening over the background picture so texts stay readable, 0–0.8. */
  dim: number;
}

export interface Design {
  id: string;
  kind: DesignKind;
  name: string;
  /** Original upload (never changed). */
  imageId: string | null;
  /** Smaller copy shown in the game (fast on phones). */
  displayId: string | null;
  imageW: number;
  imageH: number;
  fit: ImageFit;
  layout: BoardLayout;
  page: PageLook;
  createdAt: string;
  updatedAt: string;
}

/** Which designs are published (null = standard design) and the previous ones (for "back"). */
export interface DesignState {
  board: string | null;
  boardPrev: string | null;
  page: string | null;
  pagePrev: string | null;
  updatedAt: string;
}

export const DESIGNS_COLLECTION = 'designs';
export const DESIGN_STATE_DOC = 'design';
export const DESIGN_ID_RE = /^d\d{3,5}$/;
export const DESIGN_NAME_MAX = 30;

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/** Allowed range of every layout setting – keeps the board on screen and every cell easy to tap. */
export const LAYOUT_LIMITS = {
  size: [0.7, 1],
  offsetY: [0, 1],
  gap: [0, 12],
  frame: [0, 24],
  cellAlpha: [0, 1],
} as const;

/** The board as it looked before the designer existed. */
export const DEFAULT_LAYOUT: BoardLayout = { size: 1, offsetY: 0, gap: 3, frame: 3, cellAlpha: 1, cellBorders: false };
export const DEFAULT_FIT: ImageFit = { zoom: 1, px: 0.5, py: 0.5 };
export const DEFAULT_PAGE: PageLook = { dim: 0.35 };
export const EMPTY_STATE: DesignState = { board: null, boardPrev: null, page: null, pagePrev: null, updatedAt: '' };

/**
 * Recommended picture sizes (shown at the upload).
 * Board: 4×4 cells in card format 3:4 → the board is 3:4. The largest board (iPad) is about 540–700 points wide,
 * at 2× sharpness 1100–1400 pixels; iPhones show ~370 points at 3× (≈1100 px). 1536 × 2048 covers both with room to zoom.
 * Page: the whole screen; tall iPhones are about 9:19.5 (1290 × 2796 px), iPads 3:4 – the editor picks the visible part.
 */
export const RECOMMENDED: Record<DesignKind, { w: number; h: number; ratio: string; maxMb: number }> = {
  board: { w: 1536, h: 2048, ratio: '3:4 (Hochformat)', maxMb: 2 },
  page: { w: 1290, h: 2796, ratio: 'ca. 9:19,5 (Hochformat, wie ein iPhone-Bildschirm)', maxMb: 2 },
};
/** The copy used in the game is scaled down to at most this size. */
export const DISPLAY_MAX: Record<DesignKind, { w: number; h: number }> = { board: { w: 1536, h: 2048 }, page: { w: 1290, h: 2796 } };
/** Uploads above this size are refused (the original is kept unchanged, so it must not be huge). */
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

function num(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function clampFit(raw: unknown): ImageFit {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    zoom: num(r.zoom, [ZOOM_MIN, ZOOM_MAX], DEFAULT_FIT.zoom),
    px: num(r.px, [0, 1], DEFAULT_FIT.px),
    py: num(r.py, [0, 1], DEFAULT_FIT.py),
  };
}

export function clampLayout(raw: unknown): BoardLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const L = LAYOUT_LIMITS;
  return {
    size: num(r.size, L.size, DEFAULT_LAYOUT.size),
    offsetY: num(r.offsetY, L.offsetY, DEFAULT_LAYOUT.offsetY),
    gap: Math.round(num(r.gap, L.gap, DEFAULT_LAYOUT.gap)),
    frame: Math.round(num(r.frame, L.frame, DEFAULT_LAYOUT.frame)),
    cellAlpha: num(r.cellAlpha, L.cellAlpha, DEFAULT_LAYOUT.cellAlpha),
    cellBorders: typeof r.cellBorders === 'boolean' ? r.cellBorders : DEFAULT_LAYOUT.cellBorders,
  };
}

export function clampPage(raw: unknown): PageLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { dim: num(r.dim, [0, 0.8], DEFAULT_PAGE.dim) };
}

const ASSET_RE = /^[A-Za-z0-9_-]{8,64}$/;
const asset = (v: unknown) => (typeof v === 'string' && ASSET_RE.test(v) ? v : null);
const dim = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Turns an untrusted database document into a valid design, or null. */
export function parseDesign(id: string, raw: unknown): Design | null {
  if (!DESIGN_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'board' && r.kind !== 'page') return null;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, DESIGN_NAME_MAX) : '';
  return {
    id,
    kind: r.kind,
    name: name || (r.kind === 'board' ? 'Spielfeld' : 'Hintergrund'),
    imageId: asset(r.imageId),
    displayId: asset(r.displayId) ?? asset(r.imageId),
    imageW: dim(r.imageW),
    imageH: dim(r.imageH),
    fit: clampFit(r.fit),
    layout: clampLayout(r.layout),
    page: clampPage(r.page),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  };
}

export function designToDoc(d: Design): Record<string, unknown> {
  const { id: _id, ...doc } = d;
  void _id;
  return { ...doc, fit: { ...d.fit }, layout: { ...d.layout }, page: { ...d.page } };
}

export function parseDesignState(raw: unknown): DesignState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === 'string' && DESIGN_ID_RE.test(v) ? v : null);
  return { board: id(r.board), boardPrev: id(r.boardPrev), page: id(r.page), pagePrev: id(r.pagePrev), updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '' };
}

/** Publishes a design (null = standard) and remembers the previous one. */
export function publish(state: DesignState, kind: DesignKind, id: string | null, now = new Date().toISOString()): DesignState {
  const current = state[kind];
  if (current === id) return state;
  return kind === 'board' ? { ...state, board: id, boardPrev: current, updatedAt: now } : { ...state, page: id, pagePrev: current, updatedAt: now };
}

/** Goes back to the previously published design (and makes the current one the "previous"). */
export function restorePrevious(state: DesignState, kind: DesignKind, now = new Date().toISOString()): DesignState {
  const prev = kind === 'board' ? state.boardPrev : state.pagePrev;
  return publish(state, kind, prev, now);
}

export function nextDesignId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = /^d(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `d${String(max + 1).padStart(3, '0')}`;
}

export function newDesign(id: string, kind: DesignKind, now = new Date().toISOString()): Design {
  return {
    id, kind, name: kind === 'board' ? 'Neues Spielfeld' : 'Neuer Hintergrund', imageId: null, displayId: null, imageW: 0, imageH: 0,
    fit: { ...DEFAULT_FIT }, layout: { ...DEFAULT_LAYOUT, cellAlpha: 0.35, cellBorders: true }, page: { ...DEFAULT_PAGE }, createdAt: now, updatedAt: now,
  };
}

/** Size of the copy used in the game: the whole picture, scaled down to fit maxW × maxH (never enlarged, never cropped). */
export function displaySize(w: number, h: number, max: { w: number; h: number }): { w: number; h: number } {
  const s = Math.min(1, max.w / w, max.h / h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Moving the picture with a finger: how much px/py change for a drag of dx/dy screen pixels.
 * The picture covers a frameW × frameH area at the given zoom; it can move as far as it is larger than the area.
 */
export function dragFit(fit: ImageFit, dx: number, dy: number, imageW: number, imageH: number, frameW: number, frameH: number): ImageFit {
  if (imageW <= 0 || imageH <= 0 || frameW <= 0 || frameH <= 0) return fit;
  const cover = Math.max(frameW / imageW, frameH / imageH) * fit.zoom;
  const extraX = imageW * cover - frameW;
  const extraY = imageH * cover - frameH;
  return {
    ...fit,
    px: extraX > 0.5 ? Math.min(1, Math.max(0, fit.px - dx / extraX)) : fit.px,
    py: extraY > 0.5 ? Math.min(1, Math.max(0, fit.py - dy / extraY)) : fit.py,
  };
}

/** CSS for the picture: cover the area, show the chosen part, zoom around that part. */
export function fitStyle(fit: ImageFit): { objectPosition: string; transform: string; transformOrigin: string } {
  const pos = `${(fit.px * 100).toFixed(2)}% ${(fit.py * 100).toFixed(2)}%`;
  return { objectPosition: pos, transform: `scale(${fit.zoom.toFixed(3)})`, transformOrigin: pos };
}

/** CSS variables for the board (read by .play-area .board in styles.css). */
export function layoutVars(layout: BoardLayout): Record<string, string> {
  return {
    '--board-size': String(layout.size),
    '--board-offset': String(layout.offsetY),
    '--board-gap': `${layout.gap}px`,
    '--board-pad': `${layout.frame}px`,
    '--cell-alpha': String(layout.cellAlpha),
  };
}

/** Designs in use right now (set when the app starts and when the admin publishes). */
export const ACTIVE: { board: Design | null; page: Design | null } = { board: null, page: null };

export function setActiveDesigns(board: Design | null, page: Design | null): void {
  ACTIVE.board = board && board.kind === 'board' ? board : null;
  ACTIVE.page = page && page.kind === 'page' ? page : null;
}
