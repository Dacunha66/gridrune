import { afterEach, describe, expect, it } from 'vitest';
import {
  BattleState, BoardCell, CELL_COUNT, Move, applyMove, cellBreakdown, createBattle, isLegalMove, legalMoves, rotateValues, toHand,
} from '../src/game/battle';
import { chooseCpuMove } from '../src/game/ai';
import { BUILTIN_CARDS, CardDef, getCard, setCardCatalog } from '../src/game/cards';
import { CardClass, EFFECTS, EffectId, Terrain, effectPreview, effectsForClass } from '../src/game/effects';
import { createRng } from '../src/game/rng';
import { SETTINGS } from '../src/game/settings';
import { activations } from '../src/game/activations';

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
  card('w01', [9, 1, 2, 3], 'frost', 'wirbelwind'),
  card('k01', [6, 6, 6, 6], 'feuer', 'kettenuebernahme'),
  card('k02', [6, 6, 6, 6], 'feuer'),
  card('l66', [1, 6, 6, 1], 'krieger'), // weak on top/left, strong on right/bottom: chains run right and down
  card('d05', [5, 5, 5, 5], 'krieger', 'dominanz'),
  card('s05', [5, 5, 5, 5], 'frost', 'standhaft'),
  card('kd5', [5, 5, 5, 5], 'feuer', 'kettenuebernahme'),
  card('p04', [4, 4, 4, 4]),
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
  it('14 Fähigkeiten: 10 gehören zu genau einer Klasse, Wirbelwind, Kettenübernahme, Dominanz und Standhaft zu allen', () => {
    expect(Object.keys(EFFECTS)).toHaveLength(14);
    const classes = ['krieger', 'magier', 'natur', 'feuer', 'frost', 'schatten'] as CardClass[];
    const total = classes.reduce((n, c) => n + effectsForClass(c).filter((e) => e.cls !== null).length, 0);
    expect(total).toBe(10);
    for (const c of classes) expect(effectsForClass(c).map((e) => e.id)).toEqual(expect.arrayContaining(['wirbelwind', 'kettenuebernahme', 'dominanz', 'standhaft']));
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

describe('Flammenherz und Frostpanzer', () => {
  it('Flammenherz greift mit +1 an: 4+1 schlägt 4', () => {
    const s = applyMove(setup({ 6: at('p04', 'cpu') }, ['t07']), { handIndex: 0, cell: 5 });
    expect(s.lastClashes[0]).toMatchObject({ attack: 5, defense: 4, captured: true });
    expect(s.lastEvents.some((e) => e.effect === 'flammenherz' && e.by === 'player')).toBe(true);
  });
  it('Flammenherz verteidigt mit dem normalen Wert', () => {
    const s = applyMove(setup({ 6: at('t07', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s.lastClashes[0]).toMatchObject({ attack: 5, defense: 4, captured: true });
  });
  it('Frostpanzer verteidigt mit +1: 5 gegen 4+1 erobert nicht', () => {
    const s = applyMove(setup({ 6: at('t08', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s.lastClashes[0]).toMatchObject({ attack: 5, defense: 5, captured: false });
    expect(s.lastEvents.some((e) => e.effect === 'frostpanzer' && e.by === 'cpu')).toBe(true);
  });
  it('Frostpanzer greift mit dem normalen Wert an', () => {
    const s = applyMove(setup({ 6: at('p04', 'cpu') }, ['t08']), { handIndex: 0, cell: 5 });
    expect(s.lastClashes[0]).toMatchObject({ attack: 4, defense: 4, captured: false });
  });
  it('Flammenherz gegen Frostpanzer: die +1 heben sich auf; nie über 10', () => {
    const s = applyMove(setup({ 6: at('t08', 'cpu') }, ['t07']), { handIndex: 0, cell: 5 });
    expect(s.lastClashes[0]).toMatchObject({ attack: 5, defense: 5, captured: false });
    const t = applyMove(setup({ 6: at('x10', 'cpu') }, ['t07']), { handIndex: 0, cell: 5 });
    expect(t.lastClashes).toHaveLength(1);
    expect(t.lastClashes[0].attack).toBeLessThanOrEqual(10);
  });
  it('die Kartenwerte selbst ändern sich nicht', () => {
    expect(values(applyMove(setup({}, ['t07']), { handIndex: 0, cell: 5 }), 5)).toEqual([4, 4, 4, 4]);
    expect(values(applyMove(setup({}, ['t08']), { handIndex: 0, cell: 5 }), 5)).toEqual([4, 4, 4, 4]);
  });
});

describe('Schattenmantel', () => {
  it('wer die Karte erobert, verliert −1 auf alle Werte', () => {
    // t09 [6,3,5,3] at 6: its left side 3 faces our card at 5.
    const s = applyMove(setup({ 6: at('t09', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(values(s, 5)).toEqual([4, 4, 4, 4]);
    expect(s.lastEvents.some((e) => e.effect === 'schattenmantel' && e.by === 'cpu' && e.cell === 5)).toBe(true);
  });
  it('ohne Eroberung passiert nichts', () => {
    const s = applyMove(setup({ 6: at('t09', 'cpu') }, ['p01']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('cpu');
    expect(values(s, 5)).toEqual([1, 1, 1, 1]);
  });
  it('die Magische Barriere blockt den Fluch', () => {
    // t04 [3,5,3,6] with barrier: right 5 (lowest 3s +1 → 4) beats the left 3 of t09.
    const s = applyMove(setup({ 6: at('t09', 'cpu') }, ['t04']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(s.board[5]!.barrier).toBe(false);
    expect(values(s, 5)).toEqual([4, 5, 4, 6]);
  });
  it('trifft in der Kettenübernahme die Karte, die erobert hat', () => {
    // k01 at 0 captures l66 at 1; l66 (right 6) captures t09 at 2 (left 3) → the l66 at 1 is cursed.
    const s = applyMove(setup({ 1: at('l66', 'cpu'), 2: at('t09', 'cpu') }, ['k01']), { handIndex: 0, cell: 0 });
    expect(s.board[2]!.owner).toBe('player');
    expect(values(s, 1)).toEqual([1, 5, 5, 1]);
    expect(values(s, 0)).toEqual([6, 6, 6, 6]);
  });
});

describe('Wurzelkraft', () => {
  const ownMove = (s: BattleState, cell: number, card = 'p01') => applyMove({ ...s, turn: 'player', hands: { ...s.hands, player: toHand([card]) } }, { handIndex: 0, cell });
  it('beim Legen +1 auf den niedrigsten Wert (wirkt schon im Vergleich), nach dem nächsten eigenen Zug noch einmal', () => {
    const s0 = applyMove(setup({ 1: at('p04', 'cpu') }, ['t05']), { handIndex: 0, cell: 5 });
    expect(values(s0, 5)).toEqual([5, 4, 4, 4]);
    expect(s0.board[1]!.owner).toBe('player');
    expect(s0.lastEvents.some((e) => e.effect === 'wurzelkraft' && e.by === 'player' && e.cell === 5)).toBe(true);
    const s1 = ownMove(s0, 12);
    expect(values(s1, 5)).toEqual([5, 5, 4, 4]);
  });
  it('höchstens zweimal', () => {
    let s = applyMove(setup({}, ['t05']), { handIndex: 0, cell: 5 });
    for (const cell of [12, 13, 14, 15]) s = ownMove(s, cell);
    expect(values(s, 5)).toEqual([5, 5, 4, 4]);
  });
  it('wächst nicht in den Zügen des Gegners', () => {
    const s0 = applyMove(setup({}, ['t05']), { handIndex: 0, cell: 5 });
    const s1 = applyMove({ ...s0, turn: 'cpu', hands: { ...s0.hands, cpu: toHand(['p01']) } }, { handIndex: 0, cell: 15 });
    expect(values(s1, 5)).toEqual([5, 4, 4, 4]);
  });
  it('eine eroberte Wurzelkraft-Karte wächst nicht mehr – auch nicht für ihren neuen Besitzer', () => {
    const s0 = applyMove(setup({ 6: at('t05', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s0.board[6]!.owner).toBe('player');
    expect(values(s0, 6)).toEqual([4, 4, 4, 4]);
    const s1 = applyMove({ ...s0, turn: 'cpu', hands: { ...s0.hands, cpu: toHand(['p01']) } }, { handIndex: 0, cell: 15 });
    expect(values(s1, 6)).toEqual([4, 4, 4, 4]);
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
    const terrainFor: Partial<Record<EffectId, Terrain>> = {};
    for (const c of TEST_CARDS.filter((x) => x.effect)) {
      const e = c.effect!;
      const friend: Record<number, BoardCell> = e === 'naturbund' ? { 4: at('n05', 'player') } : e === 'schildwall' ? { 4: at('p05', 'player') } : {};
      let s = applyMove(setup(friend, [c.id], terrainFor[e] ? { 5: terrainFor[e] } : {}), { handIndex: 0, cell: 5 });
      // Wurzelkraft: the preview shows the card after two more own moves.
      if (e === 'wurzelkraft') {
        for (const cell of [12, 13]) s = applyMove({ ...s, turn: 'player', hands: { ...s.hands, player: toHand(['p01']) } }, { handIndex: 0, cell });
      }
      // Flammenherz / Frostpanzer: the preview shows the value in a comparison.
      const v = values(s, 5);
      const expected = e === 'flammenherz' || e === 'frostpanzer' ? v.map((x) => Math.min(10, x + 1)) : v;
      expect(effectPreview([c.top, c.right, c.bottom, c.left], e).values, e).toEqual(expected);
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

describe('Wirbelwind (Ausrichtung beim Legen)', () => {
  it('dreht die Werte im Uhrzeigersinn, das gedruckte Original bleibt', () => {
    expect(rotateValues([9, 1, 2, 3], 1)).toEqual([3, 9, 1, 2]);
    expect(rotateValues([9, 1, 2, 3], 2)).toEqual([2, 3, 9, 1]);
    expect(rotateValues([9, 1, 2, 3], 4)).toEqual([9, 1, 2, 3]);
    const s = applyMove(setup({}, ['w01']), { handIndex: 0, cell: 5, rot: 1 });
    expect(values(s, 5)).toEqual([3, 9, 1, 2]);
    expect(s.board[5]!.rot).toBe(1);
    expect(getCard('w01').top).toBe(9);
  });
  it('kämpft mit der gewählten Ausrichtung: die 9 zeigt nach rechts und erobert', () => {
    const s = applyMove(setup({ 6: at('p05', 'cpu') }, ['w01']), { handIndex: 0, cell: 5, rot: 1 });
    expect(s.board[6]!.owner).toBe('player');
    const n = applyMove(setup({ 6: at('p05', 'cpu') }, ['w01']), { handIndex: 0, cell: 5 });
    expect(n.board[6]!.owner).toBe('cpu');
  });
  it('nur Wirbelwind-Karten dürfen gedreht werden; Ausrichtungen 0–3', () => {
    const s = setup({}, ['p05', 'w01']);
    expect(isLegalMove(s, { handIndex: 0, cell: 5, rot: 1 })).toBe(false);
    expect(isLegalMove(s, { handIndex: 1, cell: 5, rot: 3 })).toBe(true);
    expect(isLegalMove(s, { handIndex: 1, cell: 5, rot: 4 })).toBe(false);
    expect(legalMoves(s).filter((m) => m.cell === 5)).toHaveLength(1 + 4);
  });
  it('Drehung verschiebt Boni mit ihrer Seite und verdoppelt nichts (Kampfgeist + Gelände)', () => {
    // Kampfgeist +1 on the highest (local top 5 → right after a turn would need Wirbelwind; use breakdown order instead).
    const st = applyMove(setup({}, ['w01'], { 5: 'eis' }), { handIndex: 0, cell: 5, rot: 2 });
    const b = cellBreakdown(st.board, st.terrain, 5);
    expect(b.base).toEqual([2, 3, 9, 1]);
    expect(b.values).toEqual([3, 4, 10, 2]); // Frost on Eis: element +1 on every side, once
    expect(b.rot).toBe(2);
  });
});

describe('Kettenübernahme', () => {
  // Row 0: [k01 placed at 0] [enemy l66 at 1] [enemy l66 at 2] [enemy l66 at 3]
  const line = () => setup({ 1: at('l66', 'cpu'), 2: at('l66', 'cpu'), 3: at('l66', 'cpu') }, ['k01', 'k02']);
  it('Standard: eine weitere Stufe', () => {
    const s = applyMove(line(), { handIndex: 0, cell: 0 });
    expect([1, 2, 3].map((c) => s.board[c]!.owner)).toEqual(['player', 'player', 'cpu']);
    expect(s.lastChain).toEqual([{ from: 1, cell: 2, level: 1 }]);
    expect(s.lastFlips).toEqual([1, 2]);
    expect(s.lastEvents.some((e) => /Kette ×1/.test(e.text))).toBe(true);
  });
  it('eroberte Karten greifen weiter an – Welle für Welle (zwei Stufen eingestellt)', () => {
    const before = SETTINGS.chainDepth;
    try {
      SETTINGS.chainDepth = 2;
      const s = applyMove(line(), { handIndex: 0, cell: 0 });
      expect([1, 2, 3].map((c) => s.board[c]!.owner)).toEqual(['player', 'player', 'player']);
      expect(s.lastChain).toEqual([{ from: 1, cell: 2, level: 1 }, { from: 2, cell: 3, level: 2 }]);
      expect(s.lastFlips).toEqual([1, 2, 3]);
    } finally {
      SETTINGS.chainDepth = before;
    }
  });
  it('in der Kette greift die eroberte Karte mit −1 an – sichtbar in lastChainClashes', () => {
    // l66 at 1 attacks p05 at 2 with right 6 − 1 = 5 against left 5: tie, no capture.
    const s = applyMove(setup({ 1: at('l66', 'cpu'), 2: at('p05', 'cpu') }, ['k01']), { handIndex: 0, cell: 0 });
    expect(s.board[1]!.owner).toBe('player');
    expect(s.board[2]!.owner).toBe('cpu');
    expect(s.lastChain).toEqual([]);
    expect(s.lastChainClashes).toEqual([{ from: 1, cell: 2, level: 1, base: 6, attack: 5, defense: 5, captured: false }]);
    // against 4 it captures: 5 > 4
    const t = applyMove(setup({ 1: at('l66', 'cpu'), 2: at('p04', 'cpu') }, ['k01']), { handIndex: 0, cell: 0 });
    expect(t.board[2]!.owner).toBe('player');
    expect(t.lastChainClashes![0]).toMatchObject({ base: 6, attack: 5, defense: 4, captured: true });
  });
  it('ohne die Fähigkeit keine Kette (normale Übernahme)', () => {
    const s = applyMove(line(), { handIndex: 1, cell: 0 });
    expect([1, 2, 3].map((c) => s.board[c]!.owner)).toEqual(['player', 'cpu', 'cpu']);
    expect(s.lastChain).toEqual([]);
  });
  it('höchstens so viele Stufen wie eingestellt (Standard 1, 0 = unbegrenzt)', () => {
    // 5 in a snake: 0 → 1 → 2 → 3 → 7 → 11
    const snake = () => setup({ 1: at('l66', 'cpu'), 2: at('l66', 'cpu'), 3: at('l66', 'cpu'), 7: at('l66', 'cpu'), 11: at('l66', 'cpu') }, ['k01']);
    const one = applyMove(snake(), { handIndex: 0, cell: 0 });
    expect(one.lastChain.map((c) => c.cell)).toEqual([2]);
    expect(one.board[3]!.owner).toBe('cpu');
    const before = SETTINGS.chainDepth;
    try {
      SETTINGS.chainDepth = 0;
      const all = applyMove(snake(), { handIndex: 0, cell: 0 });
      expect(all.lastChain.map((c) => c.cell)).toEqual([2, 3, 7, 11]);
      SETTINGS.chainDepth = 2;
      expect(applyMove(snake(), { handIndex: 0, cell: 0 }).lastChain.map((c) => c.cell)).toEqual([2, 3]);
    } finally {
      SETTINGS.chainDepth = before;
    }
  });
  it('keine Endlosschleife und jede Karte greift höchstens einmal an (volles Feld)', () => {
    const board: Record<number, BoardCell> = {};
    for (let i = 1; i < 16; i++) board[i] = at('l66', 'cpu');
    const before = SETTINGS.chainDepth;
    try {
      SETTINGS.chainDepth = 0;
      const s = applyMove(setup(board, ['k01']), { handIndex: 0, cell: 0 });
      const cells = s.lastChain.map((c) => c.cell);
      expect(new Set(cells).size).toBe(cells.length);
      expect(s.board.every((c) => !c || c.owner === 'player')).toBe(true);
      const froms = s.lastChain.map((c) => c.from);
      // An attacker appears for several captures of one wave, but never in two different waves.
      for (const f of new Set(froms)) expect(new Set(s.lastChain.filter((c) => c.from === f).map((c) => c.level)).size).toBe(1);
    } finally {
      SETTINGS.chainDepth = before;
    }
  });
  it('gleiches Ergebnis bei gleichen Zügen (feste Reihenfolge)', () => {
    const a = applyMove(line(), { handIndex: 0, cell: 0 });
    const b = applyMove(line(), { handIndex: 0, cell: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Dominanz und Standhaft', () => {
  it('normal: Gleichstand übernimmt nicht', () => {
    const s = applyMove(setup({ 6: at('p05', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('cpu');
  });
  it('Dominanz gewinnt bei Gleichstand, verliert aber weiter gegen höhere Werte', () => {
    const s = applyMove(setup({ 6: at('p05', 'cpu'), 4: at('p07', 'cpu') }, ['d05']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(s.board[4]!.owner).toBe('cpu');
  });
  it('Standhaft: bei Gleichstand nie übernommen – auch nicht durch Dominanz; höhere Werte übernehmen weiter', () => {
    const a = applyMove(setup({ 6: at('s05', 'cpu') }, ['d05']), { handIndex: 0, cell: 5 });
    expect(a.board[6]!.owner).toBe('cpu');
    const b = applyMove(setup({ 6: at('s05', 'cpu') }, ['p07']), { handIndex: 0, cell: 5 });
    expect(b.board[6]!.owner).toBe('player');
  });
  it('Dominanz verteidigt nicht: eine Karte mit Dominanz wird bei Gleichstand nicht übernommen, aber auch nicht geschützt', () => {
    const s = applyMove(setup({ 6: at('d05', 'cpu') }, ['p05']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('cpu');
  });
  it('in der Kettenübernahme erobert nur ein höherer Wert – Gleichstand nie, auch nicht mit Dominanz', () => {
    // 5: Kette (5) erobert 6: Dominanz-Karte (geschwächt auf 4); die greift 7 (4) an – Gleichstand, keine Übernahme.
    const s = applyMove(setup({ 6: at('d05', 'cpu', { mod: -1 }), 7: at('p04', 'cpu') }, ['kd5']), { handIndex: 0, cell: 5 });
    expect(s.board[6]!.owner).toBe('player');
    expect(s.board[7]!.owner).toBe('cpu');
    // ein höherer Wert erobert weiter
    const t = applyMove(setup({ 6: at('d05', 'cpu', { mod: -1 }), 7: at('p01', 'cpu') }, ['kd5']), { handIndex: 0, cell: 5 });
    expect(t.board[7]!.owner).toBe('player');
  });
  it('die KI erkennt Gleichstands-Übernahmen mit Dominanz', () => {
    const s = setup({ 6: at('p05', 'cpu') }, ['d05', 'p01'], undefined, 'cpu');
    const m = chooseCpuMove(s, createRng(1), { level: 'medium' });
    expect(m.handIndex).toBe(0);
    expect([5, 7, 2, 10]).toContain(m.cell);
  });
});

describe('Effekt-Einblendung (welcher Effekt hat gewirkt)', () => {
  it('der Effekt der gelegten Karte zuerst, dann Reaktionen anderer Karten', () => {
    // Flammenherz erobert den Schattenmantel – der verflucht die gelegte Karte.
    const s = applyMove(setup({ 6: at('t09', 'cpu') }, ['t07']), { handIndex: 0, cell: 5 });
    expect(activations(s).map((a) => [a.effect, a.by])).toEqual([['flammenherz', 'player'], ['schattenmantel', 'cpu']]);
  });
  it('Dominanz nur, wenn ein Gleichstand dadurch erobert wurde; Standhaft, wenn er standhält', () => {
    expect(activations(applyMove(setup({ 6: at('p05', 'cpu') }, ['d05']), { handIndex: 0, cell: 5 })).map((a) => a.effect)).toEqual(['dominanz']);
    expect(activations(applyMove(setup({ 6: at('p04', 'cpu') }, ['d05']), { handIndex: 0, cell: 5 }))).toEqual([]);
    expect(activations(applyMove(setup({ 6: at('s05', 'cpu') }, ['d05']), { handIndex: 0, cell: 5 })).map((a) => [a.effect, a.by])).toEqual([['standhaft', 'cpu']]);
  });
  it('Kettenübernahme mit Hinweis auf das −1; ohne Gegner daneben nichts', () => {
    const s = applyMove(setup({ 1: at('l66', 'cpu'), 2: at('p04', 'cpu') }, ['k01']), { handIndex: 0, cell: 0 });
    expect(activations(s)[0]).toMatchObject({ effect: 'kettenuebernahme', by: 'player' });
    expect(activations(s)[0].detail).toMatch(/−1/);
    expect(activations(applyMove(setup({}, ['k01']), { handIndex: 0, cell: 0 }))).toEqual([]);
  });
});
