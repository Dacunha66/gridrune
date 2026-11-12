// Game rules for the server functions (bundled into supabase/functions/adventure/engine.js with esbuild).
// It loads the same content as the game and uses the same code to check runs and compute rewards.
import { CardRecord, buildCatalog, parseCardRecord } from '../game/catalog';
import { CARDS, DECK_SIZE, setCardCatalog } from '../game/cards';
import { Arena, parseArena, setArenas } from '../game/arenas';
import { GameMode, RuneDef, RUNES, availableRunes, parseRune, setRunes } from '../game/runes';
import { GameSettings, SETTINGS, parseSettings, released, setGameSettings } from '../game/settings';
import {
  Mission, Opponent, World, mergeContent, parseMission, parseReward as parseCampaignReward, Reward as CampaignReward, parseOpponent, parseWorld, setCampaign, CAMPAIGN, visibleWorlds, worldMissions,
} from '../game/campaign';
import { CampaignProgress, missionUnlocked, recordResult, runeUnlocked, sanitizeProgress, worldUnlocked } from '../game/campaignProgress';
import { GrantedReward, grantRewards, isPayable, owedRewards, payRewards } from '../game/campaignRewards';
import { RaidConfig, raidOwed } from '../game/raid';
import { deriveRng } from '../game/league';
import { PACKS, PackCard, SHOP_DOC, buyPack, buySkin, parseShopDoc, setPackLooks } from '../game/shop';
import { STONES_DOC, buyCoins, buyOffer, claimFreeCoins, parseStoneDoc, setStoneConfig } from '../game/stones';
import { SaveData, sanitize } from '../game/storage';
import {
  FORGE_DOC, buyFrame, craftCard, fragmentsLeft, craftEdition, forgeFragment, parseForgeDoc, refineEssence, meltCards, setForgeConfig,
} from '../game/forge';
import { validPvpHand } from '../game/pvp';
import {
  AdventureLog, AdventureTicket, LeagueLog, LeagueTicket, MissionLog, MissionTicket, checkAdventure, checkLeague, checkMission, leagueCpuRune,
} from '../game/verify';
import { Reward, applyReward, computeReward, grant, isAiLevel, leagueReward } from '../game/rewards';
import { COLLECTION_LEAGUE_RULES, validateDeck } from '../game/rules';
import { ownedActiveIds } from '../game/cards';
import { KRISTALL_CELLS, Outcome, Side } from '../game/battle';
import { PlayedDuel } from '../game/verify';
import { duelStats } from '../game/campaignGoals';
import { RaidCheck } from '../game/raid';
import {
  QUESTS_COLLECTION, QUESTS_DOC, QuestConfig, QuestEvent, QuestState, Titles, claimQuests, eventDelta, parseQuestConfig, parseQuestState, questBoard,
  questContext, questDay, questWeek, DEFAULT_QUESTS, BIG_WIN_FIELDS,
} from '../game/quests';
import { EffectId } from '../game/effects';
import {
  EDITIONS_COLLECTION, EditionDef, PUZZLES_COLLECTION, PuzzleCounters, PuzzleDef, allPuzzles, earnedClaim, findEdition, grantPuzzleReward, parseEdition,
  parsePuzzle, puzzlePhase, setEditions, setPuzzles, taskViews, puzzleStages, totalPieces, newlyDone, stageDone,
} from '../game/puzzles';

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
  setAvatars(of<AvatarDef>(AVATARS_COLLECTION, parseAvatar));
  // Booster prices set by the admin (settings/shop) – buying costs the same as the shop shows.
  const shopRow = rows.find((r) => r.collection === 'settings' && r.id === SHOP_DOC);
  setPackLooks(shopRow ? parseShopDoc(shopRow.data) : {});
  // Runensteine: free coins, coin bundles and card prices set by the admin (settings/stones).
  const stonesRow = rows.find((r) => r.collection === 'settings' && r.id === STONES_DOC);
  setStoneConfig(parseStoneDoc(stonesRow?.data));
  // Runenschmiede: prices set by the admin (settings/forge).
  const forgeRow = rows.find((r) => r.collection === 'settings' && r.id === FORGE_DOC);
  setForgeConfig(parseForgeDoc(forgeRow?.data));
  const questsRow = rows.find((r) => r.collection === QUESTS_COLLECTION && r.id === QUESTS_DOC);
  QUEST_CONFIG = questsRow ? parseQuestConfig(questsRow.data) : structuredClone(DEFAULT_QUESTS);
  setArenas(of<Arena>('arenas', parseArena));
  // Puzzle-Events: editions and events (drafts only for admins, like everything else).
  setEditions(of<EditionDef>(EDITIONS_COLLECTION, parseEdition));
  setPuzzles(of<PuzzleDef>(PUZZLES_COLLECTION, parsePuzzle));
  const records = of<CardRecord>('cards', parseCardRecord);
  if (records.length > 0) {
    const catalog = buildCatalog(records, released(SETTINGS.features.abilities, isAdmin));
    setCardCatalog(catalog.active, catalog.known);
  }
}

// ---------- Puzzle-Events ----------

/** Events a player sees: running, ended and archived ones (never drafts or events before their start). */
export function visiblePuzzles(now: Date = new Date()): PuzzleDef[] {
  return allPuzzles().filter((p) => ['active', 'ended', 'archived'].includes(puzzlePhase(p, now)));
}

/**
 * Fragments earned and not received yet for one puzzle; with the save holding the reward when the claim completes the
 * puzzle. null = nothing to give.
 */
export function puzzleClaimServer(saveRaw: unknown, puzzleId: string, have: number[], counters: PuzzleCounters | null, claimed: string[], seed: string, now: Date = new Date()):
  { keys: string[]; pieces: number[]; complete: boolean; total: number; save: SaveData | null } | null {
  const p = allPuzzles().find((x) => x.id === puzzleId);
  if (!p) return null;
  const c = earnedClaim(p, have, counters, claimed, seed, now);
  if (!c) return null;
  // A stage completed with this claim: its edition goes into the save in the same step.
  const done = newlyDone(p, have, c.pieces);
  return { ...c, total: totalPieces(p), save: done.length || c.complete ? grantPuzzleReward(sanitize(saveRaw), p, [...have, ...c.pieces]) : null };
}

/** What the player sees of an event (public parts of the definition, own pieces and task progress). */
export function puzzleView(p: PuzzleDef, have: number[], completedAt: string | null, counters: PuzzleCounters | null, claimed: string[], now: Date = new Date()) {
  const e = findEdition(p.reward.editionId);
  return {
    id: p.id, name: p.name, description: p.description, image: p.image, pieces: p.pieces, cols: p.cols, rows: p.rows,
    phase: puzzlePhase(p, now), run: p.run,
    reward: e ? { type: 'edition', editionId: e.id, cardId: e.cardId, name: e.name, image: e.image, frame: e.frame } : null,
    // Every stage (first = the reward above): its card edition, pieces and grid, and whether it is complete.
    stages: puzzleStages(p).map((st) => {
      const se = findEdition(st.editionId);
      return {
        index: st.index, offset: st.offset, pieces: st.pieces, cols: st.cols, rows: st.rows, done: stageDone(st, have),
        reward: se ? { type: 'edition', editionId: se.id, cardId: se.cardId, name: se.name, image: se.image, frame: se.frame } : null,
      };
    }),
    total: totalPieces(p),
    forge: (({ stage, left }) => ({ stage: stage?.index ?? null, left }))(fragmentsLeft(p, have, claimed, now)),
    have, completedAt,
    tasks: taskViews(p, counters, claimed, now).map((v) => ({
      id: v.task.id, title: v.title, description: v.task.description, period: v.task.period, fragments: v.task.fragments,
      value: v.value, target: v.target, done: v.done, claimed: v.claimed, step: v.step, steps: v.steps,
    })),
  };
}

// ---------- Erfolge (quests) ----------

let QUEST_CONFIG: QuestConfig = structuredClone(DEFAULT_QUESTS);

/** Captures and effects of the player in replayed duels. */
function duelTally(duels: readonly PlayedDuel[]): Pick<QuestEvent, 'captures' | 'effects' | 'bigWins' | 'runesUsed' | 'terrainBonus' | 'kristallWins'> {
  let captures = 0;
  let bigWins = 0;
  let runesUsed = 0;
  let terrainBonus = 0;
  let kristallWins = 0;
  const effects: Partial<Record<EffectId, number>> = {};
  for (const d of duels) {
    const st = duelStats(d.begin, d.moves);
    captures += st.captures;
    runesUsed += st.runes ?? 0;
    terrainBonus += st.terrainBonus;
    if (st.outcome === 'win' && st.fields >= BIG_WIN_FIELDS) bigWins++;
    if (st.outcome === 'win' && d.begin.board.length === KRISTALL_CELLS) kristallWins++;
    for (const [id, n] of Object.entries(st.effects)) effects[id as EffectId] = (effects[id as EffectId] ?? 0) + (n ?? 0);
  }
  return { captures, effects, bigWins, runesUsed, terrainBonus, kristallWins };
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
  return { board: questBoard(QUEST_CONFIG, state, ctx, now), titles: state.titles, avatars: unlockedAvatars(state.claimed) };
}

/** Chooses an avatar the player has unlocked (start avatars, or the achievement was collected); null = not allowed. */
export function questEquipAvatar(stateRaw: unknown, avatar: unknown): Titles | null {
  const state = parseQuestState(stateRaw);
  return typeof avatar === 'string' && unlockedAvatars(state.claimed).includes(avatar) ? { ...state.titles, avatar } : null;
}

/** The avatar a player shows (from the stored titles; start avatar if none or not known). */
export function shownAvatar(titlesRaw: unknown): string {
  const t = (titlesRaw && typeof titlesRaw === 'object' ? titlesRaw : {}) as { avatar?: unknown };
  return isAvatarId(t.avatar) ? t.avatar : DEFAULT_AVATAR;
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
import { AVATARS_COLLECTION, AvatarDef, DEFAULT_AVATAR, isAvatarId, parseAvatar, setAvatars, unlockedAvatars } from '../game/avatars';

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
  return { ok: true, ticket: { deck, owned: [...save.unlocked], playerRune, cpuRune: playerRune ? 'random' : null, level, cpuDeck: 'mirror' } };
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

/** Replays the match; a won match unlocks a random card not owned yet (else coins). */
export function finishLeague(ticket: LeagueTicket, log: LeagueLog, saveRaw: unknown):
  { ok: true; won: boolean; rounds: { first: Side; winner: Side | 'draw'; score: Record<Side, number> }[]; reward: Reward; save: SaveData; quest: QuestEvent } | { ok: false; error: string } {
  const check = checkLeague(ticket, log);
  if (!check.ok) return check;
  const save = sanitize(saveRaw);
  const won = check.winner === 'player';
  const reward = leagueReward(won, ticket.seed, save.unlocked);
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
export function prepareMission(saveRaw: unknown, campaignRaw: unknown, missionId: unknown, deck: unknown, _hand: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; ticket: Omit<StoredMissionTicket, 'id' | 'seed'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  const progress = sanitizeProgress(campaignRaw);
  const found = playableMission(progress, missionId);
  if (!found) return { ok: false, error: 'mission' };
  const { mission, opponent } = found;
  if (!validDeck(save, deck)) return { ok: false, error: 'deck' };
  const runesOn = released(SETTINGS.features.runes, isAdmin);
  return {
    ok: true,
    ticket: {
      // No hand choice any more: the mission is played with the (class-filtered) deck.
      missionId: mission.id, deck, owned: [...save.unlocked], hand: null,
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

// ---------- Runensteine (free coins, coins for Runensteine, daily card offers) ----------

export function freeCoinsServer(saveRaw: unknown, now: Date = new Date()): { ok: true; save: SaveData; coins: number } | { ok: false; error: string } {
  const r = claimFreeCoins(sanitize(saveRaw), now);
  return r.ok ? { ok: true, save: r.save, coins: r.coins } : { ok: false, error: r.reason };
}

export function buyCoinsServer(saveRaw: unknown, bundleId: unknown): { ok: true; save: SaveData; coins: number } | { ok: false; error: string } {
  const r = buyCoins(sanitize(saveRaw), bundleId);
  return r.ok ? { ok: true, save: r.save, coins: r.coins } : { ok: false, error: r.reason };
}

/** `player` = the account id (the offers are personal and change every day). */
export function buyOfferServer(saveRaw: unknown, player: string, cardId: unknown, now: Date = new Date()): { ok: true; save: SaveData; cardId: string } | { ok: false; error: string } {
  const r = buyOffer(sanitize(saveRaw), player, cardId, now);
  return r.ok ? { ok: true, save: r.save, cardId: r.cardId } : { ok: false, error: r.reason };
}

// ---------- Runenschmiede ----------

export type ForgeAnswer = { ok: true; save: SaveData; result: Record<string, unknown> } | { ok: false; error: string };

/** One action of the Runenschmiede on the stored save: melt, refine, craft (card), edition, frame. */
export function forgeServer(saveRaw: unknown, action: unknown, body: Record<string, unknown>, now: Date = new Date()): ForgeAnswer {
  const save = sanitize(saveRaw);
  switch (action) {
    case 'forge-melt': {
      const r = meltCards(save, body.cardIds);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, gained: r.gained } } : { ok: false, error: r.reason };
    }
    case 'forge-refine': {
      const r = refineEssence(save, body.rarity, body.times);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, to: r.to, amount: r.amount } } : { ok: false, error: r.reason };
    }
    case 'forge-craft': {
      const r = craftCard(save, body.cardId);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, cardId: r.cardId } } : { ok: false, error: r.reason };
    }
    case 'forge-edition': {
      const r = craftEdition(save, body.editionId, now);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, editionId: r.editionId } } : { ok: false, error: r.reason };
    }
    case 'forge-frame': {
      const r = buyFrame(save, body.frameId);
      return r.ok ? { ok: true, save: r.save, result: { ok: true, frameId: r.frameId } } : { ok: false, error: r.reason };
    }
  }
  return { ok: false, error: 'Unbekannte Aktion.' };
}

/** A missing puzzle fragment for essence (running events, limited per stage). */
export function forgeFragmentServer(saveRaw: unknown, puzzleId: unknown, have: number[], claimed: string[], seed: string, now: Date = new Date()):
  { ok: true; key: string; piece: number; total: number; save: SaveData } | { ok: false; error: string } {
  const p = allPuzzles().find((x) => x.id === puzzleId);
  if (!p) return { ok: false, error: 'Dieses Event gibt es nicht.' };
  const r = forgeFragment(sanitize(saveRaw), p, have, claimed, seed, now);
  return r.ok ? r : { ok: false, error: r.reason };
}

// ---------- Online duels (PvP) ----------

export {
  PVP_ABSENT_SECONDS, PVP_DAILY_PAID_WINS, PVP_MIN_MOVES_FOR_COINS, PVP_TURN_SECONDS, PVP_WIN_COINS, inviteCode, normalizeCode, otherSeat, pvpAction,
  pvpScore, pvpWinner, seatSide, startPvp, timeoutMove, viewState,
} from '../game/pvp';
export { isGameOver } from '../game/battle';

/**
 * Checks the deck (20 different owned cards; not needed for a draft) and the rune (league rules: owned basic runes
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

/** Raid rewards earned and not given yet – they go into the Postfach (collected later). */
export function raidOwedServer(config: RaidConfig, stats: { totalDamage: number; attacks: number }, currentHp: number, claimed: string[]):
  { key: string; title: string; reward: CampaignReward }[] {
  return raidOwed(config, stats, currentHp, claimed).filter((o) => isPayable(o.reward)).map((o) => ({ key: o.key, title: o.source, reward: o.reward }));
}

// ---------- Postfach ----------

/** Collects Postfach items: pays them into the save (packs opened with the seed); the result per item for the reveal. */
export function inboxClaimServer(saveRaw: unknown, items: { id: string; title: string; reward: unknown }[], seed: string):
  { save: SaveData; results: Record<string, GrantedReward> } {
  const owed = items.flatMap((it) => {
    const reward = parseCampaignReward(it.reward);
    return reward && isPayable(reward) ? [{ key: it.id, reward, source: it.title }] : [];
  });
  const r = grantRewards(sanitize(saveRaw), owed, deriveRng(seed, 'inbox'));
  return { save: r.save, results: Object.fromEntries(r.granted.map((g) => [g.key, g])) };
}

/** A gift from the admin: only rewards that exist in the game (coins, Runensteine, a known card, a known pack). */
export function checkGift(raw: unknown): CampaignReward | null {
  const r = parseCampaignReward(raw);
  if (!r || !isPayable(r)) return null;
  if (r.type === 'card' && !(r.cardId && CARDS.some((c) => c.id === r.cardId))) return null;
  if (r.type === 'pack' && r.packId && !PACKS.some((p) => p.id === r.packId)) return null;
  return r;
}

/** Checks the deck (20 different owned active cards) and the rune (any unlocked rune allowed in raids). */
export function prepareRaid(saveRaw: unknown, campaignRaw: unknown, hand: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; hand: string[]; rune: string | null } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (!validPvpHand(hand, save.unlocked)) return { ok: false, error: 'hand' };
  const progress = sanitizeProgress(campaignRaw);
  const allowed = allowedRune(save, progress, rune, 'raid', isAdmin);
  if (rune !== null && rune !== undefined && allowed === null && released(SETTINGS.features.runes, isAdmin)) return { ok: false, error: 'rune' };
  return { ok: true, hand: hand as string[], rune: allowed };
}
