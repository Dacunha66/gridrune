// Schwierigkeit „Albtraum“: the admin's settings (settings document "nightmare"). The computer thinks like "Schwer";
// what makes it harder is set here: its cards can be up to 2 rarities above the player's (deckBoost), and every one
// of its cards can get +1 or +2 on all four values (valueBonus, shown on the cards). Measured with the "Schwer" AI on
// the player's side (BALANCING.md): Schwer 50 % – Albtraum 1/0 about 15–18 %, 0/+1 about 13 %, 1/+1 and 2/0 under 5 %.
// A checked game keeps the values it started with (in the ticket), so the server replays exactly what was played.
import type { Outcome } from './battle';

export const NIGHTMARE_DOC = 'nightmare';

export interface NightmareConfig {
  /** The computer's cards: this many rarities above the player's (0 = same as Schwer). */
  deckBoost: number;
  /** Added to all four values of each of the computer's cards (0–2). */
  valueBonus: number;
  coins: Record<Outcome, number>;
}

export const DEFAULT_NIGHTMARE: NightmareConfig = { deckBoost: 1, valueBonus: 0, coins: { win: 250, draw: 100, loss: 40 } };

const int = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);

export function parseNightmare(raw: unknown): NightmareConfig {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const c = r.coins && typeof r.coins === 'object' ? r.coins as Record<string, unknown> : {};
  const d = DEFAULT_NIGHTMARE;
  return {
    deckBoost: int(r.deckBoost, 0, 2, d.deckBoost),
    valueBonus: int(r.valueBonus, 0, 2, d.valueBonus),
    coins: { win: int(c.win, 0, 10_000, d.coins.win), draw: int(c.draw, 0, 10_000, d.coins.draw), loss: int(c.loss, 0, 10_000, d.coins.loss) },
  };
}

let CONFIG: NightmareConfig = DEFAULT_NIGHTMARE;
export const nightmareConfig = () => CONFIG;
export function setNightmareConfig(c: NightmareConfig): void {
  CONFIG = c;
}

/** What a checked game takes along: the computer's deck strength (the coins are paid with the values at the end). */
export interface NightmareTicket {
  deckBoost: number;
  valueBonus: number;
}
export const nightmareTicket = (c: NightmareConfig = CONFIG): NightmareTicket => ({ deckBoost: c.deckBoost, valueBonus: c.valueBonus });
/** Values of a ticket, checked again (missing in a ticket = the defaults). */
export function ticketNightmare(raw: unknown): NightmareTicket {
  const c = parseNightmare(raw);
  return { deckBoost: c.deckBoost, valueBonus: c.valueBonus };
}

export const BOOST_LABEL: Record<number, string> = { 0: 'gleich stark wie das Deck des Spielers', 1: '1 Seltenheit stärker', 2: '2 Seltenheiten stärker' };
export const BONUS_LABEL: Record<number, string> = { 0: 'kein Bonus', 1: '+1 auf alle Werte', 2: '+2 auf alle Werte' };
