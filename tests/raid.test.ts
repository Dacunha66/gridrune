import { describe, expect, it } from 'vitest';
import {
  RaidConfig, RaidTicket, aiRaidFight, checkRaid, expiredDamage, parseRaid, phaseIndex, raidAi, raidDamage, raidDay, raidOpen, raidOwed,
  raidProblems, raidRngs, raidSnapshot, raidStart, raidToDoc, simulateRaid,
} from '../src/game/raid';
import { STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyMove, coinToss, cpuChoosesFirst, isGameOver, legalMoves, outcome } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';
import { prepareRaid } from '../src/server/engine';
import { defaultSave } from '../src/game/storage';

const BOSS_A = STARTER_DECK.slice(0, 8);
const BOSS_B = STARTER_DECK.slice(8, 16);
const raw = {
  name: 'Waldwächter-Raid', bossName: 'Waldwächter', maxHp: 20000, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-08T00:00:00Z',
  dailyLimit: 5, phases: [
    { name: 'Erwachen', arenaId: 'a02', deck: BOSS_A, level: 'easy' },
    { name: 'Verderbnis', threshold: 70, arenaId: 'a05', deck: BOSS_B, level: 'medium' },
    { name: 'Letzter Widerstand', threshold: 30, arenaId: 'a06', deck: BOSS_B, level: 'hard', rune: 'rn01' },
  ],
  milestones: [{ damage: 3000, reward: { type: 'pack', amount: 1 } }, { damage: 1000, reward: { type: 'coins', amount: 100 } }],
  globalRewards: [{ percent: 25, reward: { type: 'coins', amount: 50 } }, { percent: 100, reward: { type: 'pack', amount: 1, packId: 'helden' } }],
};
const cfg = (): RaidConfig => parseRaid('raid01', raw)!;

/** Plays a fight like the game: random player moves, boss moves from the seed. */
function play(t: RaidTicket, choices: number) {
  const me = createRng(choices);
  const rngs = raidRngs(t.seed);
  let state = raidStart(t);
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const moves: Action[] = [];
  const ai = raidAi(t.snapshot);
  while (!isGameOver(state)) {
    if (state.turn === 'cpu') {
      const a: Action = chooseCpuRune(state, rngs.ai, ai) ?? chooseCpuMove(state, rngs.ai, ai);
      moves.push(a);
      state = applyAction(state, a);
    } else {
      const l = legalMoves(state);
      const m = l[Math.floor(me() * l.length)];
      moves.push(m);
      state = applyMove(state, m);
    }
  }
  return { log: { duel: { first, moves } }, result: outcome(state) };
}

describe('Raid: Konfiguration', () => {
  it('wird gelesen, sortiert und begrenzt; ohne Probleme veröffentlichbar', () => {
    const c = cfg();
    expect(c.phases.map((p) => p.threshold)).toEqual([100, 70, 30]);
    expect(c.milestones.map((m) => m.damage)).toEqual([1000, 3000]);
    expect(c.globalRewards[1].reward.packId).toBe('helden');
    expect(raidProblems(c)).toEqual([]);
    expect(parseRaid('raid01', raidToDoc(c))).toEqual(c);
  });
  it('meldet ungültige Bossdecks, fehlende Arenen und falsche Schwellen', () => {
    const c = parseRaid('raid02', { ...raw, phases: [{ deck: BOSS_A.slice(0, 7), arenaId: 'a99' }, { threshold: 80, deck: BOSS_B }, { threshold: 90, deck: BOSS_B }] })!;
    const p = raidProblems(c).join(' ');
    expect(p).toMatch(/genau 8/);
    expect(p).toMatch(/Arena a99 fehlt/);
    expect(p).toMatch(/kleiner sein/);
    expect(parseRaid('böse', raw)).toBeNull();
  });
});

describe('Raid: Phasen, Schaden, Status', () => {
  it('Phase nach verbleibenden LP (unter 70 % → Phase 2, unter 30 % → Phase 3)', () => {
    const c = cfg();
    expect(phaseIndex(c, 20000)).toBe(0);
    expect(phaseIndex(c, 14000)).toBe(0);
    expect(phaseIndex(c, 13999)).toBe(1);
    expect(phaseIndex(c, 6000)).toBe(1);
    expect(phaseIndex(c, 5999)).toBe(2);
    expect(phaseIndex(c, 0)).toBe(2);
  });
  it('Schadensformel mit Höchstwert', () => {
    const d = cfg().damage;
    expect(raidDamage(d, 'loss', 3)).toBe(100);
    expect(raidDamage(d, 'draw', 8)).toBe(300);
    expect(raidDamage(d, 'win', 9)).toBe(600);
    expect(raidDamage(d, 'win', 11)).toBe(800);
    expect(raidDamage(d, 'win', 16)).toBe(1200);
    expect(expiredDamage(raidSnapshot(cfg(), 0)!)).toBe(100);
  });
  it('offen, bevorstehend, abgelaufen, besiegt; Tag in UTC', () => {
    const c = cfg();
    expect(raidOpen(c, 100, Date.parse('2026-11-03T12:00:00Z'))).toBe('active');
    expect(raidOpen(c, 100, Date.parse('2026-10-31T23:59:00Z'))).toBe('upcoming');
    expect(raidOpen(c, 100, Date.parse('2026-11-08T00:00:00Z'))).toBe('expired');
    expect(raidOpen(c, 0, Date.parse('2026-11-03T12:00:00Z'))).toBe('defeated');
    expect(raidDay(new Date('2026-11-03T23:59:59+00:00'))).toBe('2026-11-03');
    expect(raidDay(new Date('2026-11-04T00:30:00+01:00'))).toBe('2026-11-03');
  });
});

describe('Raid: Kampf vom Server geprüft', () => {
  const ticket = (seed: string, phase = 0): RaidTicket => ({ id: 'r1', seed, hand: STARTER_DECK.slice(4, 12), playerRune: null, snapshot: raidSnapshot(cfg(), phase)! });

  it('ehrlich gespielte Kämpfe werden bestätigt – Schaden kommt vom Server', () => {
    for (let s = 1; s <= 9; s++) {
      const t = ticket(`raid-${s}`, s % 3);
      const { log, result } = play(t, s);
      const check = checkRaid(t, log);
      expect(check.ok, JSON.stringify(check)).toBe(true);
      if (check.ok) {
        expect(check.outcome).toBe(result);
        expect(check.damage).toBe(raidDamage(t.snapshot.damage, result, check.fields));
      }
    }
  });
  it('manipulierte Kämpfe werden abgelehnt; ein mitgeschickter Schaden zählt nicht', () => {
    const t = ticket('raid-cheat');
    const { log } = play(t, 4);
    const badMove = structuredClone(log);
    const i = badMove.duel.first === 'player' ? 0 : 1;
    (badMove.duel.moves[i] as { cell: number }).cell = 99;
    expect(checkRaid(t, badMove).ok).toBe(false);
    const short = structuredClone(log);
    short.duel.moves.pop();
    expect(checkRaid(t, short).ok).toBe(false);
    const withDamage = { ...structuredClone(log), damage: 999999, outcome: 'win' } as never;
    const honest = checkRaid(t, log);
    const claimed = checkRaid(t, withDamage);
    expect(claimed).toEqual(honest);
  });
  it('Phasenwechsel während des Kampfes ändert den laufenden Kampf nicht (Momentaufnahme)', () => {
    const t = ticket('raid-freeze', 0);
    const { log } = play(t, 2);
    const before = checkRaid(t, log);
    // Admin changes the raid and the boss reaches phase 3 – the stored snapshot stays the same.
    const changed = parseRaid('raid01', { ...raw, version: 2, phases: [{ ...raw.phases[0], deck: BOSS_B, level: 'hard' }, raw.phases[1], raw.phases[2]] })!;
    expect(raidSnapshot(changed, 0)!.deck).toEqual(BOSS_B);
    expect(checkRaid(t, log)).toEqual(before);
  });
});

describe('Raid: Belohnungen', () => {
  it('Meilensteine und Gemeinschaftsbelohnungen – jede nur einmal, nur mit Teilnahme', () => {
    const c = cfg();
    expect(raidOwed(c, { totalDamage: 999, attacks: 1 }, 20000, []).map((o) => o.key)).toEqual([]);
    expect(raidOwed(c, { totalDamage: 3200, attacks: 4 }, 15000, []).map((o) => o.key)).toEqual(['p:1000:coins', 'p:3000:pack', 'g:25:coins']);
    expect(raidOwed(c, { totalDamage: 3200, attacks: 4 }, 15000, ['p:1000:coins', 'g:25:coins']).map((o) => o.key)).toEqual(['p:3000:pack']);
    expect(raidOwed(c, { totalDamage: 0, attacks: 0 }, 0, []).map((o) => o.key)).toEqual([]);
    expect(raidOwed(c, { totalDamage: 100, attacks: 1 }, 0, []).map((o) => o.key)).toEqual(['g:25:coins', 'g:100:pack']);
  });
});

describe('Raid: Start auf dem Server', () => {
  const save = { ...defaultSave(), unlocked: [...STARTING_UNLOCKED] };
  it('gültige Hand und Rune werden angenommen', () => {
    const r = prepareRaid(save, null, STARTER_DECK.slice(0, 8), 'rn01', false);
    expect(r).toEqual({ ok: true, hand: STARTER_DECK.slice(0, 8), rune: 'rn01' });
  });
  it('Karte nicht im Besitz, doppelte Karte, nicht freigespielte Rune werden abgelehnt', () => {
    expect(prepareRaid(save, null, [...STARTER_DECK.slice(0, 7), 'm01'], null, false)).toEqual({ ok: false, error: 'hand' });
    expect(prepareRaid(save, null, [...STARTER_DECK.slice(0, 7), STARTER_DECK[0]], null, false)).toEqual({ ok: false, error: 'hand' });
    expect(prepareRaid(save, null, STARTER_DECK.slice(0, 8), 'rn04', false)).toEqual({ ok: false, error: 'rune' });
  });
});

describe('Raid: Admin-Simulation', () => {
  it('rechnet mit simulierten Teilnehmern, ohne etwas zu speichern – gleiche Zufallszahl, gleiches Ergebnis', () => {
    const c = cfg();
    const a = simulateRaid(c, 10, createRng(7), 4, aiRaidFight);
    const b = simulateRaid(c, 10, createRng(7), 4, aiRaidFight);
    expect(a).toEqual(b);
    expect(a.days).toBe(7);
    expect(a.phaseOdds).toHaveLength(3);
    expect(a.hpByDay.length).toBeGreaterThan(0);
    expect(a.hpByDay.every((hp, i) => hp <= (i === 0 ? c.maxHp : a.hpByDay[i - 1]))).toBe(true);
    // Ten players with five attacks a day bring a 20,000 HP boss down quickly.
    expect(a.defeatedOnDay).not.toBeNull();
    const solo = simulateRaid(c, 1, createRng(7), 4, aiRaidFight);
    expect(solo.hpByDay[0]).toBeLessThan(c.maxHp);
  });
});
