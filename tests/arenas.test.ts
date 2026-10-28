import { afterAll, describe, expect, it } from 'vitest';
import {
  ARENAS, BUILTIN_ARENAS, CLASSIC_ARENA, leagueArena, nextArenaId, parseArena, pickArena, rankedProblems, setArenas,
} from '../src/game/arenas';
import { CELL_COUNT, applyMove, createBattle, isGameOver, randomRock, score, toHand } from '../src/game/battle';
import { chooseCpuMove } from '../src/game/ai';
import { BUILTIN_CARDS, setCardCatalog } from '../src/game/cards';
import { Terrain, effectsForClass } from '../src/game/effects';
import { roundRock } from '../src/game/league';
import { createRng, shuffle } from '../src/game/rng';

const normal = (): Terrain[] => Array(CELL_COUNT).fill('normal');

afterAll(() => {
  setArenas([]);
  setCardCatalog([...BUILTIN_CARDS]);
});

describe('Arena-Vorlagen', () => {
  it('alle eingebauten Arenen sind ranglistentauglich', () => {
    for (const a of BUILTIN_ARENAS) expect(rankedProblems(a.cells), a.name).toEqual([]);
  });

  it('Rangliste: spiegelgleich, jedes Gelände 0× oder ≥2×, höchstens 8 Geländefelder', () => {
    const single = normal();
    single[0] = 'lava';
    expect(rankedProblems(single).join(' ')).toMatch(/nur einmal/);
    expect(rankedProblems(single).join(' ')).toMatch(/spiegelgleich/);
    const asym = normal();
    asym[0] = asym[1] = 'wald';
    expect(rankedProblems(asym)).toHaveLength(1);
    const many = Array<Terrain>(CELL_COUNT).fill('eis');
    many[0] = many[15] = many[5] = many[10] = many[3] = many[12] = 'normal';
    expect(rankedProblems(many).join(' ')).toMatch(/Höchstens 8/);
  });

  it('ungültige Daten aus der Datenbank werden abgelehnt', () => {
    expect(parseArena('a10', { name: 'X', cells: normal() })).toMatchObject({ status: 'draft', ranked: false });
    expect(parseArena('zz', { name: 'X', cells: normal() })).toBeNull();
    expect(parseArena('a10', { name: 'X', cells: normal().slice(1) })).toBeNull();
    expect(parseArena('a10', { name: 'X', cells: [...normal().slice(1), 'sumpf'] })).toBeNull();
    expect(parseArena('a10', { name: 'X', cells: Array(CELL_COUNT).fill('wald') })).toBeNull(); // no cell for the rock
    const bad = normal();
    bad[0] = 'lava';
    expect(parseArena('a10', { name: 'X', cells: bad, ranked: true, status: 'active' })!.ranked).toBe(false);
  });

  it('gespeicherte Arenen ersetzen oder ergänzen die eingebauten', () => {
    setArenas([{ ...CLASSIC_ARENA, name: 'Neu', status: 'disabled' }, { ...CLASSIC_ARENA, id: 'a07', name: 'Sieben' }]);
    expect(ARENAS.find((a) => a.id === 'a01')!.status).toBe('disabled');
    expect(ARENAS.map((a) => a.id)).toContain('a07');
    expect(nextArenaId(ARENAS.map((a) => a.id))).toBe('a08');
    for (let i = 0; i < 50; i++) expect(pickArena(createRng(i)).id).not.toBe('a01');
    setArenas([]);
  });

  it('Liga: Arena aus dem Match-Code – für beide Spieler gleich und nur ranglistentaugliche', () => {
    const list = [...BUILTIN_ARENAS, { ...CLASSIC_ARENA, id: 'a09', ranked: false }];
    expect(leagueArena('abc', 1, list).id).toBe(leagueArena('abc', 1, list).id);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(leagueArena(`s${i}`, 1, list).id);
    expect(seen.has('a09')).toBe(false);
    expect(seen.size).toBe(BUILTIN_ARENAS.length);
    expect(leagueArena('abc', 1, [])).toBe(CLASSIC_ARENA);
  });

  it('der Fels liegt immer auf einem normalen Feld', () => {
    for (const a of BUILTIN_ARENAS) {
      for (let i = 0; i < 200; i++) {
        expect(a.cells[roundRock(`m${i}`, 1, a.cells)]).toBe('normal');
        expect(a.cells[randomRock(createRng(i), a.cells)]).toBe('normal');
      }
    }
  });

  it('Fairness: in jeder Arena gewinnt der Startspieler 38–62 % (Karten mit Effekten)', () => {
    // Every card gets an effect of its class, so terrain and effects really matter.
    const withEffects = BUILTIN_CARDS.map((c, i) => {
      const options = effectsForClass(c.cls);
      return { ...c, effect: options[i % options.length].id };
    });
    setCardCatalog(withEffects);
    const ids = withEffects.map((c) => c.id);
    const N = 500;
    for (const arena of BUILTIN_ARENAS) {
      let firstWins = 0;
      for (let seed = 1; seed <= N; seed++) {
        const rng = createRng(seed * 31);
        const pool = shuffle(rng, ids);
        let s = createBattle(toHand(pool.slice(0, 8)), toHand(pool.slice(8, 16)), 'player', [randomRock(rng, arena.cells)], arena.cells);
        while (!isGameOver(s)) s = applyMove(s, chooseCpuMove(s, rng));
        const sc = score(s);
        if (sc.player > sc.cpu) firstWins++;
      }
      expect(firstWins / N, arena.name).toBeGreaterThan(0.38);
      expect(firstWins / N, arena.name).toBeLessThan(0.62);
    }
  }, 60000);
});
