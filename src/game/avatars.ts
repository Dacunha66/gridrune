// Avatars: a round picture with a creature (emoji, like the card pictures) on a coloured background, framed by
// rarity. Six are there from the start; the others unlock when the matching achievement (Erfolge) was collected –
// also for players who collected it before avatars existed. The choice is kept by the server with the titles.

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
}

const a = (id: string, name: string, art: string, bg: [string, string], frame: AvatarFrame, quest?: string): AvatarDef => ({ id, name, art, bg, frame, ...(quest ? { quest } : {}) });

export const AVATARS: readonly AvatarDef[] = [
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

export const DEFAULT_AVATAR = 'av01';
export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && AVATARS.some((x) => x.id === id);
export const findAvatar = (id: string | null | undefined): AvatarDef => AVATARS.find((x) => x.id === id) ?? AVATARS[0];

/** Avatars the player may choose: the start ones and those whose achievement was collected ("a:<id>" keys). */
export function unlockedAvatars(claimed: readonly string[]): string[] {
  const done = new Set(claimed);
  return AVATARS.filter((x) => !x.quest || done.has(`a:${x.quest}`)).map((x) => x.id);
}
