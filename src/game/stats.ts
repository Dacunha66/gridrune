// Admin-Statistik: what the server function "stats" sends (sums only, no single players) and how the page reads it.
// Card results count every checked game in which the card was in the player's hand (or deck): a card that is in
// many more won games than the average card is a hint that it may be too strong – a hint, not a proof.
import { webBackend } from './cardStore';
import { CARDS, Rarity } from './cards';

export interface StatsDay { day: string; active: number; new: number; games: number }
export interface StatsResult { games: number; wins: number; draws: number; losses: number }
export interface StatsMode extends StatsResult { mode: string; level: string | null }
export interface StatsCard extends StatsResult { id: string }

export interface AdminStats {
  days: number;
  today: string;
  players: { total: number; today: number; week: number; month: number; period: number };
  daily: StatsDay[];
  modes: StatsMode[];
  cards: StatsCard[];
  games: number;
  economy: {
    players: number;
    coins: number;
    stones: number;
    coinsMedian: number;
    coinsMax: number;
    stonesMedian: number;
    /** Players with < 500, 500–1999, 2000–4999, ≥ 5000 coins. */
    buckets: number[];
    history: { day: string; players: number; coins: number; stones: number }[];
  };
}

export async function fetchStats(days: number): Promise<AdminStats | 'forbidden' | null> {
  const sb = (await webBackend())?.supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('stats', { body: { days } });
  if (error) {
    const res = (error as { context?: Response }).context;
    return res?.status === 403 ? 'forbidden' : null;
  }
  const d = data as { ok?: boolean; stats?: AdminStats } | null;
  return d?.ok && d.stats ? d.stats : null;
}

/** Share of wins (draws count half), 0–1; null without games. */
export const winRate = (r: StatsResult): number | null => (r.games > 0 ? (r.wins + r.draws / 2) / r.games : null);

/** All games together (the base the cards are compared with). */
export function totalResult(modes: readonly StatsMode[]): StatsResult {
  return modes.reduce((t, m) => ({ games: t.games + m.games, wins: t.wins + m.wins, draws: t.draws + m.draws, losses: t.losses + m.losses }), { games: 0, wins: 0, draws: 0, losses: 0 });
}

export type CardVerdict = 'strong' | 'weak' | 'normal' | 'few';

export interface CardRow extends StatsResult {
  id: string;
  name: string;
  rarity: Rarity;
  rate: number;
  /** Difference to the average of all games, in percentage points. */
  delta: number;
  verdict: CardVerdict;
}

/** Fewer games than this: too few to say anything. */
export const MIN_CARD_GAMES = 10;
/** This many percentage points above / below the average: shown as possibly too strong / too weak. */
export const CARD_DELTA = 10;

/** Card rows with names, win rate and a cautious verdict; unknown cards (deleted meanwhile) are left out. */
export function cardRows(cards: readonly StatsCard[], base: StatsResult): CardRow[] {
  const avg = winRate(base) ?? 0;
  return cards.flatMap((c) => {
    const def = CARDS.find((x) => x.id === c.id);
    if (!def || c.games <= 0) return [];
    const rate = winRate(c) ?? 0;
    const delta = Math.round((rate - avg) * 1000) / 10;
    const verdict: CardVerdict = c.games < MIN_CARD_GAMES ? 'few' : delta >= CARD_DELTA ? 'strong' : delta <= -CARD_DELTA ? 'weak' : 'normal';
    return [{ ...c, name: def.name, rarity: def.rarity, rate, delta, verdict }];
  });
}

/** Cards that exist but were in no game of the period (never chosen – maybe unattractive or rarely owned). */
export function unusedCards(cards: readonly StatsCard[]): { id: string; name: string; rarity: Rarity }[] {
  const used = new Set(cards.filter((c) => c.games > 0).map((c) => c.id));
  return CARDS.filter((c) => !used.has(c.id)).map((c) => ({ id: c.id, name: c.name, rarity: c.rarity }));
}

export const LEVEL_LABEL: Record<string, string> = { easy: 'Leicht', medium: 'Normal', hard: 'Schwer' };
