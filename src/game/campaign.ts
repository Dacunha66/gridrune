// Campaign content: worlds, missions and computer opponents. Everything is data – the built-in
// world "Flüsterwald" is only the starting content; the admin's saved documents replace it by id
// (like arenas). The campaign never changes card values or rules: missions only choose an arena,
// an opponent deck, an AI level and which cards the player may use.
import { AI_LEVELS, AiLevel } from './ai';
import { ARENAS, Arena } from './arenas';
import { HAND_SIZE } from './battle';
import { CARDS, CardDef, RARITY_ORDER, cardPower, getCard, isCardId } from './cards';
import { CLASS_INFO, CLASS_TERRAIN, CardClass, EFFECTS, isCardClass } from './effects';
import { Goal, goalProblems, parseGoal } from './campaignGoals';
import { ImageFit, clampFit } from './designs';

export type ContentStatus = 'draft' | 'active' | 'disabled';
export const CONTENT_STATUSES: ContentStatus[] = ['draft', 'active', 'disabled'];
export const STATUS_LABEL: Record<ContentStatus, string> = { draft: 'Entwurf', active: 'Veröffentlicht', disabled: 'Deaktiviert' };

export const WORLDS_COLLECTION = 'campaign_worlds';
export const MISSIONS_COLLECTION = 'campaign_missions';
export const OPPONENTS_COLLECTION = 'campaign_opponents';

export const WORLD_ID_RE = /^w\d{2,4}$/;
export const MISSION_ID_RE = /^m\d{3,5}$/;
export const OPPONENT_ID_RE = /^o\d{3,5}$/;
export const NAME_MAX = 40;
export const TEXT_MAX = 400;
export const GOALS_PER_MISSION = 3;
export const STARS_PER_MISSION = 3;

/** An uploaded picture with its position (same zoom/offset model as the board designer). */
export interface ImageRef {
  /** Copy shown in the game (asset id). */
  id: string;
  w: number;
  h: number;
  fit: ImageFit;
}

export type ImageKind = 'worldTile' | 'worldMap' | 'missionIcon' | 'avatar' | 'bossPortrait' | 'bossBackground' | 'runeArt' | 'runeIcon' | 'packArt';

/**
 * Recommended sizes, derived from the layout: the world map and boss background fill a phone screen
 * (iPhone 9:19.5 at 3× ≈ 1290 × 2796 px); world tiles are wide 16:9 cards; icons and avatars are round/square
 * and shown at up to ~160 points (512 px is sharp at 3×); the boss portrait is a 3:4 card shown up to ~340 points wide.
 */
export const IMAGE_SPECS: Record<ImageKind, { label: string; w: number; h: number; ratio: string; aspect: number }> = {
  worldTile: { label: 'Welt-Kachel', w: 1200, h: 675, ratio: '16:9 (Querformat)', aspect: 16 / 9 },
  worldMap: { label: 'Weltkarte (Hintergrund)', w: 1290, h: 2796, ratio: 'ca. 9:19,5 (Hochformat)', aspect: 1290 / 2796 },
  missionIcon: { label: 'Missions-Icon', w: 512, h: 512, ratio: '1:1 (quadratisch)', aspect: 1 },
  avatar: { label: 'Gegner-Avatar', w: 512, h: 512, ratio: '1:1 (quadratisch)', aspect: 1 },
  bossPortrait: { label: 'Boss-Porträt', w: 1024, h: 1365, ratio: '3:4 (Hochformat)', aspect: 3 / 4 },
  bossBackground: { label: 'Boss-Hintergrund', w: 1290, h: 2796, ratio: 'ca. 9:19,5 (Hochformat)', aspect: 1290 / 2796 },
  // Rune artwork: round medallion up to ~320 points in the details (1024 px is sharp at 3×).
  runeArt: { label: 'Runen-Illustration', w: 1024, h: 1024, ratio: '1:1 (quadratisch, wird rund gezeigt)', aspect: 1 },
  // Rune symbol: 32–44 points in the duel bar and the collection (256 px is sharp at 3×, transparent PNG).
  runeIcon: { label: 'Runen-Symbol', w: 256, h: 256, ratio: '1:1 (PNG mit Transparenz)', aspect: 1 },
  // Booster pack: up to ~200 points wide in the shop and the opening animation (768 px is sharp at 3×).
  packArt: { label: 'Booster-Bild', w: 768, h: 1024, ratio: '3:4 (Hochformat)', aspect: 3 / 4 },
};

export type RewardType = 'coins' | 'card' | 'pack' | 'alt_art' | 'frame' | 'title' | 'achievement' | 'unlock';
export const REWARD_TYPES: RewardType[] = ['coins', 'card', 'pack', 'alt_art', 'frame', 'title', 'achievement', 'unlock'];
export const REWARD_LABEL: Record<RewardType, string> = {
  coins: 'Münzen', card: 'Karte', pack: 'Kartenpack', alt_art: 'Alternative Illustration', frame: 'Rahmen', title: 'Titel', achievement: 'Erfolg', unlock: 'Freischaltung',
};

/**
 * A reward as planned by the admin. Paying out comes later with player accounts (server-checked,
 * only once per player); until then rewards are shown as a preview only.
 */
export interface Reward {
  type: RewardType;
  /** Coins. */
  amount?: number;
  /** Card (also for alternative illustrations). */
  cardId?: string;
  /** Name of a frame, title, achievement or unlock; description of an illustration. */
  label?: string;
}

export interface Milestone {
  stars: number;
  reward: Reward;
}

export interface World {
  id: string;
  name: string;
  description: string;
  order: number;
  status: ContentStatus;
  tile: ImageRef | null;
  map: ImageRef | null;
  /** Needed to open the world: a finished earlier world and/or a number of stars in total. */
  unlock: { afterWorld?: string; minStars?: number };
  milestones: Milestone[];
  updatedAt: string;
}

export type MissionKind = 'tutorial' | 'normal' | 'special' | 'elite' | 'boss';
export const MISSION_KINDS: MissionKind[] = ['tutorial', 'normal', 'special', 'elite', 'boss'];
export const KIND_LABEL: Record<MissionKind, string> = { tutorial: 'Tutorial', normal: 'Normal', special: 'Spezial', elite: 'Elite', boss: 'Boss' };

/** duel = classic 4×4 duel with chosen cards (A, also used for special missions C); runner = run first, then duel (B). */
export type MissionMode = 'duel' | 'runner';
export const MODE_LABEL: Record<MissionMode, string> = { duel: 'Duell', runner: 'Lauf + Duell' };

export interface Mission {
  id: string;
  worldId: string;
  order: number;
  name: string;
  description: string;
  kind: MissionKind;
  mode: MissionMode;
  arenaId: string;
  opponentId: string;
  /** Special missions: only cards of this class may be used (missing ones are lent as common cards). */
  onlyClass?: CardClass;
  /** Three star goals; the first one is always "win". */
  goals: Goal[];
  /** Planned reward per star (null = none). */
  goalRewards: (Reward | null)[];
  /** Planned reward for the first win. */
  firstReward: Reward | null;
  /** Extra condition next to "previous mission won": stars in this world. */
  minWorldStars?: number;
  /** Tips shown before the duel (tutorial). */
  tips: string[];
  /** Position of the station on the world map, 0–1. */
  pos: { x: number; y: number };
  icon: ImageRef | null;
  status: ContentStatus;
  updatedAt: string;
}

export type OpponentRank = 'normal' | 'elite' | 'boss';
export const RANK_LABEL: Record<OpponentRank, string> = { normal: 'Normal', elite: 'Elite', boss: 'Boss' };
export const LEVEL_LABEL: Record<AiLevel, string> = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

export interface Opponent {
  id: string;
  name: string;
  description: string;
  /** Emoji shown without a picture. */
  emoji: string;
  avatar: ImageRef | null;
  level: AiLevel;
  /** Exactly 8 different existing cards. */
  deck: string[];
  prefer: CardClass[];
  rank: OpponentRank;
  /** Boss presentation (also usable for elites). */
  intro: string;
  winText: string;
  loseText: string;
  portrait: ImageRef | null;
  background: ImageRef | null;
  /** Rune the opponent brings (only while runes are released). */
  rune?: string;
  updatedAt: string;
}

// ---------- Parsing (untrusted database documents) ----------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};
const status = (v: unknown): ContentStatus => (CONTENT_STATUSES.includes(v as ContentStatus) ? (v as ContentStatus) : 'draft');
const ASSET_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function parseImage(raw: unknown): ImageRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ASSET_RE.test(r.id)) return null;
  return { id: r.id, w: int(r.w, 0, 20000, 0), h: int(r.h, 0, 20000, 0), fit: clampFit(r.fit) };
}

export function parseReward(raw: unknown): Reward | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!REWARD_TYPES.includes(r.type as RewardType)) return null;
  const out: Reward = { type: r.type as RewardType };
  if (out.type === 'coins' || out.type === 'pack') out.amount = int(r.amount, 1, out.type === 'pack' ? 10 : 100000, out.type === 'pack' ? 1 : 100);
  if ((out.type === 'card' || out.type === 'alt_art') && typeof r.cardId === 'string' && /^[a-z]\d{2,4}$/.test(r.cardId)) out.cardId = r.cardId;
  const label = str(r.label, 60);
  if (label) out.label = label;
  return out;
}

export function parseWorld(id: string, raw: unknown): World | null {
  if (!WORLD_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, NAME_MAX);
  if (!name) return null;
  const u = (r.unlock && typeof r.unlock === 'object' ? r.unlock : {}) as Record<string, unknown>;
  const unlock: World['unlock'] = {};
  if (typeof u.afterWorld === 'string' && WORLD_ID_RE.test(u.afterWorld) && u.afterWorld !== id) unlock.afterWorld = u.afterWorld;
  if (typeof u.minStars === 'number' && u.minStars > 0) unlock.minStars = int(u.minStars, 1, 9999, 0);
  const milestones = (Array.isArray(r.milestones) ? r.milestones : []).flatMap((m): Milestone[] => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const reward = parseReward(o.reward);
    return reward && typeof o.stars === 'number' ? [{ stars: int(o.stars, 1, 999, 1), reward }] : [];
  }).sort((a, b) => a.stars - b.stars).slice(0, 12);
  return {
    id, name, description: str(r.description, TEXT_MAX), order: int(r.order, 0, 9999, 0), status: status(r.status),
    tile: parseImage(r.tile), map: parseImage(r.map), unlock, milestones, updatedAt: str(r.updatedAt, 40),
  };
}

export function parseMission(id: string, raw: unknown): Mission | null {
  if (!MISSION_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, NAME_MAX);
  if (!name || typeof r.worldId !== 'string' || !WORLD_ID_RE.test(r.worldId)) return null;
  const goals = (Array.isArray(r.goals) ? r.goals : []).map(parseGoal).filter((g): g is Goal => !!g).slice(0, GOALS_PER_MISSION);
  // The first star is always for winning.
  if (goals[0]?.type !== 'win') goals.unshift({ id: `${id}-win`, type: 'win', n: 0 });
  goals.splice(GOALS_PER_MISSION);
  const rewards = Array.isArray(r.goalRewards) ? r.goalRewards : [];
  const pos = (r.pos && typeof r.pos === 'object' ? r.pos : {}) as Record<string, unknown>;
  const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  const mission: Mission = {
    id, worldId: r.worldId, order: int(r.order, 0, 9999, 0), name, description: str(r.description, TEXT_MAX),
    kind: MISSION_KINDS.includes(r.kind as MissionKind) ? (r.kind as MissionKind) : 'normal',
    mode: r.mode === 'runner' ? 'runner' : 'duel',
    arenaId: typeof r.arenaId === 'string' ? r.arenaId : 'a01',
    opponentId: typeof r.opponentId === 'string' ? r.opponentId : '',
    goals,
    goalRewards: goals.map((_, i) => parseReward(rewards[i])),
    firstReward: parseReward(r.firstReward),
    tips: (Array.isArray(r.tips) ? r.tips : []).map((t) => str(t, 160)).filter(Boolean).slice(0, 6),
    pos: { x: clamp01(pos.x, 0.5), y: clamp01(pos.y, 0.5) },
    icon: parseImage(r.icon),
    status: status(r.status),
    updatedAt: str(r.updatedAt, 40),
  };
  if (isCardClass(r.onlyClass)) mission.onlyClass = r.onlyClass;
  if (typeof r.minWorldStars === 'number' && r.minWorldStars > 0) mission.minWorldStars = int(r.minWorldStars, 1, 999, 0);
  return mission;
}

export function parseOpponent(id: string, raw: unknown): Opponent | null {
  if (!OPPONENT_ID_RE.test(id) || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, NAME_MAX);
  if (!name) return null;
  const deck = [...new Set((Array.isArray(r.deck) ? r.deck : []).filter((c): c is string => typeof c === 'string' && /^[a-z]\d{2,4}$/.test(c)))].slice(0, HAND_SIZE);
  return {
    id, name, description: str(r.description, TEXT_MAX), emoji: str(r.emoji, 8) || '👤', avatar: parseImage(r.avatar),
    level: AI_LEVELS.includes(r.level as AiLevel) ? (r.level as AiLevel) : 'medium',
    deck,
    prefer: (Array.isArray(r.prefer) ? r.prefer : []).filter(isCardClass).slice(0, 3),
    rank: r.rank === 'elite' || r.rank === 'boss' ? r.rank : 'normal',
    intro: str(r.intro, TEXT_MAX), winText: str(r.winText, TEXT_MAX), loseText: str(r.loseText, TEXT_MAX),
    portrait: parseImage(r.portrait), background: parseImage(r.background), updatedAt: str(r.updatedAt, 40),
    ...(typeof r.rune === 'string' && /^rn\d{2,4}$/.test(r.rune) ? { rune: r.rune } : {}),
  };
}

function withoutId<T extends { id: string }>(x: T): Record<string, unknown> {
  const { id: _id, ...rest } = x;
  void _id;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}
export const worldToDoc = (w: World) => withoutId(w);
export const missionToDoc = (m: Mission) => withoutId(m);
export const opponentToDoc = (o: Opponent) => withoutId(o);

function nextId(prefix: string, digits: number, existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}`;
}
export const nextWorldId = (ids: Iterable<string>) => nextId('w', 2, ids);
export const nextMissionId = (ids: Iterable<string>) => nextId('m', 3, ids);
export const nextOpponentId = (ids: Iterable<string>) => nextId('o', 3, ids);

let goalCounter = 0;
/** A new, unique goal id (earned stars stay attached to it). */
export function newGoalId(missionId: string): string {
  goalCounter = (goalCounter + 1) % 1000;
  return `${missionId}-${Date.now().toString(36)}${goalCounter}`;
}

// ---------- Built-in content: "Flüsterwald" ----------

const goals = (mid: string, ...extra: Omit<Goal, 'id'>[]): Goal[] =>
  [{ id: `${mid}-g1`, type: 'win', n: 0 } as Goal, ...extra.map((g, i) => ({ ...g, id: `${mid}-g${i + 2}` }))];

function opp(id: string, name: string, emoji: string, level: AiLevel, rank: OpponentRank, deck: string[], prefer: CardClass[], description: string, extra: Partial<Opponent> = {}): Opponent {
  return { id, name, description, emoji, avatar: null, level, deck, prefer, rank, intro: '', winText: '', loseText: '', portrait: null, background: null, updatedAt: '', ...extra };
}

export const BUILTIN_OPPONENTS: readonly Opponent[] = [
  opp('o001', 'Moosling-Lehrling', '🌱', 'easy', 'normal', ['c01', 'c06', 'c09', 'c11', 'c12', 'c14', 'c17', 'c20'], ['natur'], 'Ein junger Waldbewohner, der gerade erst das Raster-Duell lernt.'),
  opp('o002', 'Pfadstreuner', '🦔', 'easy', 'normal', ['c03', 'c05', 'c08', 'c15', 'c16', 'c21', 'c24', 'c30'], ['krieger'], 'Treibt sich auf dem Waldpfad herum und fordert jeden Wanderer heraus.'),
  opp('o003', 'Lichtungsgeist', '🍃', 'easy', 'normal', ['c06', 'c09', 'c12', 'c17', 'c19', 'c20', 'c21', 'c28'], ['natur'], 'Wacht über die Mooslichtung und kennt jedes Waldfeld.'),
  opp('o004', 'Waldhüter Bram', '🪓', 'medium', 'normal', ['u06', 'u07', 'u08', 'c09', 'c14', 'c17', 'c19', 'c28'], ['natur'], 'Ein erfahrener Hüter, der seine Karten klug an den Nachbarn ausrichtet.'),
  opp('o005', 'Dornenhexe', '🌵', 'medium', 'normal', ['u10', 'u12', 'c05', 'c11', 'c12', 'c19', 'c21', 'c28'], ['natur'], 'Prüft, ob du allein mit der Kraft der Natur bestehen kannst.'),
  opp('o006', 'Irrlicht', '✨', 'medium', 'normal', ['c04', 'c13', 'c18', 'c22', 'c23', 'c26', 'c27', 'u24'], ['schatten', 'magier'], 'Lockt Wanderer vom Weg ab – und schwächt ihre Karten.'),
  opp('o007', 'Pilzkönig', '🍄', 'medium', 'normal', ['c09', 'c11', 'c12', 'c13', 'c19', 'c20', 'u08', 'u12'], ['natur'], 'Herrscht über die feuchte Pilzhöhle.'),
  opp('o008', 'Ruinenwächter', '🗿', 'hard', 'elite', ['u01', 'u02', 'u15', 'u20', 'u22', 'c16', 'c24', 'c30'], ['krieger'], 'Ein steinerner Krieger, der jeden Zug des Gegners vorausdenkt.', { rune: 'rn02' }),
  opp('o009', 'Torwächterin Lyra', '🔮', 'hard', 'elite', ['u03', 'u04', 'u09', 'u11', 'u13', 'u19', 'c18', 'c22'], ['magier'], 'Bewacht das Tor zum Herzen des Waldes mit alter Magie.', { rune: 'rn01' }),
  opp('o010', 'Waldwächter', '🌳', 'hard', 'boss', ['r06', 'r15', 'u06', 'u09', 'u10', 'u12', 'u14', 'c06'], ['natur'], 'Der uralte Wächter des Flüsterwalds. Er spielt nach denselben Regeln wie du – aber er kennt jedes Waldfeld.', {
    rune: 'rn04',
    intro: 'Die Bäume verstummen. Aus dem Herz des Waldes erhebt sich der Waldwächter: „Beweise, dass du diesen Wald verdienst.“',
    winText: 'Der Waldwächter neigt sein Haupt. Der Flüsterwald gehört dir.',
    loseText: 'Die Wurzeln ziehen sich zurück. „Komm wieder, wenn du stärker bist.“',
  }),
];

export const BUILTIN_WORLDS: readonly World[] = [
  {
    id: 'w01', name: 'Flüsterwald', order: 1, status: 'active', tile: null, map: null, unlock: {}, updatedAt: '',
    description: 'Ein verzauberter Wald voller Naturwesen. Hier lernst du das Raster-Duell – und triffst am Ende auf den Waldwächter.',
    milestones: [
      { stars: 5, reward: { type: 'coins', amount: 200 } },
      { stars: 10, reward: { type: 'pack', amount: 1 } },
      { stars: 15, reward: { type: 'alt_art', cardId: 'u09', label: 'Hirschwächter im Flüsterwald' } },
      { stars: 20, reward: { type: 'frame', label: 'Waldrahmen' } },
      { stars: 25, reward: { type: 'coins', amount: 500 } },
      { stars: 25, reward: { type: 'title', label: 'Hüter des Flüsterwalds' } },
      { stars: 30, reward: { type: 'alt_art', cardId: 'l03', label: 'Waldwächter (legendäre Illustration)' } },
    ],
  },
];

function mission(
  id: string, order: number, name: string, kind: MissionKind, arenaId: string, opponentId: string, g: Goal[], description: string,
  pos: { x: number; y: number }, extra: Partial<Mission> = {},
): Mission {
  return {
    id, worldId: 'w01', order, name, description, kind, mode: 'duel', arenaId, opponentId, goals: g, goalRewards: [null, null, null],
    firstReward: null, tips: [], pos, icon: null, status: 'active', updatedAt: '', ...extra,
  };
}

export const BUILTIN_MISSIONS: readonly Mission[] = [
  mission('m001', 1, 'Erstes Duell', 'tutorial', 'a01', 'o001', goals('m001', { type: 'min_fields', n: 10 }, { type: 'play_class', n: 2, cls: 'natur' }),
    'Lerne das Raster-Duell gegen einen freundlichen Moosling.', { x: 0.5, y: 0.94 }, {
      tips: [
        'Lege abwechselnd eine Karte auf ein freies Feld.',
        'Ist deine Zahl zur Nachbarkarte größer als ihre Zahl zu dir, eroberst du sie.',
        'Am Ende gewinnt, wem mehr Karten auf dem Feld gehören.',
        'Halte eine Karte gedrückt, um sie groß zu sehen. Tippe auf eine Feldkarte für Details.',
      ],
    }),
  mission('m002', 2, 'Waldpfad', 'normal', 'a01', 'o002', goals('m002', { type: 'min_captures', n: 5 }, { type: 'min_fields', n: 10 }),
    'Ein Streuner versperrt den Pfad tiefer in den Wald.', { x: 0.28, y: 0.84 }),
  mission('m003', 3, 'Mooslichtung', 'normal', 'a07', 'o003', goals('m003', { type: 'terrain_bonus', n: 2 }, { type: 'play_class', n: 3, cls: 'natur' }),
    'Hier gibt es Waldfelder 🌲: Naturkarten werden dort stärker.', { x: 0.62, y: 0.75 }, {
      tips: ['Naturkarten 🌿 bekommen auf Waldfeldern 🌲 +1 auf alle Werte.', 'Wählst du eine Karte aus, leuchten die Felder, auf denen sie ihren Bonus bekommt.'],
    }),
  mission('m004', 4, 'Waldhüter', 'normal', 'a02', 'o004', goals('m004', { type: 'min_fields', n: 10 }, { type: 'effect_active', n: 1, effect: 'naturbund' }),
    'Waldhüter Bram prüft, ob du deine Karten klug nebeneinander legst.', { x: 0.8, y: 0.65 }),
  mission('m005', 5, 'Dornenprüfung', 'special', 'a02', 'o005', goals('m005', { type: 'min_captures', n: 6 }, { type: 'min_margin', n: 4 }),
    'Nur Naturkarten sind erlaubt. Fehlende Plätze füllen gewöhnliche Leihkarten.', { x: 0.5, y: 0.56 }, { onlyClass: 'natur' }),
  mission('m006', 6, 'Verwunschener Pfad', 'normal', 'a05', 'o006', goals('m006', { type: 'runner_clean', n: 0 }, { type: 'min_fields', n: 10 }),
    'Erst durch den verwunschenen Pfad laufen, dann gegen das Irrlicht antreten.', { x: 0.22, y: 0.47 }, { mode: 'runner' }),
  mission('m007', 7, 'Pilzhöhle', 'normal', 'a05', 'o007', goals('m007', { type: 'min_fields', n: 10 }, { type: 'without_class', n: 0, cls: 'schatten' }),
    'In der dunklen Pilzhöhle wartet der Pilzkönig.', { x: 0.45, y: 0.38 }),
  mission('m008', 8, 'Alte Ruinen', 'elite', 'a06', 'o008', goals('m008', { type: 'min_fields', n: 11 }, { type: 'min_captures', n: 7 }),
    'Elite: Der Ruinenwächter denkt deine Antworten voraus.', { x: 0.75, y: 0.29 }),
  mission('m009', 9, 'Wächtertor', 'elite', 'a02', 'o009', goals('m009', { type: 'without_class', n: 0, cls: 'magier' }, { type: 'min_margin', n: 4 }),
    'Elite: Torwächterin Lyra lässt nur Würdige passieren.', { x: 0.42, y: 0.18 }),
  mission('m010', 10, 'Herz des Waldes', 'boss', 'a08', 'o010', goals('m010', { type: 'min_fields', n: 10 }, { type: 'terrain_bonus', n: 3 }),
    'Endboss: Der Waldwächter erwartet dich im Herzen des Waldes.', { x: 0.5, y: 0.06 }),
];

// ---------- Content in use (built-ins replaced or extended by the admin's documents) ----------

export interface CampaignContent {
  worlds: World[];
  missions: Mission[];
  opponents: Opponent[];
}

function merge<T extends { id: string }>(builtins: readonly T[], saved: readonly T[]): T[] {
  const byId = new Map<string, T>(builtins.map((x) => [x.id, x]));
  for (const x of saved) byId.set(x.id, x);
  return [...byId.values()];
}

export function mergeContent(saved: Partial<CampaignContent>): CampaignContent {
  return {
    worlds: merge(BUILTIN_WORLDS, saved.worlds ?? []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    missions: merge(BUILTIN_MISSIONS, saved.missions ?? []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    opponents: merge(BUILTIN_OPPONENTS, saved.opponents ?? []).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export const CAMPAIGN: CampaignContent = mergeContent({});

export function setCampaign(content: CampaignContent): void {
  CAMPAIGN.worlds = content.worlds;
  CAMPAIGN.missions = content.missions;
  CAMPAIGN.opponents = content.opponents;
}

/** Content players see (published only); the admin preview sees drafts too. */
export function visibleWorlds(content: CampaignContent, preview = false): World[] {
  return content.worlds.filter((w) => w.status === 'active' || (preview && w.status === 'draft'));
}

export function worldMissions(content: CampaignContent, worldId: string, preview = false): Mission[] {
  return content.missions.filter((m) => m.worldId === worldId && (m.status === 'active' || (preview && m.status === 'draft')));
}

export function findArena(id: string, arenas: readonly Arena[] = ARENAS): Arena | null {
  return arenas.find((a) => a.id === id) ?? null;
}

// ---------- Player hand for a mission ----------

export interface MissionCard {
  cardId: string;
  /** Lent for this mission only (common card of the required class). */
  loan: boolean;
}

/** Cards the player may choose from: the deck (only the allowed class) plus lent common cards to reach 8. */
export function missionPool(mission: Mission, deck: readonly string[], cards: readonly CardDef[] = CARDS): MissionCard[] {
  const active = new Set(cards.map((c) => c.id));
  const allowed = (id: string) => active.has(id) && (!mission.onlyClass || getCard(id).cls === mission.onlyClass);
  const own: MissionCard[] = [...new Set(deck)].filter(allowed).map((cardId) => ({ cardId, loan: false }));
  const pool = [...own];
  // Lend common cards of the required class (never stronger ones) so every player can play.
  const needed = mission.onlyClass ? HAND_SIZE - own.length : 0;
  if (needed > 0) {
    const loans = cards.filter((c) => c.rarity === 'common' && c.cls === mission.onlyClass && !own.some((o) => o.cardId === c.id));
    for (const c of loans.slice(0, needed)) pool.push({ cardId: c.id, loan: true });
  }
  return pool;
}

/**
 * Suggested 8 cards: enough cards of a class a goal asks for, then the strongest.
 * The player can change the choice before the duel.
 */
export function suggestHand(mission: Mission, pool: readonly MissionCard[]): MissionCard[] {
  const byStrength = [...pool].sort((a, b) => {
    const ca = getCard(a.cardId);
    const cb = getCard(b.cardId);
    return Number(a.loan) - Number(b.loan) || cardPower(cb) - cardPower(ca) || RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || a.cardId.localeCompare(b.cardId);
  });
  const avoid = new Set(mission.goals.filter((g) => g.type === 'without_class' && g.cls).map((g) => g.cls!));
  const hand: MissionCard[] = [];
  for (const g of mission.goals) {
    if (g.type !== 'play_class' || !g.cls) continue;
    for (const c of byStrength) {
      if (hand.length >= HAND_SIZE || hand.filter((h) => getCard(h.cardId).cls === g.cls).length >= g.n) break;
      if (getCard(c.cardId).cls === g.cls && !hand.includes(c)) hand.push(c);
    }
  }
  const effects = mission.goals.filter((g) => g.type === 'effect_active' && g.effect).map((g) => g.effect!);
  const terrain = mission.goals.some((g) => g.type === 'terrain_bonus');
  for (const c of byStrength) {
    const def = getCard(c.cardId);
    if (hand.length < HAND_SIZE && !hand.includes(c) && def.effect && (effects.includes(def.effect) || (terrain && EFFECTS[def.effect].terrain))) hand.push(c);
  }
  for (const pass of [true, false]) {
    for (const c of byStrength) {
      if (hand.length >= HAND_SIZE) break;
      const cls = getCard(c.cardId).cls;
      if (!hand.includes(c) && (!pass || !cls || !avoid.has(cls))) hand.push(c);
    }
  }
  return hand;
}

// ---------- Checks for the editor ----------

export interface Problem {
  level: 'error' | 'warning';
  where: string;
  text: string;
}

/** Everything that would make a mission unplayable or a goal unreachable. */
export function missionProblems(m: Mission, content: CampaignContent, arenas: readonly Arena[] = ARENAS, cards: readonly CardDef[] = CARDS): Problem[] {
  const out: Problem[] = [];
  const where = `Mission „${m.name}“`;
  const err = (text: string) => out.push({ level: 'error', where, text });
  const warn = (text: string) => out.push({ level: 'warning', where, text });
  if (!content.worlds.some((w) => w.id === m.worldId)) err('Gehört zu keiner vorhandenen Welt.');
  const arena = findArena(m.arenaId, arenas);
  if (!arena) err('Arena fehlt.');
  else if (arena.status === 'disabled') warn(`Arena „${arena.name}“ ist deaktiviert.`);
  const o = content.opponents.find((x) => x.id === m.opponentId);
  if (!o) err('Gegner fehlt.');
  else {
    for (const p of opponentProblems(o, cards)) out.push({ ...p, where });
    if (m.kind === 'boss' && o.rank !== 'boss') warn('Bossmission ohne Boss-Gegner.');
  }
  if (m.goals.length < GOALS_PER_MISSION) warn(`Nur ${m.goals.length} von ${GOALS_PER_MISSION} Sterne-Zielen.`);
  const active = new Set(cards.map((c) => c.id));
  for (const [i, g] of m.goals.entries()) {
    const { errors, warnings } = goalProblems(g, { runner: m.mode === 'runner', terrain: arena?.cells ?? [], rocks: 0, onlyClass: m.onlyClass });
    errors.forEach((t) => err(`Stern ${i + 1}: ${t}`));
    warnings.forEach((t) => warn(`Stern ${i + 1}: ${t}`));
    // Cards that can do it must exist in the game right now.
    if (g.type === 'terrain_bonus' && arena) {
      const able = cards.filter((c) => (!m.onlyClass || c.cls === m.onlyClass) && (
        (c.cls && CLASS_TERRAIN[c.cls] && arena.cells.includes(CLASS_TERRAIN[c.cls]!)) || (c.effect && EFFECTS[c.effect].terrain && arena.cells.includes(EFFECTS[c.effect].terrain!))));
      if (able.length === 0) err(`Stern ${i + 1}: Keine aktive Karte bekommt in dieser Arena einen Geländebonus.`);
      else if (able.length < g.n) err(`Stern ${i + 1}: Nur ${able.length} Karte(n) bekommen hier einen Geländebonus – jede zählt einmal.`);
    }
    if (g.type === 'effect_active' && g.effect) {
      const able = cards.filter((c) => c.effect === g.effect);
      if (able.length < g.n) err(`Stern ${i + 1}: Nur ${able.length} aktive Karte(n) mit ${EFFECTS[g.effect].name}.`);
    }
    if (g.type === 'play_class' && g.cls && !m.onlyClass && cards.filter((c) => c.cls === g.cls && active.has(c.id)).length < g.n) {
      err(`Stern ${i + 1}: Zu wenige ${CLASS_INFO[g.cls].label}-Karten im Spiel.`);
    }
  }
  if (m.onlyClass && cards.filter((c) => c.rarity === 'common' && c.cls === m.onlyClass).length < HAND_SIZE) {
    warn(`Weniger als ${HAND_SIZE} gewöhnliche ${CLASS_INFO[m.onlyClass].label}-Karten zum Verleihen.`);
  }
  if (m.minWorldStars) {
    const before = content.missions.filter((x) => x.worldId === m.worldId && x.status === 'active' && x.order < m.order && x.id !== m.id);
    const reachable = before.reduce((n, x) => n + Math.min(STARS_PER_MISSION, x.goals.length), 0);
    if (m.minWorldStars > reachable) err(`Braucht ${m.minWorldStars} Sterne, vorher sind nur ${reachable} erreichbar.`);
  }
  return out;
}

export function opponentProblems(o: Opponent, cards: readonly CardDef[] = CARDS): Problem[] {
  const out: Problem[] = [];
  const where = `Gegner „${o.name}“`;
  const active = new Set(cards.map((c) => c.id));
  if (o.deck.length !== HAND_SIZE) out.push({ level: 'error', where, text: `Deck hat ${o.deck.length} statt ${HAND_SIZE} Karten.` });
  const missing = o.deck.filter((id) => !active.has(id));
  if (missing.length > 0) {
    out.push({ level: 'error', where, text: `Karte(n) fehlen oder sind nicht aktiv: ${missing.map((id) => (isCardId(id) ? `${getCard(id).name} (${id})` : id)).join(', ')}.` });
  }
  return out;
}

export function worldProblems(w: World, content: CampaignContent, arenas: readonly Arena[] = ARENAS, cards: readonly CardDef[] = CARDS): Problem[] {
  const out: Problem[] = [];
  const where = `Welt „${w.name}“`;
  const missions = content.missions.filter((m) => m.worldId === w.id && m.status === 'active');
  if (missions.length === 0) out.push({ level: 'error', where, text: 'Keine veröffentlichte Mission.' });
  const max = maxWorldStars(content, w.id);
  for (const ms of w.milestones) {
    if (ms.stars > max) out.push({ level: 'error', where, text: `Meilenstein ${ms.stars} ★ ist nicht erreichbar (höchstens ${max} ★).` });
    if ((ms.reward.type === 'card' || ms.reward.type === 'alt_art') && (!ms.reward.cardId || !isCardId(ms.reward.cardId))) {
      out.push({ level: 'error', where, text: `Meilenstein ${ms.stars} ★: Karte fehlt.` });
    }
  }
  if (w.unlock.afterWorld) {
    const prev = content.worlds.find((x) => x.id === w.unlock.afterWorld);
    if (!prev) out.push({ level: 'error', where, text: 'Die vorausgesetzte Welt gibt es nicht.' });
    else if (dependsOn(content, prev.id, w.id)) out.push({ level: 'error', where, text: 'Kreis: Die Welten setzen sich gegenseitig voraus.' });
  }
  if (w.unlock.minStars) {
    const other = content.worlds.filter((x) => x.id !== w.id && x.status === 'active' && !dependsOn(content, x.id, w.id));
    const reachable = other.reduce((n, x) => n + maxWorldStars(content, x.id), 0);
    if (w.unlock.minStars > reachable) out.push({ level: 'error', where, text: `Braucht ${w.unlock.minStars} ★, vorher sind nur ${reachable} ★ erreichbar.` });
  }
  for (const m of content.missions.filter((x) => x.worldId === w.id && x.status !== 'disabled')) out.push(...missionProblems(m, content, arenas, cards));
  return out;
}

/** True if world `a` (directly or indirectly) requires world `b`. */
function dependsOn(content: CampaignContent, a: string, b: string, seen = new Set<string>()): boolean {
  if (a === b) return true;
  if (seen.has(a)) return false;
  seen.add(a);
  const w = content.worlds.find((x) => x.id === a);
  return !!w?.unlock.afterWorld && dependsOn(content, w.unlock.afterWorld, b, seen);
}

export function maxWorldStars(content: CampaignContent, worldId: string): number {
  return content.missions.filter((m) => m.worldId === worldId && m.status === 'active').reduce((n, m) => n + Math.min(STARS_PER_MISSION, m.goals.length), 0);
}

/** Readable reward text, e.g. "200 Münzen" or "Alternative Illustration: Hirschwächter". */
export function rewardText(r: Reward): string {
  switch (r.type) {
    case 'coins': return `${r.amount ?? 0} Münzen`;
    case 'pack': return `${r.amount ?? 1} Kartenpack${(r.amount ?? 1) > 1 ? 's' : ''}`;
    case 'card': return `Karte: ${r.cardId && isCardId(r.cardId) ? getCard(r.cardId).name : r.cardId ?? '?'}`;
    case 'alt_art': return r.label || `Alternative Illustration: ${r.cardId && isCardId(r.cardId) ? getCard(r.cardId).name : '?'}`;
    default: return `${REWARD_LABEL[r.type]}${r.label ? `: ${r.label}` : ''}`;
  }
}

export const REWARD_ICON: Record<RewardType, string> = { coins: '🪙', card: '🃏', pack: '🎁', alt_art: '🖼️', frame: '🖼', title: '🏷️', achievement: '🏅', unlock: '🔓' };

