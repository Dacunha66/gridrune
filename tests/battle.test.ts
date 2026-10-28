import { describe, expect, it } from 'vitest';
import {
  BattleState, BoardCell, CELL_COUNT, applyMove, cardValue, coinToss, computeFlips, cpuChoosesFirst, createBattle, isGameOver, legalMoves, outcome, score, toHand,
} from '../src/game/battle';
import { chooseCpuMove, drawCpuHand } from '../src/game/ai';
import { CARDS, CardDef, STARTER_DECK, cardPower, getCard } from '../src/game/cards';
import { createRng } from '../src/game/rng';

const H = toHand(['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08']);
const hc = (cardId: string, mod = 0) => ({ cardId, mod });

function emptyBoard(): (BoardCell | null)[] {
  return Array(CELL_COUNT).fill(null);
}
function cpu(cardId: string, mod = 0): BoardCell {
  return { cardId, mod, owner: 'cpu', placedBy: 'cpu' };
}
/** State where it is the player's turn and the board is preset. */
function stateWith(board: (BoardCell | null)[], playerHand: (string | { cardId: string; mod: number })[]): BattleState {
  const s = createBattle(H, H, 'player');
  const hand = playerHand.map((c) => (typeof c === 'string' ? hc(c) : c));
  return { ...s, board, hands: { player: hand, cpu: s.hands.cpu } };
}

/** First card pair (attacker, defender) matching a condition – keeps tests independent of card balancing. */
function findPair(pred: (a: CardDef, b: CardDef) => boolean): [CardDef, CardDef] {
  for (const a of CARDS) for (const b of CARDS) if (pred(a, b)) return [a, b];
  throw new Error('no matching card pair');
}
function findCard(pred: (c: CardDef) => boolean): CardDef {
  const c = CARDS.find(pred);
  if (!c) throw new Error('no matching card');
  return c;
}
const strongest = [...CARDS].sort((a, b) => Math.min(b.top, b.right, b.bottom, b.left) - Math.min(a.top, a.right, a.bottom, a.left))[0];
const weakest = [...CARDS].sort((a, b) => Math.max(a.top, a.right, a.bottom, a.left) - Math.max(b.top, b.right, b.bottom, b.left))[0];

describe('Kampf-Regeln', () => {
  // Center cell 5 has neighbours: top 1, right 6, bottom 9, left 4.
  const directions = [
    { name: 'oben', cell: 1, mine: 'top', theirs: 'bottom' },
    { name: 'rechts', cell: 6, mine: 'right', theirs: 'left' },
    { name: 'unten', cell: 9, mine: 'bottom', theirs: 'top' },
    { name: 'links', cell: 4, mine: 'left', theirs: 'right' },
  ] as const;

  for (const d of directions) {
    it(`vergleicht Richtung ${d.name} korrekt für alle Kartenpaare (nur strikt größer übernimmt)`, () => {
      for (const a of CARDS) {
        for (const b of CARDS) {
          const board = emptyBoard();
          board[d.cell] = cpu(b.id);
          const flips = computeFlips(board, 5, hc(a.id), 'player');
          expect(flips.includes(d.cell)).toBe(a[d.mine] > b[d.theirs]);
        }
      }
    });
  }

  it('Gleichstand übernimmt nicht', () => {
    const [a, b] = findPair((a, b) => a.top === b.bottom);
    const board = emptyBoard();
    board[1] = cpu(b.id);
    const next = applyMove(stateWith(board, [a.id]), { handIndex: 0, cell: 5 });
    expect(next.board[1]!.owner).toBe('cpu');
    expect(next.lastFlips).toEqual([]);
  });

  it('übernimmt keine diagonalen Karten', () => {
    expect(Math.min(strongest.top, strongest.right, strongest.bottom, strongest.left)).toBeGreaterThan(
      Math.max(weakest.top, weakest.right, weakest.bottom, weakest.left),
    );
    const board = emptyBoard();
    for (const c of [0, 2, 8, 10]) board[c] = cpu(weakest.id);
    const next = applyMove(stateWith(board, [strongest.id]), { handIndex: 0, cell: 5 });
    for (const c of [0, 2, 8, 10]) expect(next.board[c]!.owner).toBe('cpu');
  });

  it('löst keine Kettenreaktion aus', () => {
    // Attacker X beats A (cell 6) on the right; A itself would beat B (cell 7) – a chain must not happen.
    const [x, a] = findPair((x, a) => x.right > a.left && CARDS.some((b) => a.right > b.left));
    const b = findCard((b) => a.right > b.left);
    const board = emptyBoard();
    board[6] = cpu(a.id);
    board[7] = cpu(b.id);
    const next = applyMove(stateWith(board, [x.id]), { handIndex: 0, cell: 5 });
    expect(next.board[6]!.owner).toBe('player');
    expect(next.board[7]!.owner).toBe('cpu');
  });

  it('übernommene Karten wechseln nur den Besitzer, nicht den Platz', () => {
    const [x, a] = findPair((x, a) => x.right > a.left);
    const board = emptyBoard();
    board[6] = cpu(a.id);
    const next = applyMove(stateWith(board, [x.id]), { handIndex: 0, cell: 5 });
    expect(next.board[6]).toEqual({ cardId: a.id, mod: 0, owner: 'player', placedBy: 'cpu' });
  });

  it('übernimmt nie eigene Karten und verweigert belegte Felder', () => {
    const board = emptyBoard();
    board[6] = { cardId: weakest.id, mod: 0, owner: 'player', placedBy: 'player' };
    expect(computeFlips(board, 5, hc(strongest.id), 'player')).toEqual([]);
    expect(() => applyMove(stateWith(board, [strongest.id]), { handIndex: 0, cell: 6 })).toThrow();
  });

  it('spielt ein vollständiges Spiel mit 16 Zügen', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      let s = createBattle(drawCpuHand(rng), drawCpuHand(rng), seed % 2 ? 'player' : 'cpu');
      let moves = 0;
      while (!isGameOver(s)) {
        const before = s.turn;
        s = applyMove(s, chooseCpuMove(s, rng));
        expect(s.turn).not.toBe(before);
        moves++;
      }
      expect(moves).toBe(16);
      expect(s.board.every((c) => c !== null)).toBe(true);
      expect(s.hands.player).toHaveLength(0);
      expect(s.hands.cpu).toHaveLength(0);
      const sc = score(s);
      expect(sc.player + sc.cpu).toBe(16);
      expect(outcome(s)).toBe(sc.player > sc.cpu ? 'win' : sc.player < sc.cpu ? 'loss' : 'draw');
      expect(legalMoves(s)).toEqual([]);
    }
  });

  it('geschwächte Karten (−1) haben alle vier Werte um 1 verringert, aber nie unter 1', () => {
    const c = findCard((c) => Math.min(c.top, c.right, c.bottom, c.left) >= 2);
    expect(cardValue(hc(c.id, -1), 'top')).toBe(c.top - 1);
    expect(cardValue(hc(c.id, -1), 'right')).toBe(c.right - 1);
    expect(cardValue(hc(c.id, -1), 'bottom')).toBe(c.bottom - 1);
    expect(cardValue(hc(c.id, -1), 'left')).toBe(c.left - 1);
    const one = findCard((c) => c.top === 1);
    expect(cardValue(hc(one.id, -1), 'top')).toBe(1);
  });

  it('die Schwächung zählt beim Vergleich – für Angreifer und Verteidiger', () => {
    // Attacker exactly 1 higher: flips normally, but not when the attacker is weakened (then it is a tie).
    const [a, b] = findPair((a, b) => a.top === b.bottom + 1 && b.bottom >= 2);
    const board = emptyBoard();
    board[1] = cpu(b.id);
    expect(applyMove(stateWith(board, [a.id]), { handIndex: 0, cell: 5 }).lastFlips).toEqual([1]);
    expect(applyMove(stateWith(board, [hc(a.id, -1)]), { handIndex: 0, cell: 5 }).lastFlips).toEqual([]);
    // Equal values: no flip normally, but a weakened defender loses.
    const [c, d] = findPair((c, d) => c.top === d.bottom && d.bottom >= 2);
    board[1] = cpu(d.id);
    expect(applyMove(stateWith(board, [c.id]), { handIndex: 0, cell: 5 }).lastFlips).toEqual([]);
    board[1] = cpu(d.id, -1);
    expect(applyMove(stateWith(board, [c.id]), { handIndex: 0, cell: 5 }).lastFlips).toEqual([1]);
  });

  it('8:8 ist unentschieden', () => {
    const s = createBattle(H, H);
    const board = Array.from({ length: 16 }, (_, i): BoardCell => ({
      cardId: 'c01', mod: 0, owner: i < 8 ? 'player' : 'cpu', placedBy: 'player',
    }));
    expect(outcome({ ...s, board, moveCount: 16 })).toBe('draw');
  });

  it('Computer bevorzugt eine unmittelbare Übernahme', () => {
    // Only the second CPU card can capture the player's weak card in corner 0.
    const board = emptyBoard();
    board[0] = { cardId: weakest.id, mod: 0, owner: 'player', placedBy: 'player' };
    const s: BattleState = { ...createBattle(H, H, 'cpu'), board, hands: { player: H, cpu: toHand([weakest.id, strongest.id]) } };
    const move = chooseCpuMove(s, createRng(3));
    const next = applyMove(s, move);
    expect(next.lastFlips.length).toBeGreaterThan(0);
  });

  it('Computerhand hat 8 unterschiedliche Karten', () => {
    const hand = drawCpuHand(createRng(9));
    expect(new Set(hand.map((c) => c.cardId)).size).toBe(8);
  });
});

describe('Balance', () => {
  it('Computergegner ist ungefähr so stark wie das Starterdeck', () => {
    const starterAvg = STARTER_DECK.reduce((s, id) => s + cardPower(getCard(id)), 0) / STARTER_DECK.length;
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 500; seed++) {
      for (const c of drawCpuHand(createRng(seed))) {
        sum += cardPower(getCard(c.cardId));
        n++;
      }
    }
    const cpuAvg = sum / n;
    expect(Math.abs(cpuAvg - starterAvg)).toBeLessThan(1.5);
  });

  it('der Computer bekommt nie mystische Karten', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const c of drawCpuHand(createRng(seed))) expect(getCard(c.cardId).rarity).not.toBe('mythic');
    }
  });
});

describe('Münzwurf & Kampfdetails', () => {
  it('Münzwurf ergibt beide Seiten etwa gleich oft', () => {
    const rng = createRng(42);
    let player = 0;
    for (let i = 0; i < 2000; i++) if (coinToss(rng) === 'player') player++;
    expect(player).toBeGreaterThan(900);
    expect(player).toBeLessThan(1100);
  });

  it('gewinnt der Computer den Münzwurf, lässt er dich anfangen (der letzte Zug ist ein Vorteil)', () => {
    expect(cpuChoosesFirst()).toBe('player');
  });

  it('jeder Zug merkt sich alle Vergleiche – übernommene und gehaltene', () => {
    const [x, a] = findPair((x, a) => x.right > a.left);
    const [, b] = findPair((y, b) => y.id === x.id && x.left <= b.right);
    const board = emptyBoard();
    board[6] = cpu(a.id);
    board[4] = cpu(b.id);
    const next = applyMove(stateWith(board, [x.id]), { handIndex: 0, cell: 5 });
    const byCell = Object.fromEntries(next.lastClashes.map((c) => [c.cell, c]));
    expect(byCell[6]).toEqual({ cell: 6, dir: 'right', attack: x.right, defense: a.left, captured: true });
    expect(byCell[4]).toEqual({ cell: 4, dir: 'left', attack: x.left, defense: b.right, captured: false });
    expect(next.lastFlips).toEqual([6]);
  });
});
