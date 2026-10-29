import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CardDef, setCardCatalog } from '../src/game/cards';
import { BattleState, BoardCell, CELL_COUNT, applyMove, cellBreakdown, createBattle, isGameOver, toHand } from '../src/game/battle';
import { BUILTIN_RUNES, RUNES, RUNE_RARITIES, applyAction, applyRune, availableRunes, echoCapturable, parseRune, runeChoices, runeProblem, runeRules, setRunes } from '../src/game/runes';
import { runeOptions } from '../src/game/ai';
import { CardClass, EffectId, Terrain } from '../src/game/effects';
import { duelStats } from '../src/game/campaignGoals';

function card(id: string, v: [number, number, number, number], cls: CardClass, effect?: EffectId): CardDef {
  return { id, name: id, rarity: 'common', top: v[0], right: v[1], bottom: v[2], left: v[3], art: '🃏', hue: 0, cls, effect };
}
const TEST: CardDef[] = [
  card('f5', [5, 5, 5, 5], 'feuer'), card('f9', [9, 9, 9, 10], 'feuer'), card('n5', [5, 5, 5, 5], 'natur'), card('n1', [1, 1, 1, 1], 'natur'),
  card('k5', [5, 5, 5, 5], 'krieger'), card('t9', [9, 1, 2, 3], 'frost'), card('mb', [3, 5, 3, 6], 'magier', 'magische_barriere'),
  card('kw', [6, 6, 6, 6], 'feuer', 'kampfgeist'),
  card('k9', [9, 9, 9, 9], 'krieger', 'kettenuebernahme'),
  card('l66', [1, 6, 6, 1], 'krieger'),
];
setCardCatalog([...BUILTIN_CARDS, ...TEST]);
afterEach(() => {
  setCardCatalog([...BUILTIN_CARDS, ...TEST]);
  setRunes([]);
});

const FILL = toHand(['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08']);
function at(id: string, owner: 'player' | 'cpu', extra: Partial<BoardCell> = {}): BoardCell {
  return { cardId: id, mod: 0, owner, placedBy: owner, ...extra };
}
function setup(board: Record<number, BoardCell>, rune: string, turn: 'player' | 'cpu' = 'player', terrain: Partial<Record<number, Terrain>> = {}): BattleState {
  const t: Terrain[] = Array(CELL_COUNT).fill('normal');
  for (const [i, v] of Object.entries(terrain)) t[Number(i)] = v!;
  const s = createBattle(FILL, FILL, turn, [], t, { player: rune, cpu: rune });
  const b: (BoardCell | null)[] = Array(CELL_COUNT).fill(null);
  for (const [i, c] of Object.entries(board)) b[Number(i)] = c;
  return { ...s, board: b };
}
const vals = (s: BattleState, c: number) => cellBreakdown(s.board, s.terrain, c).values;
/** Nachhall without its mid-duel threshold – for the small test boards below. */
const echoAnytime = () => setRunes([{ ...BUILTIN_RUNES[1], minPlaced: 0 }]);

describe('Runen: Grundregeln', () => {
  it('einmal pro Duell, nur im eigenen Zug, Zug bleibt beim Spieler, keine Kartenplatzierung verbraucht', () => {
    const s = setup({ 5: at('t9', 'player') }, 'rn01');
    const a = applyRune(s, { rune: true, cell: 5, dir: 1 });
    expect(a.turn).toBe('player');
    expect(a.moveCount).toBe(0);
    expect(a.hands.player).toHaveLength(8);
    expect(a.runes.player!.used).toBe(true);
    expect(runeProblem(a, { rune: true, cell: 5, dir: 1 })).toMatch(/schon eingesetzt/);
    expect(() => applyRune(a, { rune: true, cell: 5, dir: 1 })).toThrow();
    // The opponent's rune is untouched.
    expect(a.runes.cpu!.used).toBe(false);
    expect(a.log[a.log.length - 1].text).toMatch(/Verdrehung/);
  });
  it('nicht nach Spielende und nicht ohne Rune', () => {
    const s = setup({ 5: at('t9', 'player') }, 'rn01');
    expect(runeProblem({ ...s, moveCount: 16 }, { rune: true, cell: 5, dir: 1 })).toMatch(/vorbei/);
    expect(isGameOver({ ...s, moveCount: 16 })).toBe(true);
    expect(runeProblem({ ...s, runes: { player: null, cpu: null } }, { rune: true, cell: 5, dir: 1 })).toMatch(/Keine Rune/);
  });
});

describe('Rune der Verdrehung', () => {
  it('dreht eine eigene Karte um 90°, ohne neuen Kampf', () => {
    // t9 [9,1,2,3] on 5, enemy k5 right of it: turned right the 9 faces the enemy – but no new fight happens.
    const s = setup({ 5: at('t9', 'player'), 6: at('k5', 'cpu') }, 'rn01');
    const a = applyRune(s, { rune: true, cell: 5, dir: 1 });
    expect(vals(a, 5)).toEqual([3, 9, 1, 2]);
    expect(a.board[6]!.owner).toBe('cpu');
    expect(vals(applyRune(s, { rune: true, cell: 5, dir: -1 }), 5)).toEqual([1, 2, 3, 9]);
  });
  it('nur eigene Karten; Richtung muss gewählt sein', () => {
    const s = setup({ 5: at('t9', 'player'), 6: at('k5', 'cpu') }, 'rn01');
    expect(runeProblem(s, { rune: true, cell: 6, dir: 1 })).not.toBeNull();
    expect(runeProblem(s, { rune: true, cell: 5 })).toMatch(/links oder rechts/);
  });
  it('bestehende Boni drehen mit und werden nicht verdoppelt (Kampfgeist)', () => {
    // Kampfgeist gives +1 on the highest local value (top, ties top first).
    let s = setup({}, 'rn01');
    s = { ...s, hands: { ...s.hands, player: toHand(['kw']) } };
    const placed = applyMove(s, { handIndex: 0, cell: 5 });
    expect(vals(placed, 5)).toEqual([7, 6, 6, 6]);
    const turned = applyRune({ ...placed, turn: 'player' }, { rune: true, cell: 5, dir: 1 });
    expect(vals(turned, 5)).toEqual([6, 7, 6, 6]);
    expect(cellBreakdown(turned.board, turned.terrain, 5).parts.filter((p) => p.source === 'Kampfgeist')).toHaveLength(1);
  });
});

describe('Rune des Nachhalls', () => {
  beforeEach(echoAnytime);
  it('greift angrenzende Gegner neu an (aktuelle Werte), ohne Kette', () => {
    // n5 is weak at first; after the Glut-like change of +1 it beats the 5 – here: enemy k5 lost 1 by a curse earlier.
    const s = setup({ 5: at('n5', 'player'), 6: at('k5', 'cpu', { changes: [{ source: 'Test', d: [-1, -1, -1, -1] }] }), 7: at('n1', 'cpu') }, 'rn02');
    const a = applyRune(s, { rune: true, cell: 5 });
    expect(a.board[6]!.owner).toBe('player');
    // No chain: the captured k5 does not attack n1 on 7.
    expect(a.board[7]!.owner).toBe('cpu');
    expect(a.lastFlips).toEqual([6]);
  });
  it('nur mit einer Gegnerkarte daneben', () => {
    const s = setup({ 5: at('n5', 'player'), 15: at('k5', 'cpu') }, 'rn02');
    expect(runeChoices(s, 'player', RUNES.find((r) => r.id === 'rn02')!).cells).toEqual([]);
    expect(runeProblem(s, { rune: true, cell: 5 })).not.toBeNull();
  });
});

describe('Rune des Nachhalls: höchstens eine Übernahme, nie eine Kette', () => {
  beforeEach(echoAnytime);
  // Own k9 (9 on every side) in the middle at 5, weak enemies on 1, 4, 6 (all capturable), l66 chain bait on 7.
  const crowd = () => setup({ 5: at('k9', 'player'), 1: at('n1', 'cpu'), 4: at('n1', 'cpu'), 6: at('l66', 'cpu'), 7: at('l66', 'cpu') }, 'rn02');
  it('bei mehreren möglichen Übernahmen muss der Spieler genau eine wählen', () => {
    const s = crowd();
    expect(echoCapturable(s, 5).sort()).toEqual([1, 4, 6]);
    expect(runeProblem(s, { rune: true, cell: 5 })).toMatch(/Welche|Wähle, welche/);
    expect(runeProblem(s, { rune: true, cell: 5, capture: [1, 4] })).not.toBeNull();
    expect(runeProblem(s, { rune: true, cell: 5, capture: [7] })).not.toBeNull();
    const a = applyRune(s, { rune: true, cell: 5, capture: [4] });
    expect([1, 4, 6].map((c) => a.board[c]!.owner)).toEqual(['cpu', 'player', 'cpu']);
    expect(a.lastFlips).toEqual([4]);
    expect(a.lastChain).toEqual([]);
  });
  it('die Kettenübernahme der angreifenden Karte löst durch Nachhall keine Kette aus', () => {
    const s = crowd();
    // Capturing l66 on 6 would let it attack l66 on 7 in a chain – Nachhall must not do that.
    const a = applyRune(s, { rune: true, cell: 5, capture: [6] });
    expect(a.board[6]!.owner).toBe('player');
    expect(a.board[7]!.owner).toBe('cpu');
    expect(a.lastChain).toEqual([]);
    expect(a.log[a.log.length - 1].text).toMatch(/Nachhall.*erobert 1/);
  });
  it('nur eine mögliche Übernahme: keine Auswahl nötig (und keine erlaubt)', () => {
    const s = setup({ 5: at('k9', 'player'), 6: at('n1', 'cpu') }, 'rn02');
    expect(runeProblem(s, { rune: true, cell: 5 })).toBeNull();
    expect(runeProblem(s, { rune: true, cell: 5, capture: [6] })).toMatch(/nichts zu wählen/);
    expect(applyRune(s, { rune: true, cell: 5 }).board[6]!.owner).toBe('player');
  });
  it('Höchstzahl im Admin einstellbar (z. B. 2)', () => {
    setRunes([{ ...BUILTIN_RUNES[1], maxTargets: 2, minPlaced: 0 }]);
    const s = crowd();
    expect(runeProblem(s, { rune: true, cell: 5, capture: [1] })).toBeNull();
    const a = applyRune(s, { rune: true, cell: 5, capture: [1, 6] });
    expect([1, 4, 6].map((c) => a.board[c]!.owner)).toEqual(['player', 'cpu', 'player']);
    expect(a.board[7]!.owner).toBe('cpu');
  });
  it('die KI wählt nur gültige Nachhall-Einsätze', () => {
    const s = crowd();
    const opts = runeOptions(s);
    expect(opts.length).toBe(3);
    for (const o of opts) expect(runeProblem(s, o)).toBeNull();
  });
  it('Kettenübernahme beim Legen bleibt unabhängig davon (eigene Regel, eigene Grenze)', () => {
    let s = setup({ 1: at('l66', 'cpu'), 2: at('l66', 'cpu'), 3: at('l66', 'cpu') }, 'rn02');
    s = { ...s, hands: { ...s.hands, player: toHand(['k9']) } };
    const placed = applyMove(s, { handIndex: 0, cell: 0 });
    expect(placed.lastChain.map((c) => c.cell)).toEqual([2, 3]);
    // Every card is captured once: no double captures.
    expect(new Set(placed.lastFlips).size).toBe(placed.lastFlips.length);
  });
});

describe('Rune des Nachhalls: erst ab der Spielmitte', () => {
  const board = (n: number) => {
    const b: Record<number, BoardCell> = { 5: at('n5', 'player'), 6: at('n1', 'cpu') };
    for (const i of [0, 3, 8, 11, 12, 13, 14, 15].slice(0, Math.max(0, n - 2))) b[i] = at('n5', i % 2 ? 'cpu' : 'player');
    return setup(b, 'rn02');
  };
  it('mit 7 Karten auf dem Feld gesperrt, ab 8 Karten einsetzbar', () => {
    expect(BUILTIN_RUNES[1].minPlaced).toBe(8);
    const early = board(7);
    expect(runeChoices(early, 'player', BUILTIN_RUNES[1]).cells).toEqual([]);
    expect(runeProblem(early, { rune: true, cell: 5 })).toMatch(/ab 8 Karten/);
    expect(runeOptions(early)).toEqual([]);
    const mid = board(8);
    expect(runeProblem(mid, { rune: true, cell: 5 })).toBeNull();
    expect(applyRune(mid, { rune: true, cell: 5 }).board[6]!.owner).toBe('player');
  });
  it('andere Runen sind weiter von Anfang an einsetzbar; Schwelle im Admin einstellbar und für Varianten übernommen', () => {
    for (const id of ['rn01', 'rn03', 'rn04']) expect(BUILTIN_RUNES.find((r) => r.id === id)!.minPlaced).toBe(0);
    setRunes([{ ...BUILTIN_RUNES[1], minPlaced: 4 }]);
    expect(runeProblem(board(4), { rune: true, cell: 5 })).toBeNull();
    expect(runeProblem(board(3), { rune: true, cell: 5 })).toMatch(/ab 4 Karten/);
    setRunes([]);
    const variant = parseRune('rn09', { name: 'Echo-Variante', effect: 'echo', variantOf: 'rn02', minPlaced: 0, status: 'active' })!;
    expect(runeRules(variant).minPlaced).toBe(8);
    // Saved runes from before this rule keep the built-in threshold.
    expect(parseRune('rn02', { name: 'Rune des Nachhalls', effect: 'echo', status: 'active' })!.minPlaced).toBe(8);
  });
});

describe('Runen: Seltenheit ab selten', () => {
  it('Grundrunen sind selten; gespeicherte Runen mit niedrigerer Seltenheit werden zu selten', () => {
    expect(BUILTIN_RUNES.every((r) => r.rarity === 'rare')).toBe(true);
    expect(RUNE_RARITIES).toEqual(['rare', 'epic', 'legendary', 'mythic']);
    expect(parseRune('rn09', { name: 'X', effect: 'twist', rarity: 'common', status: 'active' })!.rarity).toBe('rare');
    expect(parseRune('rn09', { name: 'X', effect: 'twist', rarity: 'uncommon', status: 'active' })!.rarity).toBe('rare');
    expect(parseRune('rn09', { name: 'X', effect: 'twist', rarity: 'mythic', status: 'active' })!.rarity).toBe('mythic');
  });
});

describe('Rune der Glut', () => {
  it('bis zu zwei eigene Feuerkarten +1 bis Duellende, höchstens 10, andere Klassen nicht', () => {
    const s = setup({ 0: at('f5', 'player'), 1: at('f9', 'player'), 2: at('n5', 'player'), 3: at('f5', 'cpu') }, 'rn03');
    const choices = runeChoices(s, 'player', RUNES.find((r) => r.id === 'rn03')!);
    expect(choices.cells).toEqual([0, 1]);
    expect(runeProblem(s, { rune: true, cells: [0, 2] })).not.toBeNull();
    expect(runeProblem(s, { rune: true, cells: [0, 1, 0] })).not.toBeNull();
    const a = applyRune(s, { rune: true, cells: [0, 1] });
    expect(vals(a, 0)).toEqual([6, 6, 6, 6]);
    expect(vals(a, 1)).toEqual([10, 10, 10, 10]);
    expect(vals(a, 2)).toEqual([5, 5, 5, 5]);
  });
  it('später gelegte Karten bekommen den Bonus nicht', () => {
    const s = setup({ 0: at('f5', 'player') }, 'rn03');
    let a = applyRune(s, { rune: true, cells: [0] });
    a = { ...a, hands: { ...a.hands, player: toHand(['f5']) } };
    a = applyMove(a, { handIndex: 0, cell: 10 });
    expect(vals(a, 10)).toEqual([5, 5, 5, 5]);
    expect(vals(a, 0)).toEqual([6, 6, 6, 6]);
  });
});

describe('Rune des Fluchs', () => {
  it('Klasse wählen, bis zu zwei Gegnerkarten dieser Klasse −1, mindestens 1', () => {
    const s = setup({ 0: at('n5', 'cpu'), 1: at('n1', 'cpu'), 2: at('k5', 'cpu'), 3: at('n5', 'player') }, 'rn04');
    const def = RUNES.find((r) => r.id === 'rn04')!;
    expect(runeChoices(s, 'player', def).classes.sort()).toEqual(['krieger', 'natur']);
    expect(runeProblem(s, { rune: true, cls: 'natur', cells: [0, 2] })).toMatch(/Klasse/);
    expect(runeProblem(s, { rune: true, cls: 'feuer', cells: [0] })).not.toBeNull();
    const a = applyRune(s, { rune: true, cls: 'natur', cells: [0, 1] });
    expect(vals(a, 0)).toEqual([4, 4, 4, 4]);
    expect(vals(a, 1)).toEqual([1, 1, 1, 1]);
    expect(vals(a, 3)).toEqual([5, 5, 5, 5]);
  });
  it('die Magische Barriere blockt den Fluch einmal', () => {
    const s = setup({ 0: at('mb', 'cpu', { barrier: true }) }, 'rn04');
    const a = applyRune(s, { rune: true, cls: 'magier', cells: [0] });
    expect(a.board[0]!.barrier).toBe(false);
    expect(vals(a, 0)).toEqual(vals(s, 0));
  });
  it('wirkt auch mit Gelände: Element +1 und Fluch −1 heben sich auf', () => {
    const s = setup({ 0: at('n5', 'cpu') }, 'rn04', 'player', { 0: 'wald' });
    expect(vals(s, 0)).toEqual([6, 6, 6, 6]);
    expect(vals(applyRune(s, { rune: true, cls: 'natur', cells: [0] }), 0)).toEqual([5, 5, 5, 5]);
  });
});

describe('Runen: Daten, Varianten, Fairness', () => {
  it('Varianten haben immer die Wirkung ihrer Grundrune (nie stärker)', () => {
    const variant = parseRune('rn10', { name: 'Goldene Glut', effect: 'empower', amount: 2, maxTargets: 3, rarity: 'legendary', variantOf: 'rn03', status: 'active' })!;
    setRunes([variant]);
    const rules = runeRules(variant);
    expect([rules.amount, rules.maxTargets, rules.cls]).toEqual([1, 2, 'feuer']);
  });
  it('Rangliste: alle vier Grundrunen für jeden, keine Varianten oder Kampagnen-Runen', () => {
    const camp = parseRune('rn11', { name: 'Waldrune', effect: 'empower', cls: 'natur', status: 'active', unlock: { kind: 'stars', n: 20 } })!;
    setRunes([camp]);
    expect(availableRunes('league', []).map((r) => r.id)).toEqual(['rn01', 'rn02', 'rn03', 'rn04']);
    expect(availableRunes('campaign', []).map((r) => r.id)).not.toContain('rn11');
    expect(availableRunes('campaign', ['rn11']).map((r) => r.id)).toContain('rn11');
  });
  it('ungültige Dokumente werden abgelehnt oder bereinigt', () => {
    expect(parseRune('x', { name: 'A', effect: 'twist' })).toBeNull();
    expect(parseRune('rn09', { name: 'A', effect: 'nuke' })).toBeNull();
    expect(parseRune('rn09', { name: 'A', effect: 'curse', amount: 9, maxTargets: 0 })).toMatchObject({ amount: 2, maxTargets: 1, status: 'draft' });
    expect(BUILTIN_RUNES).toHaveLength(4);
  });
  it('Nachspielen mit Runen ergibt denselben Endstand (Kampagnen-Ziele)', () => {
    echoAnytime();
    const s = setup({ 5: at('t9', 'player'), 6: at('k5', 'cpu') }, 'rn02');
    const actions = [{ rune: true as const, cell: 5 }, { handIndex: 0, cell: 0 }];
    let end = s;
    let captures = 0;
    for (const a of actions) {
      const side = end.turn;
      end = applyAction(end, a);
      if (side === 'player') captures += end.lastFlips.length;
    }
    const st = duelStats(s, actions);
    expect(st.captures).toBe(captures);
    expect(st.fields).toBe(end.board.filter((c) => c?.owner === 'player').length);
  });
});
