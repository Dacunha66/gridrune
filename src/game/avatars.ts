// Avatars: a round picture with a creature (emoji, like the card pictures) on a coloured background, framed by
// rarity, or an uploaded picture. Six are there from the start; the others unlock when the matching achievement
// (Erfolge) was collected – also for players who collected it before avatars existed. The choice is kept by the
// server with the titles. The admin can change every avatar, upload pictures and add new ones (content_docs avatars).
import { ImageRef, parseImage } from './campaign';

export type AvatarFrame = 'none' | 'silver' | 'gold' | 'rune';
export const FRAME_LABEL: Record<AvatarFrame, string> = { none: 'Einfach', silver: 'Silber', gold: 'Gold', rune: 'Runenglanz' };

export interface AvatarDef {
  id: string;
  name: string;
  art: string;
  /** Background gradient (two colours). */
  bg: [string, string];
  frame: AvatarFrame;
  /** Achievement id (without "a:") that unlocks it; none = from the start. */
  quest?: string;
  /** Uploaded picture (replaces the emoji). */
  image?: ImageRef | null;
  /** Switched off by the admin: not offered and not shown (players who chose it show the first start avatar). */
  active?: boolean;
  updatedAt?: string;
}

const a = (id: string, name: string, art: string, bg: [string, string], frame: AvatarFrame, quest?: string): AvatarDef => ({ id, name, art, bg, frame, ...(quest ? { quest } : {}) });

export const BUILTIN_AVATARS: readonly AvatarDef[] = [
  // Start
  a('av01', 'Fuchs', '🦊', ['#f59e0b', '#7c2d12'], 'none'),
  a('av02', 'Wolf', '🐺', ['#64748b', '#1e293b'], 'none'),
  a('av03', 'Eule', '🦉', ['#a16207', '#422006'], 'none'),
  a('av04', 'Frosch', '🐸', ['#22c55e', '#14532d'], 'none'),
  a('av05', 'Katze', '🐱', ['#f472b6', '#831843'], 'none'),
  a('av06', 'Bär', '🐻', ['#b45309', '#451a03'], 'none'),
  // Erfolge
  a('av10', 'Tiger', '🐯', ['#fb923c', '#7c2d12'], 'silver', 'a-win10'),
  a('av11', 'Löwe', '🦁', ['#facc15', '#854d0e'], 'silver', 'a-win50'),
  a('av12', 'Drache', '🐉', ['#16a34a', '#052e16'], 'gold', 'a-win200'),
  a('av13', 'Falter', '🦋', ['#38bdf8', '#1e3a8a'], 'silver', 'a-cards50'),
  a('av14', 'Pfau', '🦚', ['#2dd4bf', '#134e4a'], 'silver', 'a-cards150'),
  a('av15', 'Einhorn', '🦄', ['#e879f9', '#581c87'], 'rune', 'a-cards250'),
  a('av16', 'Adler', '🦅', ['#a8a29e', '#292524'], 'silver', 'a-cap1000'),
  a('av17', 'Hai', '🦈', ['#0ea5e9', '#0c4a6e'], 'gold', 'a-cap5000'),
  a('av18', 'Magier', '🧙', ['#8b5cf6', '#2e1065'], 'rune', 'a-fx14'),
  a('av19', 'Schildkröte', '🐢', ['#4ade80', '#14532d'], 'silver', 'a-games100'),
  a('av20', 'Wal', '🐳', ['#60a5fa', '#172554'], 'gold', 'a-games2000'),
  a('av21', 'Skorpion', '🦂', ['#f97316', '#431407'], 'silver', 'a-strong50'),
  a('av22', 'Krone', '👑', ['#fde047', '#713f12'], 'gold', 'a-strong250'),
  a('av23', 'Nashorn', '🦏', ['#9ca3af', '#1f2937'], 'silver', 'a-big25'),
  a('av24', 'Urechse', '🦖', ['#84cc16', '#1a2e05'], 'gold', 'a-big100'),
  a('av25', 'Orakel', '🔮', ['#c084fc', '#3b0764'], 'silver', 'a-rune50'),
  a('av26', 'Elfe', '🧝', ['#34d399', '#064e3b'], 'rune', 'a-rune200'),
  a('av27', 'Vulkan', '🌋', ['#ef4444', '#450a0a'], 'silver', 'a-terrain150'),
  a('av28', 'Fee', '🧚', ['#f9a8d4', '#701a75'], 'gold', 'a-terrain500'),
  a('av29', 'Kristall', '💎', ['#67e8f9', '#164e63'], 'silver', 'a-kristall10'),
  a('av30', 'Kristallgeist', '💠', ['#a5f3fc', '#1e3a8a'], 'rune', 'a-kristall50'),
  a('av31', 'Komet', '☄️', ['#fdba74', '#1e1b4b'], 'rune', 'a-stars60'),
  a('av32', 'Burgherr', '🏰', ['#d6d3d1', '#44403c'], 'gold', 'a-world2'),
  a('av33', 'Lindwurm', '🐲', ['#4ade80', '#3f0d12'], 'gold', 'a-raid1'),
  a('av34', 'Veteran', '⚔️', ['#94a3b8', '#0f172a'], 'rune', 'a-raidatk200'),
  a('av35', 'Pokal', '🏆', ['#fcd34d', '#78350f'], 'rune', 'a-league50'),
  a('av36', 'Fechter', '🤺', ['#93c5fd', '#1e3a8a'], 'rune', 'a-online50'),
];

/** Avatars in use: the built-in ones, changed or extended by the admin (same id = replaced). */
export const AVATARS: AvatarDef[] = [...BUILTIN_AVATARS];
export const AVATARS_COLLECTION = 'avatars';
export const AVATAR_ID_RE = /^av\d{2,4}$/;
export const AVATAR_FRAMES: AvatarFrame[] = ['none', 'silver', 'gold', 'rune'];

export function setAvatars(saved: readonly AvatarDef[]): void {
  const byId = new Map<string, AvatarDef>(BUILTIN_AVATARS.map((x) => [x.id, x]));
  for (const x of saved) byId.set(x.id, x);
  AVATARS.splice(0, AVATARS.length, ...[...byId.values()].sort((x, y) => x.id.localeCompare(y.id)));
}

export const DEFAULT_AVATAR = 'av01';
const live = (x: AvatarDef) => x.active !== false;
export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && AVATARS.some((x) => x.id === id && live(x));
export const findAvatar = (id: string | null | undefined): AvatarDef => AVATARS.find((x) => x.id === id && live(x)) ?? AVATARS.find((x) => x.id === DEFAULT_AVATAR) ?? BUILTIN_AVATARS[0];

/** Avatars the player may choose: the active start ones and those whose achievement was collected ("a:<id>" keys). */
export function unlockedAvatars(claimed: readonly string[]): string[] {
  const done = new Set(claimed);
  return AVATARS.filter((x) => live(x) && (!x.quest || done.has(`a:${x.quest}`))).map((x) => x.id);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Turns a stored avatar document (untrusted) into a valid avatar, or null. */
export function parseAvatar(id: string, raw: unknown): AvatarDef | null {
  if (!AVATAR_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 24) : '';
  if (!name) return null;
  const art = typeof r.art === 'string' && r.art.trim() ? [...r.art.trim()].slice(0, 4).join('') : '🙂';
  const bg = Array.isArray(r.bg) && r.bg.length === 2 && r.bg.every((c) => typeof c === 'string' && COLOR_RE.test(c)) ? [r.bg[0], r.bg[1]] as [string, string] : ['#475569', '#0f172a'] as [string, string];
  const frame = AVATAR_FRAMES.includes(r.frame as AvatarFrame) ? (r.frame as AvatarFrame) : 'none';
  const quest = typeof r.quest === 'string' && /^[a-z0-9_-]{1,32}$/.test(r.quest) ? r.quest : undefined;
  return {
    id, name, art, bg, frame, ...(quest ? { quest } : {}), image: parseImage(r.image), active: r.active !== false,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '',
  };
}

export function avatarToDoc(x: AvatarDef): Record<string, unknown> {
  const { id: _id, ...rest } = x;
  void _id;
  return JSON.parse(JSON.stringify({ ...rest, image: rest.image ?? null, active: rest.active !== false }));
}

export function nextAvatarId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const n = Number(id.slice(2));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `av${String(max + 1).padStart(2, '0')}`;
}
