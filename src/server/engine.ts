// Game rules for the server functions (bundled into supabase/functions/adventure/engine.js with esbuild).
// It loads the same content as the game and uses the same code to check runs and compute rewards.
import { CardRecord, buildCatalog, parseCardRecord } from '../game/catalog';
import { CARDS, DECK_SIZE, setCardCatalog } from '../game/cards';
import { Arena, parseArena, setArenas } from '../game/arenas';
import { RuneDef, RUNES, availableRunes, parseRune, setRunes } from '../game/runes';
import { GameSettings, SETTINGS, parseSettings, released, setGameSettings } from '../game/settings';
import { Mission, Opponent, World, mergeContent, parseMission, parseOpponent, parseWorld, setCampaign, CAMPAIGN } from '../game/campaign';
import { runeUnlocked, sanitizeProgress } from '../game/campaignProgress';
import { SaveData, sanitize } from '../game/storage';
import { AdventureLog, AdventureTicket, checkAdventure } from '../game/verify';
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

/** Checks the deck and the rune a player wants to start a run with; returns the ticket (without id/seed) or why not. */
export function prepareAdventure(saveRaw: unknown, campaignRaw: unknown, deck: unknown, rune: unknown, isAdmin: boolean):
  { ok: true; ticket: Omit<AdventureTicket, 'id' | 'seed'> } | { ok: false; error: string } {
  const save = sanitize(saveRaw);
  const active = new Set(CARDS.map((c) => c.id));
  const owned = new Set(save.unlocked);
  if (!Array.isArray(deck) || deck.length !== DECK_SIZE || new Set(deck).size !== DECK_SIZE) return { ok: false, error: 'deck' };
  if (!deck.every((id) => typeof id === 'string' && owned.has(id) && active.has(id))) return { ok: false, error: 'deck' };
  let playerRune: string | null = null;
  if (typeof rune === 'string' && released(SETTINGS.features.runes, isAdmin)) {
    const progress = sanitizeProgress(campaignRaw);
    const ownedRunes = [...new Set([...save.runes.owned, ...RUNES.filter((r) => runeUnlocked(r, progress, CAMPAIGN)).map((r) => r.id)])];
    if (availableRunes('adventure', ownedRunes).some((r) => r.id === rune)) playerRune = rune;
  }
  return { ok: true, ticket: { deck: deck as string[], owned: [...save.unlocked], playerRune, cpuRune: playerRune ? 'random' : null } };
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
