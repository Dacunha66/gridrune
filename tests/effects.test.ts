import { afterEach, describe, expect, it } from 'vitest';
import {
  BattleState, BoardCell, CELL_COUNT, Move, applyMove, cellBreakdown, createBattle, isLegalMove, legalMoves, toHand,
} from '../src/game/battle';
import { chooseCpuMove } from '../src/game/ai';
import { BUILTIN_CARDS, CardDef, getCard, setCardCatalog } from '../src/game/cards';
import { CardClass, EFFECTS, EffectId, Terrain, effectPreview, effectsForClass } from '../src/game/effects';
import { createRng } from '../src/game/rng';

// Test cards with exactly known values. [top, right, bottom, left]
function card(id: string, v: [number, number, number, number], cls: CardClass = 'krieger', effect?: EffectId): CardDef {
  return { id, name: id, rarity: 'common', top: v[0], right: v[1], bottom: v[2], left: v[3], art: '🃏', hue: 0, cls, effect };
}
const TEST_CARDS: CardDef[] = [
  card('t01', [5, 7, 7, 3], 'krieger', 'kampfgeist'),
  card('t02', [4, 4, 4, 4], 'krieger', 'schildwall'),
  card('t03', [9, 10, 2, 5], 'magier', 'arkane_kraft'),
  card('t04', [3, 5, 3, 6], 'magier', 'magische_barriere'),
  card('t05', [4, 4, 4, 4], 'natur', 'wurzelkraft'),
  card('t06', [4, 4, 4, 4], 'natur', 'naturbund'),
  card('t07', [4, 4, 4, 4], 'feuer', 'flammenherz'),
  card('t08', [4, 4, 4, 4], 'frost', 'frostpanzer'),
  card('t09', [6, 3, 5, 3], 'schatten', 'schattenmantel'),
  card('t10', [5, 5, 5, 5], 'schatten', 'schwaechender_blick'),
  card('p05', [5, 5, 5, 5]), // plain cards without effect
  card('p01', [1, 1, 1, 1]),
  card('p07', [7, 7, 7, 7]),
  card('p08', [8, 8, 8, 8]),
  card('n05', [5, 5, 5, 5], 'natur'),
  card('x10', [10, 10, 10, 10]),
];

setCardCatalog([...BUILTIN_CARDS, ...TEST_CARDS]);
afterEach(() => setCardCatalog([...BUILTIN_CARDS, ...TEST_CARDS]));

const FILL = toHand(['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08']);
function at(cardId: string, owner: 'player' | 'cpu', extra: Partial<BoardCell> = {}): BoardCell {
  return { cardId, mod: 0, owner, placedBy: owner, ...extra };
}
/** Player to move with the given hand on a preset board. */
function setup(board: Record<number, BoardCell>, hand: string[], terrain?: Partial<Record<number, Terrain>>, turn: 'player' | 'cpu' = 'player'): BattleState {
  const t: Terrain[] = Array(CELL_COUNT).fill('normal');
  for (const [i, v] of Object.entries(terrain ?? {})) t[Number(i)] = v!;
  const s = createBattle(FILL, FILL, turn, [], t);
  const b: (BoardCell | null)[] = Array(CELL_COUNT).fill(null);
  for (const [i, c] of Object.entries(board)) b[Number(i)] = c;
  return { ...s, board: b, hands: { ...s.hands, [turn]: toHand(hand) } };
}
const values = (s: BattleState, cell: number) => cellBreakdown(s.board, s.terrain, cell).values;

// Cell 5 has neighbours: top 1, right 6, bottom 9, left 4.

describe('Effekt-Vorlagen', () => {
  it('10 Effekte, jeder gehört zu genau einer der 6 Klassen', () => {
    expect(Object.keys(EFFECTS)).toHaveLength(10);
    const total = (['krieger', 'magier', 'natur', 'feuer', 'frost', 'schatten'] as CardClass[]).reduce((n, c) => n + effectsForClass(c).length, 0);
    expect(total).toBe(10);
  });
});

describe('Kampfgeist', () => {
  it('höchster Wert +1, bei Gleichstand Reihenfolge oben, rechts, unten, links', () => {
    const s = applyMove(setup({}, ['t01']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([5, 8, 7, 3]);
  });
  it('wirkt vor dem Vergleich: rechts 7+1=8 schlägt 7', () => {
    const s = applyMove(setup({ 6: at('p07', 'cpu') }, ['t01']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(s.lastClashes[0]).toMatchObject({ attack: 8, defense: 7, captured: true });
  });
  it('Grundwerte bleiben unverändert', () => {
    applyMove(setup({}, ['t01']), { handIndex: 0, cell: 5 });
    expect(getCard('t01').right).toBe(7);
  });
});

describe('Schildwall', () => {
  it('allein kein Bonus', () => {
    const s = applyMove(setup({}, ['t02']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([4, 4, 4, 4]);
  });
  it('mit eigener Nachbarkarte: +1 auf alle Seiten, die nicht zu einer eigenen Karte zeigen', () => {
    const s = applyMove(setup({ 4: at('p01', 'player') }, ['t02']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([5, 5, 5, 4]);
  });
  it('Besitzwechsel wirkt sofort: wird der Nachbar erobert, fällt der Bonus weg', () => {
    let s = applyMove(setup({ 4: at('p01', 'player') }, ['t02']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([5, 5, 5, 4]);
    s = { ...s, hands: { ...s.hands, cpu: toHand(['p05']) } };
    s = applyMove(s, { handIndex: 0, cell: 0 }); // cpu 5 below beats p01 top 1
    expect(s.board[4]!.owner).toBe('cpu');
    expect(values(s, 5)).toEqual([4, 4, 4, 4]);
  });
  it('keine rückwirkende Eroberung, wenn der Bonus später entsteht', () => {
    // Schildwall (4) next to an enemy 4: tie, no capture. A later own card raises it to 5 – the enemy stays.
    let s = applyMove(setup({ 6: at('p05', 'cpu') }, ['t02']), { handIndex: 0, cell: 5 });
    const enemyOwner = s.board[6]!.owner;
    s = { ...s, turn: 'player', hands: { ...s.hands, player: toHand(['p01']) } };
    s = applyMove(s, { handIndex: 0, cell: 4 });
    expect(values(s, 5)[1]).toBe(5);
    expect(s.board[6]!.owner).toBe(enemyOwner);
  });
});

describe('Arkane Kraft', () => {
  it('+1 auf alle vier Werte, nie über 10', () => {
    const s = applyMove(setup({}, ['t03']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([10, 10, 3, 6]);
  });
});

describe('Magische Barriere', () => {
  it('alle niedrigsten Werte +1 und ein Schild', () => {
    const s = applyMove(setup({}, ['t04']), { handIndex: 0, cell: 5 });
    expect(values(s, 5)).toEqual([4, 5, 4, 6]);
    expect(s.board[5]!.barrier).toBe(true);
  });
  it('Schild blockt den nächsten Schwächenden Blick, danach wirkt der nächste', () => {
    let s = setup({ 5: at('t04', 'cpu', { barrier: true }) }, ['t10', 't10']);
    s = applyMove(s, { handIndex: 0, cell: 6 }); // 5 vs. 5: no capture
    expect(s.board[5]!.owner).toBe('cpu');
    expect(s.board[5]!.barrier).toBe(false);
    expect(values(s, 5)).toEqual([3, 5, 3, 6]);
    expect(s.lastEvents[0].kind).toBe('shield');
    s = { ...s, turn: 'player' };
    s = applyMove(s, { handIndex: 0, cell: 4 }); // 5 vs. 6−1: no capture
    expect(values(s, 5)).toEqual([2, 4, 2, 5]);
  });
});

describe('Gelände-Effekte', () => {
  // Every terrain effect belongs to the class whose element is that terrain: there only the element +1 counts (never more).
  it('Wurzelkraft: auf Wald insgesamt nur +1 (Element), sonst nichts', () => {
    expect(values(applyMove(setup({}, ['t05'], { 5: 'wald' }), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 5]);
    expect(values(applyMove(setup({}, ['t05'], { 5: 'lava' }), { handIndex: 0, cell: 5 }), 5)).toEqual([4, 4, 4, 4]);
  });
  it('Flammenherz: auf Lava insgesamt nur +1 (Element)', () => {
    expect(values(applyMove(setup({}, ['t07'], { 5: 'lava' }), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 5]);
  });
  it('Frostpanzer: auf Eis insgesamt nur +1 (Element)', () => {
    expect(values(applyMove(setup({}, ['t08'], { 5: 'eis' }), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 5]);
  });
  it('Schattenmantel: auf Schatten insgesamt nur +1 (Element)', () => {
    expect(values(applyMove(setup({}, ['t09'], { 5: 'schatten' }), { handIndex: 0, cell: 5 }), 5)).toEqual([7, 4, 6, 4]);
  });
  it('Gelände ohne passenden Effekt ändert nichts', () => {
    expect(values(applyMove(setup({}, ['p05'], { 5: 'wald' }), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 5]);
  });
  it('Gelände-Bonus zählt bei der Verteidigung', () => {
    // Enemy Flammenherz on lava defends with 4+1=5 at the top (element only): our 5 from below does not capture (tie).
    const s = applyMove(setup({ 5: at('t07', 'cpu') }, ['p05'], { 5: 'lava' }), { handIndex: 0, cell: 1 });
    expect(s.board[5]!.owner).toBe('cpu');
  });
});

describe('Naturbund', () => {
  it('nur mit eigener Naturkarte daneben', () => {
    expect(values(applyMove(setup({ 4: at('p05', 'player') }, ['t06']), { handIndex: 0, cell: 5 }), 5)).toEqual([4, 4, 4, 4]);
    expect(values(applyMove(setup({ 4: at('n05', 'player') }, ['t06']), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 4]);
    expect(values(applyMove(setup({ 4: at('n05', 'cpu') }, ['t06']), { handIndex: 0, cell: 5 }), 5)).toEqual([4, 4, 4, 4]);
  });
});

describe('Schwächender Blick', () => {
  it('Ziel verliert −1 auf alle Werte vor dem Vergleich', () => {
    // Our 5 vs. enemy 5: normally a tie, after −1 it is 5 > 4.
    const s = applyMove(setup({ 6: at('p05', 'cpu') }, ['t10']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(values(s, 6)).toEqual([4, 4, 4, 4]);
  });
  it('bei mehreren Gegnern muss ein gültiges Ziel gewählt werden', () => {
    const s = setup({ 6: at('p05', 'cpu'), 4: at('p05', 'cpu'), 1: at('p05', 'player'), 0: at('p05', 'cpu') }, ['t10']);
    expect(isLegalMove(s, { handIndex: 0, cell: 5 })).toBe(false);
    expect(isLegalMove(s, { handIndex: 0, cell: 5, target: 1 })).toBe(false); // own card
    expect(isLegalMove(s, { handIndex: 0, cell: 5, target: 0 })).toBe(false); // not adjacent
    expect(isLegalMove(s, { handIndex: 0, cell: 5, target: 4 })).toBe(true);
    const at5 = legalMoves(s).filter((m) => m.cell === 5).map((m) => m.target).sort();
    expect(at5).toEqual([4, 6]);
    const next = applyMove(s, { handIndex: 0, cell: 5, target: 4 });
    expect(next.board[4]!.owner).toBe('player');
    expect(next.board[6]!.owner).toBe('cpu');
  });
  it('ohne Gegner in der Nähe: kein Ziel, kein Effekt', () => {
    const s = setup({}, ['t10']);
    expect(isLegalMove(s, { handIndex: 0, cell: 5, target: 6 })).toBe(false);
    expect(applyMove(s, { handIndex: 0, cell: 5 }).lastEvents).toEqual([]);
  });
  it('Werte fallen nie unter 1', () => {
    const s = applyMove(setup({ 6: at('p01', 'cpu') }, ['t10']), { handIndex: 0, cell: 5 });
    expect(values(s, 6)).toEqual([1, 1, 1, 1]);
  });
});

describe('Allgemeine Regeln', () => {
  it('Beim-Ausspielen-Effekte wirken genau einmal', () => {
    let s = applyMove(setup({}, ['t01', 'p01']), { handIndex: 0, cell: 5 });
    s = { ...s, turn: 'player' };
    s = applyMove(s, { handIndex: 0, cell: 4 });
    expect(s.board[5]!.changes).toHaveLength(1);
    expect(values(s, 5)).toEqual([5, 8, 7, 3]);
  });
  it('Stolperstein und Effekte zusammen, im Bereich 1–10', () => {
    const s = createBattle([{ cardId: 'x10', mod: -1 }, ...FILL.slice(1)], FILL);
    const next = applyMove(s, { handIndex: 0, cell: 5 });
    expect(values(next, 5)).toEqual([9, 9, 9, 9]);
    expect(cellBreakdown(next.board, next.terrain, 5).parts[0]).toMatchObject({ source: 'Stolperstein', kind: 'stone' });
  });
  it('Effekte gelten nur im laufenden Duell: ein neues Duell beginnt ohne Änderungen', () => {
    const fresh = createBattle(toHand(['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08']), FILL);
    expect(fresh.board.every((c) => c === null)).toBe(true);
    expect(fresh.hands.player.every((c) => !('changes' in c))).toBe(true);
  });
  it('gleiche Züge ergeben immer das gleiche Ergebnis (prüfbar auf dem Server)', () => {
    function play(seed: number): string {
      const rng = createRng(seed);
      const hand = toHand(['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't10']);
      const terrain: Terrain[] = Array(CELL_COUNT).fill('normal');
      terrain[0] = terrain[15] = 'wald';
      terrain[5] = terrain[10] = 'lava';
      let s = createBattle(hand, toHand(['t08', 't09', 't10', 'p05', 'p07', 'p08', 'p01', 'n05']), 'player', [3], terrain);
      const moves: Move[] = [];
      while (legalMoves(s).length) {
        const m = chooseCpuMove(s, rng);
        moves.push(m);
        s = applyMove(s, m);
      }
      return JSON.stringify({ moves, board: s.board });
    }
    expect(play(7)).toBe(play(7));
  });
  it('Computer wählt bei Schwächendem Blick immer ein gültiges Ziel', () => {
    const rng = createRng(3);
    for (let g = 0; g < 30; g++) {
      let s = createBattle(toHand(['p05', 'p07', 'p08', 'p01', 'n05', 't02', 't04', 't01']), toHand(['t10', 't09', 't03', 't06', 'p05', 'p07', 'p08', 'x10']), g % 2 ? 'cpu' : 'player', [g % 16]);
      while (legalMoves(s).length) {
        const m = chooseCpuMove(s, rng);
        expect(isLegalMove(s, m)).toBe(true);
        s = applyMove(s, m);
      }
    }
  });
});

describe('Vorschau im Admin-Editor', () => {
  it('stimmt mit dem Duell überein', () => {
    const terrainFor: Partial<Record<EffectId, Terrain>> = { wurzelkraft: 'wald', flammenherz: 'lava', frostpanzer: 'eis', schattenmantel: 'schatten' };
    for (const c of TEST_CARDS.filter((x) => x.effect)) {
      const e = c.effect!;
      const friend: Record<number, BoardCell> = e === 'naturbund' ? { 4: at('n05', 'player') } : e === 'schildwall' ? { 4: at('p05', 'player') } : {};
      const s = applyMove(setup(friend, [c.id], terrainFor[e] ? { 5: terrainFor[e] } : {}), { handIndex: 0, cell: 5 });
      expect(effectPreview([c.top, c.right, c.bottom, c.left], e).values, e).toEqual(values(s, 5));
    }
  });
});

describe('Element: Klasse auf ihrem Gelände', () => {
  const cls = (id: string) => getCard(id).cls;
  it('Natur auf Wald, Feuer auf Lava, Frost auf Eis, Schatten auf Schatten: +1 auf alle Werte', () => {
    const pairs: [CardClass, Terrain][] = [['natur', 'wald'], ['feuer', 'lava'], ['frost', 'eis'], ['schatten', 'schatten']];
    for (const [c, t] of pairs) {
      const card = BUILTIN_CARDS.find((x) => x.cls === c && !x.effect)!;
      const base = [card.top, card.right, card.bottom, card.left].map((v) => Math.min(10, v + 1));
      expect(values(applyMove(setup({}, [card.id], { 5: t }), { handIndex: 0, cell: 5 }), 5), `${c} auf ${t}`).toEqual(base);
      // Not on another terrain.
      const other: Terrain = t === 'wald' ? 'lava' : 'wald';
      expect(values(applyMove(setup({}, [card.id], { 5: other }), { handIndex: 0, cell: 5 }), 5)).toEqual([card.top, card.right, card.bottom, card.left]);
    }
  });
  it('Magier auf dem Runenfeld, Krieger auf dem Schlachtfeld: +1 auf alle Werte', () => {
    for (const [c, t] of [['magier', 'runen'], ['krieger', 'schlacht']] as [CardClass, Terrain][]) {
      const card = BUILTIN_CARDS.find((x) => x.cls === c && !x.effect)!;
      const base = [card.top, card.right, card.bottom, card.left];
      expect(values(applyMove(setup({}, [card.id], { 5: t }), { handIndex: 0, cell: 5 }), 5), `${c} auf ${t}`).toEqual(base.map((v) => Math.min(10, v + 1)));
      const other: Terrain = t === 'runen' ? 'schlacht' : 'runen';
      expect(values(applyMove(setup({}, [card.id], { 5: other }), { handIndex: 0, cell: 5 }), 5)).toEqual(base);
    }
    expect(cls('c03')).toBe('krieger');
  });
  it('Krieger bekommen nur auf dem Schlachtfeld einen Bonus', () => {
    // p05 is a plain Krieger test card.
    expect(values(applyMove(setup({}, ['p05'], { 5: 'schlacht' }), { handIndex: 0, cell: 5 }), 5)).toEqual([6, 6, 6, 6]);
    for (const t of ['wald', 'lava', 'eis', 'schatten', 'runen'] as Terrain[]) {
      expect(values(applyMove(setup({}, ['p05'], { 5: t }), { handIndex: 0, cell: 5 }), 5)).toEqual([5, 5, 5, 5]);
    }
  });
  it('wirkt auch bei der Verteidigung und erscheint in der Aufschlüsselung', () => {
    // Enemy Moosling (Natur, links 6) on Wald defends with 7: a 7 does not capture it, on a normal field it would.
    const att = 'p07';
    const s = applyMove(setup({ 5: at('c01', 'cpu') }, [att], { 5: 'wald' }), { handIndex: 0, cell: 4 });
    expect(s.board[5]!.owner).toBe('cpu');
    const n = applyMove(setup({ 5: at('c01', 'cpu') }, [att]), { handIndex: 0, cell: 4 });
    expect(n.board[5]!.owner).toBe('player');
    const s2 = applyMove(setup({}, ['c01'], { 5: 'wald' }), { handIndex: 0, cell: 5 });
    expect(cellBreakdown(s2.board, s2.terrain, 5).parts.map((p) => p.kind)).toContain('element');
  });
});
