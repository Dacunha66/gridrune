// Erfolge: daily quests, weekly quests and lasting achievements. Everything here is pure (no database): what the
// quests are, which ones are active today, how far a player is and what a reward adds to the save. The server
// counts only results it has checked itself (adventure, campaign, league, raid, online duels) and pays every reward
// exactly once (claim keys); the game only shows the board.
import { isAvatarId } from './avatars';
import { CampaignContent, STARS_PER_MISSION } from './campaign';
import { CampaignProgress, missionStars } from './campaignProgress';
import { worldMissions, visibleWorlds } from './campaign';
import { GrantedReward, grantRewards } from './campaignRewards';
import { getCard, isCardId, ownedActiveIds } from './cards';
import { EFFECT_IDS, EffectId } from './effects';
import { deriveRng } from './league';
import { PACKS } from './shop';
import { Rng, shuffle } from './rng';
import { findRune } from './runes';
import { isSkinId, getSkin } from './skins';
import { SaveData } from './storage';

// ---------- Time: days and weeks in German time ----------

export const QUEST_TIME_ZONE = 'Europe/Berlin';

/** Date in Berlin as YYYY-MM-DD (the daily quests change at midnight German time). */
export function questDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: QUEST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** ISO week of the Berlin date, e.g. "2026-W45" (weekly quests change on Monday at midnight). */
export function questWeek(now: Date = new Date()): string {
  const [y, m, d] = questDay(now).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dow + 3); // Thursday of this week decides the year
  const year = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Milliseconds until the next Berlin midnight (for "neu in …"). */
export function msToNextDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: QUEST_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.max(0, 86400000 - ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000);
}

// ---------- What can be counted ----------

/**
 * Counted metrics grow with checked results; state metrics are read from the player's save, campaign and raids.
 * "effects" counts effects of own cards that worked; "fx:<effect>" keeps every effect once worked (Effektmeister).
 */
export type QuestMetric =
  | 'games' | 'wins' | 'wins_strong' | 'captures' | 'effects' | 'missions' | 'stars' | 'raid_attacks' | 'online_games' | 'online_wins' | 'league_wins'
  | 'big_wins' | 'runes_used' | 'terrain' | 'kristall_wins'
  | 'cards' | 'effects_distinct' | 'worlds_complete' | 'raids_defeated';

export const COUNTED_METRICS: QuestMetric[] = [
  'games', 'wins', 'wins_strong', 'captures', 'effects', 'missions', 'stars', 'raid_attacks', 'online_games', 'online_wins', 'league_wins',
  'big_wins', 'runes_used', 'terrain', 'kristall_wins',
];
/** A "Kantersieg": won with at least this many fields of the own colour. */
export const BIG_WIN_FIELDS = 12;
export const STATE_METRICS: QuestMetric[] = ['cards', 'effects_distinct', 'worlds_complete', 'raids_defeated'];
export const QUEST_METRICS: QuestMetric[] = [...COUNTED_METRICS, ...STATE_METRICS];

/** Text of a goal, e.g. "Gewinne 2 Spiele". */
export const METRIC_TEXT: Record<QuestMetric, (n: number) => string> = {
  games: (n) => `Spiele ${n} ${n === 1 ? 'Duell' : 'Duelle'}`,
  wins: (n) => `Gewinne ${n} ${n === 1 ? 'Spiel' : 'Spiele'}`,
  wins_strong: (n) => `Gewinne ${n}× gegen die KI auf „Normal“ oder „Schwer“`,
  captures: (n) => `Erobere ${n} Karten`,
  effects: (n) => `Löse ${n} Spezialeffekte aus`,
  missions: (n) => `Spiele ${n} Kampagnen-${n === 1 ? 'Mission' : 'Missionen'}`,
  stars: (n) => `Sammle ${n} Kampagnen-${n === 1 ? 'Stern' : 'Sterne'}`,
  raid_attacks: (n) => `Greife den Weltboss ${n === 1 ? 'an' : `${n}× an`}`,
  online_games: (n) => `Spiele ${n} Online- oder Draft-${n === 1 ? 'Duell' : 'Duelle'}`,
  online_wins: (n) => `Gewinne ${n} Online- oder Draft-${n === 1 ? 'Duell' : 'Duelle'}`,
  league_wins: (n) => `Gewinne ${n} ${n === 1 ? 'Ranglistenspiel' : 'Ranglistenspiele'}`,
  big_wins: (n) => `Gewinne ${n === 1 ? 'ein Duell' : `${n} Duelle`} mit mindestens ${BIG_WIN_FIELDS} Feldern`,
  runes_used: (n) => `Setze ${n === 1 ? 'eine Rune' : `${n}× eine Rune`} ein`,
  terrain: (n) => `Löse ${n} ${n === 1 ? 'Geländebonus' : 'Geländeboni'} aus`,
  kristall_wins: (n) => `Gewinne ${n === 1 ? 'ein Duell' : `${n} Duelle`} in einer Kristall-Arena`,
  cards: (n) => `Besitze ${n} Karten`,
  effects_distinct: (n) => `Löse ${n} verschiedene Spezialeffekte aus`,
  worlds_complete: (n) => `Hole alle Sterne in ${n === 1 ? 'einer Kampagnen-Welt' : `${n} Kampagnen-Welten`}`,
  raids_defeated: (n) => `Besiege ${n === 1 ? 'einen Weltboss' : `${n} Weltbosse`} gemeinsam mit anderen`,
};

/** Short label for the admin editor. */
export const METRIC_LABEL: Record<QuestMetric, string> = {
  games: 'Duelle gespielt', wins: 'Siege', wins_strong: 'Siege gegen KI Normal/Schwer', captures: 'Eroberte Karten', effects: 'Ausgelöste Effekte',
  missions: 'Kampagnen-Missionen', stars: 'Neue Kampagnen-Sterne', raid_attacks: 'Raid-Angriffe', online_games: 'Online-/Draft-Duelle',
  online_wins: 'Online-/Draft-Siege', league_wins: 'Ranglisten-Siege', big_wins: `Kantersiege (≥ ${BIG_WIN_FIELDS} Felder)`,
  runes_used: 'Runen eingesetzt', terrain: 'Geländeboni ausgelöst', kristall_wins: 'Siege in Kristall-Arenen', cards: 'Karten in der Sammlung (Stand)',
  effects_distinct: 'Verschiedene Effekte (Stand)', worlds_complete: 'Welten mit allen Sternen (Stand)', raids_defeated: 'Besiegte Weltbosse (Stand)',
};

export type Counters = Partial<Record<string, number>>;

/** What one checked result adds to the counters. */
export interface QuestEvent {
  games?: number;
  wins?: number;
  winsStrong?: number;
  captures?: number;
  effects?: Partial<Record<EffectId, number>>;
  missions?: number;
  stars?: number;
  raidAttacks?: number;
  onlineGames?: number;
  onlineWins?: number;
  leagueWins?: number;
  /** Duels won with at least BIG_WIN_FIELDS fields. */
  bigWins?: number;
  runesUsed?: number;
  terrainBonus?: number;
  /** Duels won on the Kristall board shape. */
  kristallWins?: number;
}

export function eventDelta(e: QuestEvent): Counters {
  const out: Counters = {};
  const add = (k: string, n: number | undefined) => {
    if (n && n > 0 && Number.isFinite(n)) out[k] = (out[k] ?? 0) + Math.floor(n);
  };
  add('games', e.games);
  add('wins', e.wins);
  add('wins_strong', e.winsStrong);
  add('captures', e.captures);
  add('missions', e.missions);
  add('stars', e.stars);
  add('raid_attacks', e.raidAttacks);
  add('online_games', e.onlineGames);
  add('online_wins', e.onlineWins);
  add('league_wins', e.leagueWins);
  add('big_wins', e.bigWins);
  add('runes_used', e.runesUsed);
  add('terrain', e.terrainBonus);
  add('kristall_wins', e.kristallWins);
  for (const [id, n] of Object.entries(e.effects ?? {})) {
    if (!EFFECT_IDS.includes(id as EffectId) || !n) continue;
    add('effects', n);
    add(`fx:${id}`, n);
  }
  return out;
}

// ---------- Rewards ----------

export type QuestRewardType = 'coins' | 'stones' | 'card' | 'pack' | 'skin' | 'rune' | 'title';
export const QUEST_REWARD_TYPES: QuestRewardType[] = ['coins', 'stones', 'card', 'pack', 'skin', 'rune', 'title'];
export const QUEST_REWARD_LABEL: Record<QuestRewardType, string> = {
  coins: 'Münzen', stones: 'Runensteine', card: 'Karte', pack: 'Booster', skin: 'Kartenrücken / Läufer', rune: 'Rune', title: 'Titel',
};

export interface QuestReward {
  type: QuestRewardType;
  /** Coins, or number of booster packs. */
  amount?: number;
  cardId?: string;
  packId?: string;
  skinId?: string;
  runeId?: string;
  title?: string;
}

/** Coins instead of a skin or rune the player already owns. */
export const OWNED_REFUND = 200;

export const TITLE_MAX = 24;

export function rewardText(r: QuestReward): string {
  switch (r.type) {
    case 'coins': return `${r.amount ?? 0} Münzen`;
    case 'stones': return `${r.amount ?? 0} Runensteine`;
    case 'card': return r.cardId && isCardId(r.cardId) ? `Karte: ${getCard(r.cardId).name}` : 'Karte';
    case 'pack': {
      const pack = PACKS.find((p) => p.id === r.packId) ?? PACKS[0];
      return `${(r.amount ?? 1) > 1 ? `${r.amount}× ` : ''}${pack.name}`;
    }
    case 'skin': return r.skinId && isSkinId(r.skinId) ? `${getSkin(r.skinId).kind === 'card' ? 'Kartenrücken' : 'Läufer'}: ${getSkin(r.skinId).name}` : 'Kartenrücken';
    case 'rune': return r.runeId ? findRune(r.runeId)?.name ?? 'Rune' : 'Rune';
    case 'title': return `Titel: „${r.title ?? ''}“`;
  }
}

/** Player titles (kept with the quest progress, not in the save). */
export interface Titles {
  owned: string[];
  equipped: string | null;
  /** Chosen avatar (unlocked by collected achievements, see avatars.ts); absent = the first start avatar. */
  avatar?: string | null;
}

export interface QuestGranted extends GrantedReward {
  /** Skins, runes and titles added (names). */
  items: string[];
}

/** Adds the rewards to the save (and titles); skins and runes already owned turn into coins. */
export function grantQuestRewards(save: SaveData, titles: Titles, list: { key: string; reward: QuestReward; source: string }[], rng: Rng):
  { save: SaveData; titles: Titles; granted: QuestGranted[] } {
  let s = save;
  const t: Titles = { ...titles, owned: [...titles.owned], equipped: titles.equipped };
  const granted: QuestGranted[] = [];
  for (const o of list) {
    const r = o.reward;
    if (r.type === 'coins' || r.type === 'stones' || r.type === 'card' || r.type === 'pack') {
      const res = grantRewards(s, [{ key: o.key, source: o.source, reward: { type: r.type, amount: r.amount, cardId: r.cardId, packId: r.packId } }], rng);
      s = res.save;
      granted.push({ ...res.granted[0], items: [] });
      continue;
    }
    const g: QuestGranted = { key: o.key, source: o.source, coins: 0, cards: [], duplicates: [], items: [] };
    const refund = () => {
      g.coins += OWNED_REFUND;
      s = { ...s, coins: s.coins + OWNED_REFUND };
    };
    if (r.type === 'skin') {
      if (r.skinId && isSkinId(r.skinId) && !s.skins.owned.includes(r.skinId)) {
        s = { ...s, skins: { ...s.skins, owned: [...s.skins.owned, r.skinId] } };
        g.items.push(rewardText(r));
      } else refund();
    } else if (r.type === 'rune') {
      if (r.runeId && findRune(r.runeId) && !s.runes.owned.includes(r.runeId)) {
        s = { ...s, runes: { ...s.runes, owned: [...s.runes.owned, r.runeId] } };
        g.items.push(rewardText(r));
      } else refund();
    } else if (r.type === 'title') {
      const title = (r.title ?? '').trim().slice(0, TITLE_MAX);
      if (title && !t.owned.includes(title)) {
        t.owned.push(title);
        g.items.push(rewardText(r));
      }
    }
    granted.push(g);
  }
  return { save: s, titles: t, granted };
}

// ---------- Quests ----------

export type QuestKind = 'daily' | 'weekly' | 'achievement';

export interface QuestDef {
  id: string;
  metric: QuestMetric;
  target: number;
  reward: QuestReward;
  /** Own text; empty = generated from metric and target. */
  text?: string;
  enabled: boolean;
  /** Achievements: group shown as one line with tiers (e.g. "Sieger"). */
  chain?: string;
}

export interface QuestConfig {
  daily: QuestDef[];
  weekly: QuestDef[];
  achievements: QuestDef[];
  /** How many daily / weekly quests are active at the same time. */
  perDay: number;
  perWeek: number;
  dailyBonus: QuestReward;
  weeklyBonus: QuestReward;
}

export const QUEST_ID_RE = /^[a-z0-9_-]{1,32}$/;

const coins = (amount: number): QuestReward => ({ type: 'coins', amount });
const stones = (amount: number): QuestReward => ({ type: 'stones', amount });
const q = (id: string, metric: QuestMetric, target: number, reward: QuestReward, chain?: string): QuestDef => ({ id, metric, target, reward, enabled: true, ...(chain ? { chain } : {}) });

/** The quests the game starts with (the admin can change them: content_docs quests/config). */
export const DEFAULT_QUESTS: QuestConfig = {
  perDay: 3,
  perWeek: 3,
  dailyBonus: coins(50),
  weeklyBonus: { type: 'pack', packId: 'helden', amount: 1 },
  daily: [
    q('d-win2', 'wins', 2, coins(50)),
    q('d-play3', 'games', 3, coins(30)),
    q('d-cap15', 'captures', 15, coins(40)),
    q('d-strong', 'wins_strong', 1, coins(50)),
    q('d-fx3', 'effects', 3, coins(40)),
    q('d-mission', 'missions', 1, coins(40)),
    q('d-raid', 'raid_attacks', 1, coins(50)),
    q('d-rune', 'runes_used', 1, coins(30)),
    q('d-terrain', 'terrain', 3, coins(40)),
  ],
  weekly: [
    q('w-win10', 'wins', 10, coins(250)),
    q('w-online3', 'online_wins', 3, stones(30)),
    q('w-stars5', 'stars', 5, coins(200)),
    q('w-cap100', 'captures', 100, { type: 'pack', packId: 'abenteurer', amount: 1 }),
    q('w-league', 'league_wins', 1, stones(20)),
    q('w-big3', 'big_wins', 3, coins(250)),
    q('w-kristall', 'kristall_wins', 2, coins(200)),
  ],
  achievements: [
    q('a-win1', 'wins', 1, coins(30), 'Sieger'),
    q('a-win10', 'wins', 10, coins(100), 'Sieger'),
    q('a-win50', 'wins', 50, stones(50), 'Sieger'),
    q('a-win200', 'wins', 200, { type: 'pack', packId: 'helden', amount: 1 }, 'Sieger'),
    q('a-win1000', 'wins', 1000, { type: 'skin', skinId: 'card-runengold' }, 'Sieger'),
    q('a-cards50', 'cards', 50, coins(100), 'Sammler'),
    q('a-cards100', 'cards', 100, stones(50), 'Sammler'),
    q('a-cards150', 'cards', 150, { type: 'pack', packId: 'helden', amount: 1 }, 'Sammler'),
    q('a-cards200', 'cards', 200, { type: 'pack', packId: 'helden', amount: 2 }, 'Sammler'),
    q('a-cards250', 'cards', 250, { type: 'title', title: 'Großsammler' }, 'Sammler'),
    q('a-cap100', 'captures', 100, coins(100), 'Eroberer'),
    q('a-cap500', 'captures', 500, coins(200), 'Eroberer'),
    q('a-cap1000', 'captures', 1000, stones(50), 'Eroberer'),
    q('a-cap5000', 'captures', 5000, { type: 'title', title: 'Eroberer' }, 'Eroberer'),
    q('a-fx5', 'effects_distinct', 5, coins(100), 'Effektmeister'),
    q('a-fx10', 'effects_distinct', 10, coins(200), 'Effektmeister'),
    q('a-fx14', 'effects_distinct', 14, { type: 'title', title: 'Effektmeister' }, 'Effektmeister'),
    q('a-fxn50', 'effects', 50, coins(100), 'Effektfeuerwerk'),
    q('a-fxn300', 'effects', 300, stones(40), 'Effektfeuerwerk'),
    q('a-fxn1000', 'effects', 1000, { type: 'pack', packId: 'helden', amount: 1 }, 'Effektfeuerwerk'),
    q('a-games25', 'games', 25, coins(100), 'Stammgast'),
    q('a-games100', 'games', 100, stones(50), 'Stammgast'),
    q('a-games500', 'games', 500, { type: 'pack', packId: 'helden', amount: 1 }, 'Stammgast'),
    q('a-games2000', 'games', 2000, { type: 'title', title: 'Stammgast' }, 'Stammgast'),
    q('a-strong10', 'wins_strong', 10, coins(150), 'Stratege'),
    q('a-strong50', 'wins_strong', 50, { type: 'pack', packId: 'abenteurer', amount: 1 }, 'Stratege'),
    q('a-strong250', 'wins_strong', 250, { type: 'title', title: 'Stratege' }, 'Stratege'),
    q('a-big5', 'big_wins', 5, coins(100), 'Kantersieg'),
    q('a-big25', 'big_wins', 25, coins(250), 'Kantersieg'),
    q('a-big100', 'big_wins', 100, { type: 'title', title: 'Feldherr' }, 'Kantersieg'),
    q('a-rune10', 'runes_used', 10, coins(100), 'Runenkunde'),
    q('a-rune50', 'runes_used', 50, { type: 'pack', packId: 'abenteurer', amount: 1 }, 'Runenkunde'),
    q('a-rune200', 'runes_used', 200, { type: 'title', title: 'Runenmeister' }, 'Runenkunde'),
    q('a-terrain25', 'terrain', 25, coins(100), 'Geländekunde'),
    q('a-terrain150', 'terrain', 150, coins(250), 'Geländekunde'),
    q('a-terrain500', 'terrain', 500, { type: 'title', title: 'Geländekenner' }, 'Geländekunde'),
    q('a-kristall1', 'kristall_wins', 1, coins(50), 'Kristall-Arena'),
    q('a-kristall10', 'kristall_wins', 10, coins(200), 'Kristall-Arena'),
    q('a-kristall50', 'kristall_wins', 50, { type: 'title', title: 'Kristallherz' }, 'Kristall-Arena'),
    q('a-mission10', 'missions', 10, coins(100), 'Abenteurer'),
    q('a-mission50', 'missions', 50, coins(300), 'Abenteurer'),
    q('a-stars15', 'stars', 15, coins(150), 'Sternenjäger'),
    q('a-stars30', 'stars', 30, { type: 'pack', packId: 'abenteurer', amount: 1 }, 'Sternenjäger'),
    q('a-stars60', 'stars', 60, { type: 'title', title: 'Sternenjäger' }, 'Sternenjäger'),
    q('a-world1', 'worlds_complete', 1, { type: 'pack', packId: 'abenteurer', amount: 1 }, 'Kampagne'),
    q('a-world2', 'worlds_complete', 2, { type: 'pack', packId: 'helden', amount: 1 }, 'Kampagne'),
    q('a-raid1', 'raids_defeated', 1, { type: 'title', title: 'Bossbezwinger' }, 'Weltboss'),
    q('a-raid3', 'raids_defeated', 3, { type: 'pack', packId: 'helden', amount: 1 }, 'Weltboss'),
    q('a-raidatk10', 'raid_attacks', 10, coins(150), 'Raid-Veteran'),
    q('a-raidatk50', 'raid_attacks', 50, { type: 'pack', packId: 'helden', amount: 1 }, 'Raid-Veteran'),
    q('a-raidatk200', 'raid_attacks', 200, { type: 'title', title: 'Raid-Veteran' }, 'Raid-Veteran'),
    q('a-league1', 'league_wins', 1, coins(100), 'Rangliste'),
    q('a-league10', 'league_wins', 10, { type: 'pack', packId: 'helden', amount: 1 }, 'Rangliste'),
    q('a-league50', 'league_wins', 50, { type: 'title', title: 'Ranglistenheld' }, 'Rangliste'),
    q('a-online1', 'online_wins', 1, coins(50), 'Duellant'),
    q('a-online10', 'online_wins', 10, coins(300), 'Duellant'),
    q('a-online50', 'online_wins', 50, { type: 'title', title: 'Duellant' }, 'Duellant'),
    q('a-onplay10', 'online_games', 10, coins(100), 'Online-Spieler'),
    q('a-onplay100', 'online_games', 100, { type: 'pack', packId: 'helden', amount: 1 }, 'Online-Spieler'),
  ],
};

function parseReward(raw: unknown): QuestReward | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!QUEST_REWARD_TYPES.includes(r.type as QuestRewardType)) return null;
  const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);
  const out: QuestReward = { type: r.type as QuestRewardType };
  if (out.type === 'coins' || out.type === 'stones') out.amount = int(r.amount, 0, 100000) ?? 0;
  if (out.type === 'pack') {
    out.amount = int(r.amount, 1, 10) ?? 1;
    out.packId = typeof r.packId === 'string' && PACKS.some((p) => p.id === r.packId) ? r.packId : PACKS[0].id;
  }
  if (out.type === 'card') {
    if (typeof r.cardId !== 'string' || !/^[a-z]\d{2,4}$/.test(r.cardId)) return null;
    out.cardId = r.cardId;
  }
  if (out.type === 'skin') {
    if (!isSkinId(r.skinId)) return null;
    out.skinId = r.skinId as string;
  }
  if (out.type === 'rune') {
    if (typeof r.runeId !== 'string' || !/^rn\d{2,4}$/.test(r.runeId)) return null;
    out.runeId = r.runeId;
  }
  if (out.type === 'title') {
    const t = typeof r.title === 'string' ? r.title.trim().slice(0, TITLE_MAX) : '';
    if (!t) return null;
    out.title = t;
  }
  return out;
}

function parseDef(raw: unknown, kind: QuestKind): QuestDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !QUEST_ID_RE.test(r.id)) return null;
  if (!QUEST_METRICS.includes(r.metric as QuestMetric)) return null;
  // Daily and weekly quests only count new results, never the player's state.
  if (kind !== 'achievement' && STATE_METRICS.includes(r.metric as QuestMetric)) return null;
  const target = typeof r.target === 'number' && Number.isFinite(r.target) ? Math.min(1_000_000, Math.max(1, Math.round(r.target))) : 0;
  const reward = parseReward(r.reward);
  if (!target || !reward) return null;
  const text = typeof r.text === 'string' ? r.text.trim().slice(0, 80) : '';
  const chain = typeof r.chain === 'string' ? r.chain.trim().slice(0, 30) : '';
  return { id: r.id, metric: r.metric as QuestMetric, target, reward, enabled: r.enabled !== false, ...(text ? { text } : {}), ...(kind === 'achievement' && chain ? { chain } : {}) };
}

/** Turns the stored config (untrusted) into a valid one; missing parts fall back to the defaults. */
export function parseQuestConfig(raw: unknown): QuestConfig {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_QUESTS);
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, kind: QuestKind, fallback: QuestDef[]) => {
    if (!Array.isArray(v)) return structuredClone(fallback);
    const seen = new Set<string>();
    return v.map((x) => parseDef(x, kind)).filter((d): d is QuestDef => !!d && !seen.has(d.id) && !!seen.add(d.id));
  };
  const count = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(6, Math.max(1, Math.round(v))) : d);
  return {
    perDay: count(r.perDay, DEFAULT_QUESTS.perDay),
    perWeek: count(r.perWeek, DEFAULT_QUESTS.perWeek),
    dailyBonus: parseReward(r.dailyBonus) ?? DEFAULT_QUESTS.dailyBonus,
    weeklyBonus: parseReward(r.weeklyBonus) ?? DEFAULT_QUESTS.weeklyBonus,
    daily: list(r.daily, 'daily', DEFAULT_QUESTS.daily),
    weekly: list(r.weekly, 'weekly', DEFAULT_QUESTS.weekly),
    achievements: list(r.achievements, 'achievement', DEFAULT_QUESTS.achievements),
  };
}

export const QUESTS_COLLECTION = 'quests';
export const QUESTS_DOC = 'config';

export const questText = (d: QuestDef) => d.text || METRIC_TEXT[d.metric](d.target);

/** The quests active in a period: the same for every player, picked from the enabled ones with the period as seed. */
export function activeQuests(list: readonly QuestDef[], count: number, period: string): QuestDef[] {
  const enabled = list.filter((d) => d.enabled);
  return shuffle(deriveRng(`quests:${period}`, 'pick'), enabled).slice(0, count);
}

// ---------- Progress and the board ----------

/** A player's stored progress (one row per player on the server). */
export interface QuestState {
  day: string;
  week: string;
  daily: Counters;
  weekly: Counters;
  total: Counters;
  claimed: string[];
  titles: Titles;
}

export function emptyQuestState(now: Date = new Date()): QuestState {
  return { day: questDay(now), week: questWeek(now), daily: {}, weekly: {}, total: {}, claimed: [], titles: { owned: [], equipped: null } };
}

/** Counters of an old day/week are worth nothing today. */
export function currentState(s: QuestState, now: Date = new Date()): QuestState {
  const day = questDay(now);
  const week = questWeek(now);
  return { ...s, day, week, daily: s.day === day ? s.daily : {}, weekly: s.week === week ? s.weekly : {} };
}

/** Adds a checked result (what the server's quest_add does in the database, for tests and the preview). */
export function addEvent(s: QuestState, e: QuestEvent, now: Date = new Date()): QuestState {
  const cur = currentState(s, now);
  const d = eventDelta(e);
  const plus = (c: Counters) => {
    const out = { ...c };
    for (const [k, v] of Object.entries(d)) out[k] = (out[k] ?? 0) + (v ?? 0);
    return out;
  };
  return { ...cur, daily: plus(cur.daily), weekly: plus(cur.weekly), total: plus(cur.total) };
}

/** What the state metrics read: the player's collection, campaign and raids. */
export interface QuestContext {
  cards: number;
  worldsComplete: number;
  raidsDefeated: number;
}

export function questContext(save: SaveData, content: CampaignContent, progress: CampaignProgress, raidsDefeated: number): QuestContext {
  const worldsComplete = visibleWorlds(content).filter((w) => {
    const ms = worldMissions(content, w.id);
    return ms.length > 0 && ms.every((m) => missionStars(progress, m) >= STARS_PER_MISSION);
  }).length;
  return { cards: ownedActiveIds(save.unlocked).length, worldsComplete, raidsDefeated };
}

function metricValue(metric: QuestMetric, counters: Counters, total: Counters, ctx: QuestContext): number {
  switch (metric) {
    case 'cards': return ctx.cards;
    case 'worlds_complete': return ctx.worldsComplete;
    case 'raids_defeated': return ctx.raidsDefeated;
    case 'effects_distinct': return EFFECT_IDS.filter((id) => (total[`fx:${id}`] ?? 0) > 0).length;
    default: return counters[metric] ?? 0;
  }
}

export interface QuestItem {
  /** Claim key: d:<day>:<id>, w:<week>:<id>, a:<id>, d:<day>:bonus, w:<week>:bonus. */
  key: string;
  kind: QuestKind;
  id: string;
  text: string;
  progress: number;
  target: number;
  reward: QuestReward;
  done: boolean;
  claimed: boolean;
  chain?: string;
}

export interface QuestBoard {
  day: string;
  week: string;
  daily: QuestItem[];
  weekly: QuestItem[];
  dailyBonus: QuestItem;
  weeklyBonus: QuestItem;
  achievements: QuestItem[];
}

export function questBoard(config: QuestConfig, stateRaw: QuestState, ctx: QuestContext, now: Date = new Date()): QuestBoard {
  const s = currentState(stateRaw, now);
  const claimed = new Set(s.claimed);
  const item = (kind: QuestKind, prefix: string, d: QuestDef, counters: Counters): QuestItem => {
    const key = `${prefix}${d.id}`;
    const progress = Math.min(d.target, metricValue(d.metric, counters, s.total, ctx));
    return {
      key, kind, id: d.id, text: questText(d), progress, target: d.target, reward: d.reward, done: progress >= d.target, claimed: claimed.has(key),
      ...(d.chain ? { chain: d.chain } : {}),
    };
  };
  const daily = activeQuests(config.daily, config.perDay, s.day).map((d) => item('daily', `d:${s.day}:`, d, s.daily));
  const weekly = activeQuests(config.weekly, config.perWeek, s.week).map((d) => item('weekly', `w:${s.week}:`, d, s.weekly));
  const bonus = (kind: QuestKind, key: string, list: QuestItem[], reward: QuestReward): QuestItem => {
    const progress = list.filter((i) => i.done).length;
    return { key, kind, id: 'bonus', text: `Alle ${list.length} ${kind === 'daily' ? 'Tagesquests' : 'Wochenquests'} geschafft`, progress, target: list.length, reward, done: list.length > 0 && progress >= list.length, claimed: claimed.has(key) };
  };
  return {
    day: s.day,
    week: s.week,
    daily,
    weekly,
    dailyBonus: bonus('daily', `d:${s.day}:bonus`, daily, config.dailyBonus),
    weeklyBonus: bonus('weekly', `w:${s.week}:bonus`, weekly, config.weeklyBonus),
    achievements: config.achievements.filter((d) => d.enabled).map((d) => item('achievement', 'a:', d, s.total)),
  };
}

export const boardItems = (b: QuestBoard): QuestItem[] => [...b.daily, b.dailyBonus, ...b.weekly, b.weeklyBonus, ...b.achievements];

/** Finished and not yet collected. */
export const claimable = (b: QuestBoard): QuestItem[] => boardItems(b).filter((i) => i.done && !i.claimed);

/**
 * Collects the given rewards (or all that are ready): returns the keys paid, the new save and titles. Keys that are
 * not ready (or already collected) are ignored – the server's quest_claim makes sure each key is paid only once.
 */
export function claimQuests(saveRaw: SaveData, state: QuestState, config: QuestConfig, ctx: QuestContext, keys: readonly string[] | null, seed: string, now: Date = new Date()):
  { keys: string[]; save: SaveData; titles: Titles; granted: QuestGranted[] } | null {
  const board = questBoard(config, state, ctx, now);
  const ready = claimable(board).filter((i) => !keys || keys.includes(i.key));
  if (ready.length === 0) return null;
  const sourceOf = (i: QuestItem) => (i.kind === 'daily' ? 'Tagesquest' : i.kind === 'weekly' ? 'Wochenquest' : `Erfolg${i.chain ? ` ${i.chain}` : ''}`) + ` – ${i.text}`;
  const r = grantQuestRewards(saveRaw, state.titles, ready.map((i) => ({ key: i.key, reward: i.reward, source: sourceOf(i) })), deriveRng(seed, 'quest-rewards'));
  return { keys: ready.map((i) => i.key), save: r.save, titles: r.titles, granted: r.granted };
}

/** Parses a stored progress row (untrusted). */
export function parseQuestState(raw: unknown, now: Date = new Date()): QuestState {
  const base = emptyQuestState(now);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const counters = (v: unknown): Counters => {
    const out: Counters = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    return out;
  };
  const t = (r.titles && typeof r.titles === 'object' ? r.titles : {}) as Record<string, unknown>;
  const owned = Array.isArray(t.owned) ? [...new Set(t.owned.filter((x): x is string => typeof x === 'string' && x.length <= TITLE_MAX))] : [];
  return {
    day: typeof r.day === 'string' ? r.day : base.day,
    week: typeof r.week === 'string' ? r.week : base.week,
    daily: counters(r.daily),
    weekly: counters(r.weekly),
    total: counters(r.total),
    claimed: Array.isArray(r.claimed) ? r.claimed.filter((x): x is string => typeof x === 'string') : [],
    titles: { owned, equipped: typeof t.equipped === 'string' && owned.includes(t.equipped) ? t.equipped : null, ...(isAvatarId(t.avatar) ? { avatar: t.avatar } : {}) },
  };
}

/** Problems of a config for the admin editor (German). */
export function questConfigProblems(c: QuestConfig): string[] {
  const out: string[] = [];
  const enabled = (l: QuestDef[]) => l.filter((d) => d.enabled).length;
  if (enabled(c.daily) < c.perDay) out.push(`Es sind nur ${enabled(c.daily)} Tagesquests aktiv, aber ${c.perDay} pro Tag eingestellt.`);
  if (enabled(c.weekly) < c.perWeek) out.push(`Es sind nur ${enabled(c.weekly)} Wochenquests aktiv, aber ${c.perWeek} pro Woche eingestellt.`);
  const ids = [...c.daily, ...c.weekly, ...c.achievements].map((d) => d.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) out.push(`Doppelte Kennungen: ${[...new Set(dup)].join(', ')}`);
  for (const d of [...c.daily, ...c.weekly, ...c.achievements]) {
    if (d.reward.type === 'card' && (!d.reward.cardId || !isCardId(d.reward.cardId))) out.push(`${questText(d)}: Karte gibt es nicht.`);
    if (d.reward.type === 'rune' && (!d.reward.runeId || !findRune(d.reward.runeId))) out.push(`${questText(d)}: Rune gibt es nicht.`);
  }
  return out;
}
