import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER, SAFE_USES, TOP_STEP, WINS_PER_STEP, freshLadder, ladderLevel, ladderResult, leagueOf, parseLadderConfig, parseLadderState,
  rollSeason, safeLeft, seasonEndsIn, seasonOf, stepName,
} from '../src/game/ladder';

const S = '2026-11';
const play = (state = freshLadder(S), results: ('win' | 'loss' | 'draw')[]) => results.reduce((s, r) => ladderResult(s, r).state, state);
const wins = (n: number) => Array<'win'>(n).fill('win');

describe('Ranglisten-Ligen', () => {
  it('names the steps', () => {
    expect(stepName(0)).toBe('Bronze I');
    expect(stepName(4)).toBe('Silber II');
    expect(stepName(TOP_STEP)).toBe('Runenmeister III');
  });

  it('5 wins go one step up, a loss takes one point', () => {
    let s = play(undefined, wins(4));
    expect(s).toMatchObject({ step: 0, points: 4 });
    const up = ladderResult(s, 'win');
    expect(up.move).toBe('up');
    expect(up.state).toMatchObject({ step: 1, points: 0 });
    s = play(up.state, ['win', 'win', 'loss']);
    expect(s).toMatchObject({ step: 1, points: 1 });
  });

  it('a loss at 0 points goes one step down (with 4 points)', () => {
    const s = play(undefined, [...wins(5), 'loss']);
    expect(s).toMatchObject({ step: 0, points: 4 });
  });

  it('nothing below Bronze I, draws change nothing', () => {
    expect(play(undefined, ['loss', 'loss'])).toMatchObject({ step: 0, points: 0 });
    const d = ladderResult(freshLadder(S), 'draw');
    expect(d.move).toBe('none');
    expect(d.state.games).toBe(1);
  });

  it('the first step of a league is a safepoint – 3 times, then it is used up', () => {
    let s = play(undefined, wins(15)); // Silber I
    expect(stepName(s.step)).toBe('Silber I');
    for (let i = 0; i < SAFE_USES; i++) {
      const r = ladderResult(s, 'loss');
      expect(r.move).toBe('safe');
      s = r.state;
    }
    expect(safeLeft(s)).toBe(0);
    const r = ladderResult(s, 'loss');
    expect(r.move).toBe('down');
    expect(stepName(r.state.step)).toBe('Bronze III');
  });

  it('safepoints count per league', () => {
    let s = play(undefined, wins(15));
    s = play(s, ['loss']);
    expect(s.safeUsed[1]).toBe(1);
    s = play(s, wins(15)); // Gold I
    expect(safeLeft(s)).toBe(SAFE_USES);
  });

  it('pays a promotion reward once per league and season', () => {
    let s = play(undefined, wins(14));
    const r = ladderResult(s, 'win');
    expect(r.promoted).toBe(1);
    expect(r.gifts.map((g) => g.reward)).toEqual(DEFAULT_LADDER.promotion[1]);
    expect(r.gifts[0].key).toBe(`promo:${S}:1:0`);
    // Down and up again: no second reward.
    s = play(r.state, ['loss', 'loss', 'loss', 'loss']); // 3 safepoints, then Bronze III with 4 points
    expect(stepName(s.step)).toBe('Bronze III');
    const again = ladderResult(s, 'win');
    expect(again.move).toBe('up');
    expect(again.promoted).toBeNull();
    expect(again.gifts).toEqual([]);
  });

  it('the top step keeps collecting up to 5 points', () => {
    let s = freshLadder(S, TOP_STEP);
    s = play(s, wins(7));
    expect(s).toMatchObject({ step: TOP_STEP, points: WINS_PER_STEP });
    expect(ladderResult(s, 'loss').state.points).toBe(WINS_PER_STEP - 1);
  });

  it('the computer gets stronger with the league', () => {
    expect(ladderLevel(0)).toBe('easy');
    expect(ladderLevel(3)).toBe('medium');
    expect(ladderLevel(6)).toBe('hard');
    expect(ladderLevel(9)).toBe('nightmare');
  });

  it('a new season pays the best league and starts one league lower', () => {
    let s = play(undefined, wins(35)); // Gold I
    s = play(s, ['loss', 'loss', 'loss', 'loss']); // safepoints, then down
    s = { ...s };
    const r = rollSeason({ ...s, step: 7 }, new Date('2026-12-01T12:00:00Z'));
    expect(r.ended).toEqual({ season: S, league: 2 });
    expect(r.gifts.map((g) => g.reward)).toEqual(DEFAULT_LADDER.season[2]);
    expect(r.state).toMatchObject({ season: '2026-12', step: 3, points: 0, safeUsed: [0, 0, 0, 0, 0, 0] });
    expect(r.state.promoted).toEqual([0, 1]);
    expect(rollSeason(r.state, new Date('2026-12-20T12:00:00Z')).ended).toBeNull();
    // Bronze stays Bronze.
    expect(rollSeason(freshLadder(S, 2), new Date('2027-01-05T00:00:00Z')).state.step).toBe(0);
  });

  it('seasons follow the Berlin month', () => {
    expect(seasonOf(new Date('2026-11-30T22:59:00Z'))).toBe('2026-11');
    expect(seasonOf(new Date('2026-11-30T23:01:00Z'))).toBe('2026-12');
    expect(seasonEndsIn(new Date('2026-11-30T22:00:00Z'))).toBe(3600_000);
    expect(seasonEndsIn(new Date('2026-11-13T12:00:00Z'))).toBeGreaterThan(17 * 24 * 3600_000);
  });

  it('reads stored state and the admin config safely', () => {
    expect(parseLadderState(null, S)).toEqual(freshLadder(S));
    const s = parseLadderState({ season: S, step: 99, points: 9, safeUsed: [7], best: 0, promoted: ['x'] }, S);
    expect(s.step).toBe(TOP_STEP);
    expect(s.points).toBe(WINS_PER_STEP);
    expect(s.safeUsed[0]).toBe(SAFE_USES);
    expect(s.promoted).toEqual([0, 1, 2, 3, 4, 5]);
    expect(leagueOf(s.best)).toBe(5);
    const c = parseLadderConfig({ levels: ['hard', 'bogus'], promotion: [[], [{ type: 'coins', amount: 5 }, { type: 'title', label: 'x' }]] });
    expect(c.levels.slice(0, 2)).toEqual(['hard', 'medium']);
    expect(c.promotion[1]).toEqual([{ type: 'coins', amount: 5 }]);
    expect(c.season).toEqual(DEFAULT_LADDER.season);
  });
});
