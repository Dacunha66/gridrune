import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRAW_HAND_SIZE, HAND_SIZE, applyMove, cardsLeft, createBattle, isGameOver, legalMoves, toHand } from '../src/game/battle';
import { chooseCpuMove, publicView } from '../src/game/ai';
import { BUILTIN_ARENAS } from '../src/game/arenas';
import { STARTER_DECK } from '../src/game/cards';
import { deriveRng } from '../src/game/league';
import { createRng } from '../src/game/rng';
import { SETTINGS } from '../src/game/settings';
import { startPvp, viewState } from '../src/game/pvp';
import { AdventureTicket, adventureDuel, adventureRngs } from '../src/game/verify';

const A = toHand(STARTER_DECK.slice(0, 8));
const B = toHand(STARTER_DECK.slice(8, 16));
const ids = (cards: { cardId: string }[]) => cards.map((c) => c.cardId).sort();

describe('Nachziehen (Admin-Schalter)', () => {
  beforeEach(() => { SETTINGS.drawHand = true; });
  afterEach(() => { SETTINGS.drawHand = false; });

  it('aus: alle 8 Karten auf der Hand, kein Stapel (wie bisher)', () => {
    SETTINGS.drawHand = false;
    const s = createBattle(A, B);
    expect(s.hands.player).toHaveLength(HAND_SIZE);
    expect(s.piles).toBeUndefined();
  });

  it('an: 5 auf der Hand, 3 verdeckt – dieselben 8 Karten, gemischt nach dem Seed', () => {
    const s = createBattle(A, B, 'player', [], undefined, {}, deriveRng('x', 'deal'));
    for (const side of ['player', 'cpu'] as const) {
      expect(s.hands[side]).toHaveLength(DRAW_HAND_SIZE);
      expect(s.piles![side]).toHaveLength(HAND_SIZE - DRAW_HAND_SIZE);
      expect(ids([...s.hands[side], ...s.piles![side]])).toEqual(ids(side === 'player' ? A : B));
    }
    const again = createBattle(A, B, 'player', [], undefined, {}, deriveRng('x', 'deal'));
    expect(again.hands).toEqual(s.hands);
    expect(again.piles).toEqual(s.piles);
    const orders = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(createBattle(A, B, 'player', [], undefined, {}, deriveRng(`s${i}`, 'deal')).hands.player)));
    expect(orders.size).toBeGreaterThan(6);
  });

  it('vor jedem eigenen Zug wird auf 5 aufgefüllt, bis der Stapel leer ist; alle 8 Karten werden gespielt', () => {
    for (const arena of [BUILTIN_ARENAS[0], BUILTIN_ARENAS.find((a) => a.id === 'a18')!]) {
      for (const rocks of [[], [5]]) {
        const rng = createRng(7);
        let s = createBattle(A, B, 'cpu', rocks, arena.cells, {}, rng);
        let played = { player: 0, cpu: 0 };
        while (!isGameOver(s)) {
          const side = s.turn;
          expect(s.hands[side].length).toBe(Math.min(DRAW_HAND_SIZE, cardsLeft(s, side)));
          s = applyMove(s, chooseCpuMove(s, rng));
          played = { ...played, [side]: played[side] + 1 };
          expect(s.hands[side].length).toBeLessThanOrEqual(DRAW_HAND_SIZE - 1);
        }
        expect(played.player + played.cpu).toBe(16 - rocks.length);
        expect(s.piles!.player).toHaveLength(0);
        expect(s.piles!.cpu).toHaveLength(0);
      }
    }
  });

  it('der Computer sieht weder die Gegnerkarten noch die Reihenfolge seines eigenen Stapels', () => {
    const s = createBattle(A, B, 'cpu', [], undefined, {}, deriveRng('y', 'deal'));
    const v = publicView(s, 'cpu');
    expect(v.piles!.player.every((c) => !A.some((a) => a.cardId === c.cardId))).toBe(true);
    expect(v.hands.player.every((c) => !A.some((a) => a.cardId === c.cardId))).toBe(true);
    expect(ids(v.piles!.cpu)).toEqual(ids(s.piles!.cpu));
    expect(v.piles!.cpu.map((c) => c.cardId)).toEqual([...v.piles!.cpu.map((c) => c.cardId)].sort());
  });

  it('Online: beide Stapel bleiben verdeckt, nur die Anzahl ist sichtbar', () => {
    const { state } = startPvp('pvp-seed', STARTER_DECK.slice(0, 8), STARTER_DECK.slice(8, 16), null, null);
    for (const seat of ['a', 'b'] as const) {
      const v = viewState(state, seat);
      expect(v.hands.player).toHaveLength(DRAW_HAND_SIZE);
      expect(v.piles!.player).toHaveLength(3);
      expect(v.piles!.player.every((c) => c.cardId === 'hidden')).toBe(true);
      expect(v.piles!.cpu.every((c) => c.cardId === 'hidden')).toBe(true);
    }
    // The same seed deals the same on the server every time.
    expect(startPvp('pvp-seed', STARTER_DECK.slice(0, 8), STARTER_DECK.slice(8, 16), null, null).state.piles).toEqual(state.piles);
  });

  it('geprüfte Spiele: Spiel und Server teilen aus demselben Seed gleich aus', () => {
    const t: AdventureTicket = { id: 't', seed: 'abc', deck: [...STARTER_DECK], owned: [...STARTER_DECK], playerRune: null, cpuRune: null };
    const picks = STARTER_DECK.slice(0, 8).map((cardId, i) => ({ cardId, kind: 'deck' as const, gate: i, mod: 0 }));
    const a = adventureDuel(t, picks, adventureRngs(t.seed)).start;
    const b = adventureDuel(t, picks, adventureRngs(t.seed)).start;
    expect(a.piles).toEqual(b.piles);
    expect(a.hands).toEqual(b.hands);
    expect(legalMoves(a).length).toBeGreaterThan(0);
  });
});
