// Game rules for the server functions (bundled into supabase/functions/adventure/engine.js with esbuild).
// It loads the same content as the game and uses the same code to check runs and compute rewards.
import { CardRecord, buildCatalog, parseCardRecord } from '../game/catalog';
import { CARDS, DECK_SIZE, setCardCatalog } from '../game/cards';
import { Arena, parseArena, setArenas } from '../game/arenas';
import { GameMode, RuneDef, RUNES, availableRunes, parseRune, setRunes } from '../game/runes';
import { GameSettings, SETTINGS, parseSettings, released, setGameSettings } from '../game/settings';
import {
  Mission, Opponent, World, mergeContent, parseMission, parseOpponent, parseWorld, setCampaign, CAMPAIGN, visibleWorlds, worldMissions,
} from '../game/campaign';
import { CampaignProgress, missionUnlocked, recordResult, runeUnlocked, sanitizeProgress, worldUnlocked } from '../game/campaignProgress';
import { GrantedReward, grantRewards, isPayable, owedRewards, payRewards } from '../game/campaignRewards';
import { RaidConfig, raidOwed } from '../game/raid';
import { deriveRng } from '../game/league';
import { PackCard, SHOP_DOC, buyPack, buySkin, parseShopDoc, setPackLooks } from '../game/shop';
import { SaveData, sanitize } from '../game/storage';
import { validPvpHand } from '../game/pvp';
import {
  AdventureLog, AdventureTicket, LeagueLog, LeagueTicket, MissionLog, MissionTicket, checkAdventure, checkLeague, checkMission, leagueCpuRune, validMissionHand,
} from '../game/verify';
import { Reward, applyReward, computeReward, grant, isAiLevel, leagueReward } from '../game/rewards';
import { COLLECTION_LEAGUE_RULES, validateDeck } from '../game/rules';
import { ownedActiveIds } from '../game/cards';
import { Outcome, Side } from '../game/battle';
import { PlayedDuel } from '../game/verify';
import { duelStats } from '../game/campaignGoals';
import { RaidCheck } from '../game/raid';
import {
  QUESTS_COLLECTION, QUESTS_DOC, QuestConfig, QuestEvent, QuestState, Titles, claimQuests, eventDelta, parseQuestConfig, parseQuestState, questBoard,
  questContext, questDay, questWeek, DEFAULT_QUESTS,
} from '../game/quests';
import { EffectId } from '../game/effects';

export interface ContentRow {
  collection: string;
  id: string;
  data: unknown;
}

/** Loads the admin content exactly like the game does for this viewer (players never see drafts). */
export function loadContent(rows: ContentRow[], isAdmin: boolean): void {
  const visible = rows.filter((r) => isAdmin || (r.data as { status?: string } | null)?.status !== 'draft');
  const of = <T>(collection: string, parse: (id: string, raw: unknown) => T | null): T[] =>
    visible.filter((r) => r.collection === collection).flatMap((r) => {
      const x = parse(r.id, r.data);
      return x ? [x] : [];
    });
  const settingsRow = visible.find((r) => r.collection === 'settings' && r.id === 'game');
  const settings: GameSettings = parseSettings(settingsRow?.data);
  setGameSettings(settings);
  setCampaign(mergeContent({
    worlds: of<World>('campaign_worlds', parseWorld),
    missions: of<Mission>('campaign_missions', parseMission),
    opponents: of<Opponent>('campaign_opponents', parseOpponent),
  }));
  setRunes(of<RuneDef>('runes', parseRune));
  // Booster prices set by the admin (settings/shop) – buying costs the same as the shop shows.
  const shopRow = rows.find((r) => r.collection === 'settings' && r.id === SHOP_DOC);
  setPackLooks(shopRow ? parseShopDoc(shopRow.data) : {});
  const questsRow = rows.find((r) => r.collection === QUESTS_COLLECTION && r.id === QUESTS_DOC);
  QUEST_CONFIG = questsRow ? parseQuestConfig(questsRow.data) : structuredClone(DEFAULT_QUESTS);
  setArenas(of<Arena>('arenas', parseArena));
  const records = of<CardRecord>('cards', parseCardRecord);
  if (records.length > 0) {
    const catalog = buildCatalog(records, released(SETTINGS.features.abilities, isAdmin));
    setCardCatalog(catalog.active, catalog.known);
  }
}

// ---------- Erfolge (quests) ----------

let QUEST_CONFIG: QuestConfig = structuredClone(DEFAULT_QUESTS);

/** Captures and effects of the player in replayed duels. */
function duelTally(duels: readonly PlayedDuel[]): { captures: number; effects: Partial<Record<EffectId, number>> } {
  let captures = 0;
  const effects: Partial<Record<EffectId, number>> = {};
  for (const d of duels) {
    const st = duelStats(d.begin, d.moves);
    captures += st.captures;
    for (const [id, n] of Object.entries(st.effects)) effects[id as EffectId] = (effects[id as EffectId] ?? 0) + (n ?? 0);
  }
  return { captures, effects };
}

/** Day and week keys the counters belong to (German time). */
export function questPeriod(now: Date = new Date()): { day: string; week: string } {
  return { day: questDay(now), week: questWeek(now) };
}

/** What a checked result adds to the quest counters (the database adds it atomically: quest_add). */
export function questDelta(e: QuestEvent): Record<string, number> {
  return eventDelta(e) as Record<string, number>;
}

export function raidQuestEvent(check: Extract<RaidCheck, { ok: true }>): QuestEvent {
  return { games: 1, raidAttacks: 1, wins: check.outcome === 'win' ? 1 : 0, ...duelTally([check.duel]) };
}

export function onlineQuestEvent(won: boolean): QuestEvent {
  return { games: 1, onlineGames: 1, wins: won ? 1 : 0, onlineWins: won ? 1 : 0 };
}

/** The player's quest board: what is active, how far, what is ready to collect. */
export function questOverview(saveRaw: unknown, campaignRaw: unknown, stateRaw: unknown, raidsDefeated: number, now: Date = new Date()) {
  const state = parseQuestState(stateRaw, now);
  const ctx = questContext(sanitize(saveRaw), CAMPAIGN, sanitizeProgress(campaignRaw), raidsDefeated);
  return { board: questBoard(QUEST_CONFIG, state, ctx, now), titles: state.titles };
}

/** Collects ready rewards (all, or the given keys): new save and titles; null = nothing to collect. */
export function questClaim(saveRaw: unknown, campaignRaw: unknown, stateRaw: unknown, raidsDefeated: number, keys: unknown, seed: string, now: Date = new Date()) {
  const state: QuestState = parseQuestState(stateRaw, now);
  const ctx = questContext(sanitize(saveRaw), CAMPAIGN, sanitizeProgress(campaignRaw), raidsDefeated);
  const wanted = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : null;
  return claimQuests(sanitize(saveRaw), state, QUEST_CONFIG, ctx, wanted, seed, now);
}

/** Checks a title the player wants to show (must be owned; null = none). */
export function questEquipTitle(stateRaw: unknown, title: unknown): Titles | null {
  const state = parseQuestState(stateRaw);
  if (title === null) return { ...state.titles, equipped: null };
  return typeof title === 'string' && state.titles.owned.includes(title) ? { ...state.titles, equipped: title } : null;
}

export { DEFAULT_QUESTS, parseQuestConfig, questDay, questWeek } from '../game/quests';

export function cleanSave(raw: unknown): SaveData {
  return sanitize(raw);
}

const validDeck = (save: SaveData, deck: unknown): deck is string[] => {
  const active = new Set(CARDS.map((c) => c.id));
  const owned = new Set(save.unlocked);
  return Array.isArray(deck) && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE
    && deck.every((id) => typeof id === 'string' && owned.has(id) && active.has(id));
};

/** The rune the player may take into this mode (null = none / not allowed). */
function allowedRune(save: SaveData, progress: CampaignProgress, rune: unknown, mode: GameMode, isAdmin: boolean): string | null {
  if (typeof rune !== 'string' || !released(SETTINGS.features.runes, isAdmin)) return null;
  const ownedRunes = [...new Set([...save.runes.owned, ...RUNES.filter((r) => runeUnlocked(r, progress, CAMPAIGN)).map((r) => r.id)])];
  return availableRunes(mode, ownedRunes).some((r) => r.id === rune) ? rune : null;
}

/** Checks the deck and the rune a player wants to start a run with; returns the ticket (without id/seed) or why not. */
export function prepareAdventure(saveRaw: unknown, campaignRaw: unknown, deck: unknown, rune: unknown, isAdmin: boolean, level: unknown = 'medium'):
  { ok: true; ticket: Omit<AdventureTicket, 'id' | 'seed'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (!validDeck(save, deck)) return { ok: false, error: 'deck' };
  if (!isAiLevel(level)) return { ok: false, error: 'level' };
  const playerRune = allowedRune(save, sanitizeProgress(campaignRaw), rune, 'adventure', isAdmin);
  return { ok: true, ticket: { deck, owned: [...save.unlocked], playerRune, cpuRune: playerRune ? 'random' : null, level } };
}

/** Replays the run and the duel; on success returns the reward and the new save. */
export function finishAdventure(ticket: AdventureTicket, log: AdventureLog, saveRaw: unknown):
  { ok: true; outcome: Outcome; score: Record<Side, number>; reward: Reward; save: SaveData; quest: QuestEvent } | { ok: false; error: string } {
  const check = checkAdventure(ticket, log);
  if (!check.ok) return check;
  const save = sanitize(saveRaw);
  const level = ticket.level ?? 'medium';
  const reward = computeReward(check.outcome, level);
  const won = check.outcome === 'win';
  const quest: QuestEvent = { games: 1, wins: won ? 1 : 0, winsStrong: won && level !== 'easy' ? 1 : 0, ...duelTally([check.duel]) };
  return { ok: true, outcome: check.outcome, score: check.score, reward, save: applyReward(save, check.outcome, reward), quest };
}

// ---------- Collection League against the computer ----------

/** League deck limits; offline every owned card counts as two copies (the same rule as the game). */
function leagueDeckOk(save: SaveData, deck: unknown): deck is string[] {
  if (!Array.isArray(deck) || !deck.every((id) => typeof id === 'string')) return false;
  const owned = Object.fromEntries(ownedActiveIds(save.unlocked).map((id) => [id, COLLECTION_LEAGUE_RULES.deck.maxCopies]));
  return validateDeck(deck, COLLECTION_LEAGUE_RULES.deck, owned).length === 0 && deck.every((id) => CARDS.some((c) => c.id === id));
}

/** Checks the league deck and the rune; the computer's rune follows from the seed. */
export function prepareLeague(saveRaw: unknown, campaignRaw: unknown, deck: unknown, rune: unknown, isAdmin: boolean, seed: string):
  { ok: true; ticket: Omit<LeagueTicket, 'id'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (!leagueDeckOk(save, deck)) return { ok: false, error: 'deck' };
  const runesOn = released(SETTINGS.features.runes, isAdmin);
  const playerRune = allowedRune(save, sanitizeProgress(campaignRaw), rune, 'league', isAdmin);
  return { ok: true, ticket: { seed, deck: [...deck], playerRune, cpuRune: leagueCpuRune(seed, runesOn) } };
}

/** Replays the match; a won match unlocks the rarest new discovery of the run (else coins). */
export function finishLeague(ticket: LeagueTicket, log: LeagueLog, saveRaw: unknown):
  { ok: true; won: boolean; rounds: { first: Side; winner: Side | 'draw'; score: Record<Side, number> }[]; reward: Reward; save: SaveData; quest: QuestEvent } | { ok: false; error: string } {
  const check = checkLeague(ticket, log);
  if (!check.ok) return check;
  const save = sanitize(saveRaw);
  const won = check.winner === 'player';
  const reward = leagueReward(won, check.picks, save.unlocked);
  const quest: QuestEvent = { games: check.rounds.length, wins: won ? 1 : 0, leagueWins: won ? 1 : 0, ...duelTally(check.duels) };
  return { ok: true, won, rounds: check.rounds, reward, save: grant(save, reward), quest };
}

// ---------- Campaign (phase 4c) ----------

/** Mission and opponent as they were when the ticket was handed out (later edits do not break a running game). */
export interface MissionSnapshot {
  mode: Mission['mode'];
  arenaId: string;
  opponentDeck: string[];
  level: Opponent['level'];
  prefer: Opponent['prefer'];
}

export type StoredMissionTicket = MissionTicket & { snapshot: MissionSnapshot };

function playableMission(progress: CampaignProgress, missionId: unknown): { mission: Mission; opponent: Opponent } | null {
  const mission = CAMPAIGN.missions.find((m) => m.id === missionId);
  if (!mission) return null;
  const world = visibleWorlds(CAMPAIGN).find((w) => w.id === mission.worldId);
  if (!world || !worldMissions(CAMPAIGN, world.id).includes(mission)) return null;
  if (!worldUnlocked(CAMPAIGN, progress, world) || !missionUnlocked(CAMPAIGN, progress, mission)) return null;
  const opponent = CAMPAIGN.opponents.find((o) => o.id === mission.opponentId);
  return opponent ? { mission, opponent } : null;
}

/** Checks a mission start (mission open, deck, hand, rune); returns the ticket without id/seed or why not. */
export function prepareMission(saveRaw: unknown, campaignRaw: unknown, missionId: unknown, deck: unknown, hand: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; ticket: Omit<StoredMissionTicket, 'id' | 'seed'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  const progress = sanitizeProgress(campaignRaw);
  const found = playableMission(progress, missionId);
  if (!found) return { ok: false, error: 'mission' };
  const { mission, opponent } = found;
  if (!validDeck(save, deck)) return { ok: false, error: 'deck' };
  if (mission.mode !== 'runner' && !validMissionHand(mission, deck, hand)) return { ok: false, error: 'hand' };
  const runesOn = released(SETTINGS.features.runes, isAdmin);
  return {
    ok: true,
    ticket: {
      missionId: mission.id, deck, owned: [...save.unlocked], hand: mission.mode === 'runner' ? null : (hand as string[]),
      playerRune: allowedRune(save, progress, rune, 'campaign', isAdmin),
      // Like the game: the opponent brings its rune whenever runes are released.
      cpuRune: runesOn ? opponent.rune ?? null : null,
      snapshot: { mode: mission.mode, arenaId: mission.arenaId, opponentDeck: [...opponent.deck], level: opponent.level, prefer: [...opponent.prefer] },
    },
  };
}

export interface CampaignPayout {
  save: SaveData;
  campaign: CampaignProgress;
  granted: GrantedReward[];
}

/** Replays the mission, stores the result (stars) and pays every reward now owed (including older ones). */
export function finishMission(ticket: StoredMissionTicket, log: MissionLog, saveRaw: unknown, campaignRaw: unknown, now = new Date().toISOString()):
  ({ ok: true; outcome: Outcome; score: Record<Side, number>; met: boolean[]; newStars: number[]; firstWin: boolean; quest: QuestEvent } & CampaignPayout) | { ok: false; error: string } {
  const current = CAMPAIGN.missions.find((m) => m.id === ticket.missionId);
  const opp = current && CAMPAIGN.opponents.find((o) => o.id === current.opponentId);
  if (!current || !opp) return { ok: false, error: 'Mission gibt es nicht mehr' };
  const snap = ticket.snapshot;
  const mission: Mission = { ...current, mode: snap.mode, arenaId: snap.arenaId };
  const opponent: Opponent = { ...opp, deck: snap.opponentDeck, level: snap.level, prefer: snap.prefer };
  const check = checkMission(ticket, log, mission, opponent);
  if (!check.ok) return check;
  const save = sanitize(saveRaw);
  const result = recordResult(sanitizeProgress(campaignRaw), current, check.stats, now);
  const paid = payRewards(save, result.progress, owedRewards(result.progress, CAMPAIGN), deriveRng(ticket.seed, 'rewards'));
  return {
    ok: true, outcome: check.outcome, score: check.score, met: result.met, newStars: result.newStars, firstWin: result.firstWin,
    save: paid.save, campaign: paid.progress, granted: paid.granted,
    quest: {
      games: 1, missions: 1, wins: check.outcome === 'win' ? 1 : 0, stars: result.newStars.length,
      captures: check.stats.captures, effects: check.stats.effects,
    },
  };
}

/** Rewards earned earlier but never paid (e.g. stars from before rewards existed); null = nothing owed. */
export function claimCampaign(saveRaw: unknown, campaignRaw: unknown, seed: string): CampaignPayout | null {
  const progress = sanitizeProgress(campaignRaw);
  const owed = owedRewards(progress, CAMPAIGN);
  if (owed.length === 0) return null;
  const paid = payRewards(sanitize(saveRaw), progress, owed, deriveRng(seed, 'rewards'));
  return { save: paid.save, campaign: paid.progress, granted: paid.granted };
}

// ---------- Shop (phase 4b) ----------

export function buyPackServer(saveRaw: unknown, packId: unknown, seed: string): { ok: true; save: SaveData; cards: PackCard[] } | { ok: false; error: string } {
  const r = buyPack(sanitize(saveRaw), String(packId), deriveRng(seed, 'pack'));
  return r.ok ? { ok: true, save: r.save, cards: r.cards } : { ok: false, error: r.reason };
}

export function buySkinServer(saveRaw: unknown, skinId: unknown): { ok: true; save: SaveData } | { ok: false; error: string } {
  const r = buySkin(sanitize(saveRaw), String(skinId));
  return r.ok ? { ok: true, save: r.save } : { ok: false, error: r.reason };
}

// ---------- Online duels (PvP) ----------

export {
  PVP_ABSENT_SECONDS, PVP_DAILY_PAID_WINS, PVP_MIN_MOVES_FOR_COINS, PVP_TURN_SECONDS, PVP_WIN_COINS, inviteCode, normalizeCode, otherSeat, pvpAction,
  pvpScore, pvpWinner, seatSide, startPvp, timeoutMove, viewState,
} from '../game/pvp';
export { isGameOver } from '../game/battle';

/**
 * Checks the hand (8 different owned cards; not needed for a draft) and the rune (league rules: owned basic runes
 * only) for an online duel.
 */
export function preparePvp(saveRaw: unknown, campaignRaw: unknown, hand: unknown, rune: unknown, isAdmin: boolean, needHand = true):
  { ok: true; hand: string[] | null; rune: string | null } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (needHand && !validPvpHand(hand, save.unlocked)) return { ok: false, error: 'hand' };
  return { ok: true, hand: needHand ? (hand as string[]) : null, rune: allowedRune(save, sanitizeProgress(campaignRaw), rune, 'league', isAdmin) };
}

export {
  DRAFT_DECK_SECONDS, DRAFT_PREPARE_SECONDS, DRAFT_WIN_COINS, completeDraftDeck, draftLayout, draftPool, picksToHand, replayDraftRun, validDraftDeck,
} from '../game/draft';

// ---------- Weltboss-Raid ----------

export {
  RAIDS_COLLECTION, checkRaid, expiredDamage, parseRaid, phaseIndex, raidDay, raidOpen, raidOwed, raidProblems, raidSnapshot,
} from '../game/raid';

/** Rewards the player has earned in a raid and not received yet, paid into the save (packs opened with the seed). */
export function payRaidRewards(saveRaw: unknown, config: RaidConfig, stats: { totalDamage: number; attacks: number }, currentHp: number, claimed: string[], seed: string):
  { keys: string[]; granted: GrantedReward[]; save: SaveData } | null {
  const owed = raidOwed(config, stats, currentHp, claimed).filter((o) => isPayable(o.reward));
  if (owed.length === 0) return null;
  const r = grantRewards(sanitize(saveRaw), owed, deriveRng(seed, 'raid-rewards'));
  return { keys: owed.map((o) => o.key), granted: r.granted, save: r.save };
}

/** Checks the 8 cards (different, owned, active) and the rune (any unlocked rune allowed in raids). */
export function prepareRaid(saveRaw: unknown, campaignRaw: unknown, hand: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; hand: string[]; rune: string | null } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (!validPvpHand(hand, save.unlocked)) return { ok: false, error: 'hand' };
  const progress = sanitizeProgress(campaignRaw);
  const allowed = allowedRune(save, progress, rune, 'raid', isAdmin);
  if (rune !== null && rune !== undefined && allowed === null && released(SETTINGS.features.runes, isAdmin)) return { ok: false, error: 'rune' };
  return { ok: true, hand: hand as string[], rune: allowed };
}
