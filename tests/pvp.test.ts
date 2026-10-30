import { describe, expect, it } from 'vitest';
import { PvpView, Seat, pvpAction, pvpWinner, startPvp, swapSides, timeoutMove, validPvpHand, viewState, inviteCode, normalizeCode } from '../src/game/pvp';
import { STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyAction } from '../src/game/runes';
import { isGameOver, legalMoves, outcome } from '../src/game/battle';
import { createRng } from '../src/game/rng';

const handA = STARTER_DECK.slice(0, 8);
const handB = STARTER_DECK.slice(8, 16);

describe('Online-Duell (Server-Regeln)', () => {
  it('Seitentausch ist umkehrbar und passt zu den Regeln', () => {
    let { state } = startPvp('seed-1', handA, handB, null, null);
    expect(swapSides(swapSides(state))).toEqual(state);
    const me = createRng(3);
    while (!isGameOver(state)) {
      const moves = legalMoves(state);
      const m = moves[Math.floor(me() * moves.length)];
      // Same move applied to the swapped duel gives the swapped result.
      expect(swapSides(applyAction(state, m))).toEqual(applyAction(swapSides(state), m));
      state = applyAction(state, m);
    }
  });

  it('jeder sieht nur seine eigene Hand, Züge aus der eigenen Sicht werden angenommen', () => {
    let { state } = startPvp('seed-2', handA, handB, null, null);
    const rng = createRng(9);
    while (!isGameOver(state)) {
      const seat: Seat = state.turn === 'player' ? 'a' : 'b';
      const view = viewState(state, seat);
      expect(view.turn).toBe('player');
      expect(view.hands.cpu.every((c) => c.cardId === 'hidden')).toBe(true);
      expect(view.hands.player.every((c) => c.cardId !== 'hidden')).toBe(true);
      // The other player may not move now.
      expect(pvpAction(state, seat === 'a' ? 'b' : 'a', legalMoves(view)[0])).toMatchObject({ ok: false, error: 'not_your_turn' });
      const moves = legalMoves(view);
      const r = pvpAction(state, seat, moves[Math.floor(rng() * moves.length)]);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    const w = pvpWinner(state);
    expect(w).toBe(outcome(state) === 'win' ? 'a' : outcome(state) === 'loss' ? 'b' : 'draw');
  });

  it('ungültige Züge und Hände werden abgelehnt, Zeitablauf legt eine Karte', () => {
    const { state } = startPvp('seed-3', handA, handB, null, null);
    const seat: Seat = state.turn === 'player' ? 'a' : 'b';
    expect(pvpAction(state, seat, { handIndex: 0, cell: 99 })).toMatchObject({ ok: false });
    expect(pvpAction(state, seat, { handIndex: 12, cell: 0 })).toMatchObject({ ok: false });
    const t = timeoutMove(state, 'seed-3');
    expect(t).not.toBeNull();
    expect(pvpAction(state, seat, t)).toMatchObject({ ok: true });
    expect(validPvpHand(handA, STARTING_UNLOCKED)).toBe(true);
    expect(validPvpHand([...handA.slice(0, 7), handA[0]], STARTING_UNLOCKED)).toBe(false);
    expect(validPvpHand([...handA.slice(0, 7), 'l03'], STARTING_UNLOCKED)).toBe(false);
  });

  it('Start ist fair und aus dem Seed nachrechenbar (Felsfeld, Arena)', () => {
    const a = startPvp('seed-4', handA, handB, null, null);
    const b = startPvp('seed-4', handA, handB, null, null);
    expect(a.state).toEqual(b.state);
    expect(a.state.rocks.length).toBe(1);
  });

  it('Einladungs-Codes', () => {
    const c = inviteCode(createRng(1));
    expect(c).toMatch(/^[A-Z2-9]{6}$/);
    expect(normalizeCode(` ${c.toLowerCase()} `)).toBe(c);
    const v: Partial<PvpView> = { code: c };
    expect(v.code).toBe(c);
  });
});
