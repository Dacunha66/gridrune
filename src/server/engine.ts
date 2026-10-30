// Game rules for the server functions (bundled into supabase/functions/adventure/engine.js with esbuild).
// It loads the same content as the game and uses the same code to check runs and compute rewards.
import { CardRecord, buildCatalog, parseCardRecord } from '../game/catalog';
import { CARDS, DECK_SIZE, setCardCatalog } from '../game/cards';
import { Arena, parseArena, setArenas } from '../game/arenas';
import { RuneDef, RUNES, availableRunes, parseRune, setRunes } from '../game/runes';
import { GameSettings, SETTINGS, parseSettings, released, setGameSettings } from '../game/settings';
import {
  Mission, Opponent, World, mergeContent, parseMission, parseOpponent, parseWorld, setCampaign, CAMPAIGN, visibleWorlds, worldMissions,
} from '../game/campaign';
import { CampaignProgress, missionUnlocked, recordResult, runeUnlocked, sanitizeProgress, worldUnlocked } from '../game/campaignProgress';
import { GrantedReward, owedRewards, payRewards } from '../game/campaignRewards';
import { deriveRng } from '../game/league';
import { PackCard, buyPack, buySkin } from '../game/shop';
import { SaveData, sanitize } from '../game/storage';
import { validPvpHand } from '../game/pvp';
import { AdventureLog, AdventureTicket, MissionLog, MissionTicket, checkAdventure, checkMission, validMissionHand } from '../game/verify';
import { Reward, applyReward, computeReward } from '../game/rewards';
import { Outcome, Side } from '../game/battle';

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
  setArenas(of<Arena>('arenas', parseArena));
  const records = of<CardRecord>('cards', parseCardRecord);
  if (records.length > 0) {
    const catalog = buildCatalog(records, released(SETTINGS.features.abilities, isAdmin));
    setCardCatalog(catalog.active, catalog.known);
  }
}

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
function allowedRune(save: SaveData, progress: CampaignProgress, rune: unknown, mode: 'adventure' | 'campaign' | 'league', isAdmin: boolean): string | null {
  if (typeof rune !== 'string' || !released(SETTINGS.features.runes, isAdmin)) return null;
  const ownedRunes = [...new Set([...save.runes.owned, ...RUNES.filter((r) => runeUnlocked(r, progress, CAMPAIGN)).map((r) => r.id)])];
  return availableRunes(mode, ownedRunes).some((r) => r.id === rune) ? rune : null;
}

/** Checks the deck and the rune a player wants to start a run with; returns the ticket (without id/seed) or why not. */
export function prepareAdventure(saveRaw: unknown, campaignRaw: unknown, deck: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; ticket: Omit<AdventureTicket, 'id' | 'seed'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  if (!validDeck(save, deck)) return { ok: false, error: 'deck' };
  const playerRune = allowedRune(save, sanitizeProgress(campaignRaw), rune, 'adventure', isAdmin);
  return { ok: true, ticket: { deck, owned: [...save.unlocked], playerRune, cpuRune: playerRune ? 'random' : null } };
}

/** Replays the run and the duel; on success returns the reward and the new save. */
export function finishAdventure(ticket: AdventureTicket, log: AdventureLog, saveRaw: unknown):
  { ok: true; outcome: Outcome; score: Record<Side, number>; reward: Reward; save: SaveData } | { ok: false; error: string } {
  const check = checkAdventure(ticket, log);
  if (!check.ok) return check;
  const save = sanitize(saveRaw);
  const reward = computeReward(check.outcome, check.picks, save.unlocked);
  return { ok: true, outcome: check.outcome, score: check.score, reward, save: applyReward(save, check.outcome, reward) };
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
  ({ ok: true; outcome: Outcome; score: Record<Side, number>; met: boolean[]; newStars: number[]; firstWin: boolean } & CampaignPayout) | { ok: false; error: string } {
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
