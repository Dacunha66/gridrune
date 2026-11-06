import { describe, expect, it } from 'vitest';
import { applyMove, boardHoles, createBattle, isGameOver, legalMoves, neighbours, randomRock, toHand, totalMoves } from '../src/game/battle';
import { chooseCpuMove } from '../src/game/ai';
import { ARENAS, BUILTIN_ARENAS, parseArena, rankedProblems } from '../src/game/arenas';
import { createRng } from '../src/game/rng';
import { STARTER_DECK } from '../src/game/cards';

const kristall = BUILTIN_ARENAS.find((a) => a.id === 'a18')!;
const hand = () => toHand(STARTER_DECK.slice(0, 8));

describe('Spielfeld-Form „Kristall“ (4 × 5 ohne Ecken)', () => {
  it('20 Zellen, die 4 Ecken sind kein Feld; mit Fels 15 Züge wie auf dem klassischen Feld', () => {
    expect(kristall.cells).toHaveLength(20);
    expect(boardHoles(20)).toEqual([0, 3, 16, 19]);
    const s = createBattle(hand(), hand(), 'player', [randomRock(createRng(1), kristall.cells)], kristall.cells);
    expect(s.board).toHaveLength(20);
    expect(totalMoves(s)).toBe(15);
    expect(legalMoves(s).some((m) => [0, 3, 16, 19].includes(m.cell))).toBe(false);
    expect(() => applyMove(s, { handIndex: 0, cell: 0 })).toThrow();
  });
  it('Nachbarn: über eine fehlende Ecke gibt es keinen Nachbarn; Reihe 5 ist erreichbar', () => {
    expect(neighbours(1, 20).map((n) => n.cell).sort((a, b) => a - b)).toEqual([2, 5]);
    expect(neighbours(4, 20).map((n) => n.cell).sort((a, b) => a - b)).toEqual([5, 8]);
    expect(neighbours(13, 20).map((n) => n.cell).sort((a, b) => a - b)).toEqual([9, 12, 14, 17]);
    expect(neighbours(17, 20).map((n) => n.cell).sort((a, b) => a - b)).toEqual([13, 18]);
    // classic board unchanged
    expect(neighbours(13).map((n) => n.cell).sort((a, b) => a - b)).toEqual([9, 12, 14]);
  });
  it('der Fels liegt nie auf einer fehlenden Ecke', () => {
    for (let seed = 1; seed < 300; seed++) expect([0, 3, 16, 19]).not.toContain(randomRock(createRng(seed), kristall.cells));
  });
  it('ein ganzes Duell KI gegen KI läuft bis zum Ende', () => {
    const rng = createRng(7);
    let s = createBattle(hand(), hand(), 'player', [randomRock(rng, kristall.cells)], kristall.cells);
    let guard = 0;
    while (!isGameOver(s) && guard++ < 40) s = applyMove(s, chooseCpuMove(s, rng));
    expect(isGameOver(s)).toBe(true);
    expect(s.moveCount).toBe(15);
    expect(s.board.filter((c) => c).length).toBe(15);
  });
  it('Arena-Daten: 16 oder 20 Zellen erlaubt, Ecken ohne Gelände, Spiegelgleichheit geprüft', () => {
    expect(parseArena('a99', { name: 'X', cells: Array(18).fill('normal') })).toBeNull();
    const cells = Array(20).fill('normal');
    cells[0] = 'wald';
    const a = parseArena('a99', { name: 'X', cells, status: 'active' })!;
    expect(a.cells[0]).toBe('normal');
    const sym = Array(20).fill('normal');
    sym[5] = 'eis'; sym[14] = 'eis';
    expect(rankedProblems(sym)).toEqual([]);
    sym[14] = 'normal'; sym[13] = 'eis';
    expect(rankedProblems(sym).join()).toMatch(/spiegelgleich/);
    expect(ARENAS.some((x) => x.id === 'a18')).toBe(true);
  });
});
