import { describe, expect, it } from 'vitest';
import { cardRows, totalResult, unusedCards, winRate } from '../src/game/stats';
import { CARDS } from '../src/game/cards';

const [a, b, c, d] = CARDS.map((x) => x.id);

describe('Admin-Statistik', () => {
  it('Siegquote: Unentschieden zählen halb', () => {
    expect(winRate({ games: 4, wins: 2, draws: 2, losses: 0 })).toBe(0.75);
    expect(winRate({ games: 0, wins: 0, draws: 0, losses: 0 })).toBeNull();
  });
  it('Summe über alle Modi', () => {
    expect(totalResult([{ mode: 'Kampagne', level: null, games: 10, wins: 5, draws: 1, losses: 4 }, { mode: 'Raid', level: null, games: 10, wins: 7, draws: 1, losses: 2 }]))
      .toEqual({ games: 20, wins: 12, draws: 2, losses: 6 });
  });
  it('Karten: zu stark / zu schwach erst ab genug Spielen, verglichen mit dem Durchschnitt', () => {
    const base = { games: 100, wins: 60, draws: 0, losses: 40 };
    const rows = cardRows([
      { id: a, games: 20, wins: 16, draws: 0, losses: 4 },
      { id: b, games: 20, wins: 8, draws: 0, losses: 12 },
      { id: c, games: 20, wins: 12, draws: 0, losses: 8 },
      { id: d, games: 3, wins: 3, draws: 0, losses: 0 },
      { id: 'gibts-nicht', games: 50, wins: 50, draws: 0, losses: 0 },
    ], base);
    expect(rows.map((r) => [r.id, r.verdict, r.delta])).toEqual([[a, 'strong', 20], [b, 'weak', -20], [c, 'normal', 0], [d, 'few', 40]]);
    expect(rows[0].name).toBe(CARDS[0].name);
  });
  it('nie gespielte Karten', () => {
    const unused = unusedCards([{ id: a, games: 5, wins: 1, draws: 0, losses: 4 }]);
    expect(unused.some((x) => x.id === a)).toBe(false);
    expect(unused).toHaveLength(CARDS.length - 1);
  });
});
