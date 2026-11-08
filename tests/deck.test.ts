import { describe, expect, it } from 'vitest';
import { DRAW_HAND_SIZE, HandCard, applyMove, cardsLeft, coinToss, cpuChoosesFirst, createBattle, isGameOver, legalMoves, outcome, toHand } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune, drawCpuHand, publicView } from '../src/game/ai';
import { BUILTIN_ARENAS } from '../src/game/arenas';
import { CARDS, STARTER_DECK, STARTING_UNLOCKED, cardPower } from '../src/game/cards';
import { deriveRng } from '../src/game/league';
import { createRng } from '../src/game/rng';
import { startPvp, viewState } from '../src/game/pvp';
import { Action, applyAction, applyRune, runeProblem, runeUsable, findRune } from '../src/game/runes';
import { AdventureTicket, adventureDuel, adventureRngs, checkAdventure, handPicks } from '../src/game/verify';

const DECK = toHand([...STARTER_DECK]);
const OTHER = toHand([...STARTER_DECK].reverse());
const ids = (cards: { cardId: string }[]) => cards.map((c) => c.cardId).sort();
const all = (s: { hands: Record<'player' | 'cpu', HandCard[]>; piles?: Record<'player' | 'cpu', HandCard[]> }, side: 'player' | 'cpu') => [...s.hands[side], ...s.piles![side]];

describe('Hand und Deck (feste Regel)', () => {
  it('5 Karten auf der Hand, der Rest verdeckt – dieselben Karten, gemischt nach dem Seed', () => {
    const s = createBattle(DECK, OTHER, 'player', [], undefined, {}, deriveRng('x', 'deal'));
    expect(s.hands.player).toHaveLength(DRAW_HAND_SIZE);
    expect(s.piles!.player).toHaveLength(15);
    expect(ids(all(s, 'player'))).toEqual(ids(DECK));
    expect(ids(all(s, 'cpu'))).toEqual(ids(OTHER));
    const again = createBattle(DECK, OTHER, 'player', [], undefined, {}, deriveRng('x', 'deal'));
    expect(again.hands).toEqual(s.hands);
    expect(again.piles).toEqual(s.piles);
    const orders = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(createBattle(DECK, OTHER, 'player', [], undefined, {}, deriveRng(`s${i}`, 'deal')).hands.player)));
    expect(orders.size).toBeGreaterThan(8);
  });

  it('Decks mit 8 bis 40 Karten; weniger geht nicht', () => {
    expect(() => createBattle(DECK.slice(0, 7), OTHER)).toThrow();
    expect(createBattle(DECK.slice(0, 8), OTHER).piles!.player).toHaveLength(3);
  });

  it('vor jedem eigenen Zug wird auf 5 aufgefüllt; Quadrat und Kristall, mit und ohne Fels', () => {
    for (const arena of [BUILTIN_ARENAS[0], BUILTIN_ARENAS.find((a) => a.id === 'a18')!]) {
      for (const rocks of [[], [5]]) {
        const rng = createRng(7);
        let s = createBattle(DECK, OTHER, 'cpu', rocks, arena.cells, {}, rng);
        const played = { player: 0, cpu: 0 };
        while (!isGameOver(s)) {
          const side = s.turn;
          expect(s.hands[side].length).toBe(Math.min(DRAW_HAND_SIZE, cardsLeft(s, side)));
          s = applyMove(s, chooseCpuMove(s, rng));
          played[side]++;
        }
        expect(played.player + played.cpu).toBe(16 - rocks.length);
        expect(cardsLeft(s, 'player')).toBe(20 - played.player);
      }
    }
  });

  it('der Computer sieht weder die Gegnerkarten noch die Reihenfolge seines eigenen Decks', () => {
    const s = createBattle(DECK, toHand(CARDS.slice(40, 60).map((c) => c.id)), 'cpu', [], undefined, {}, deriveRng('y', 'deal'));
    const v = publicView(s, 'cpu');
    expect(v.hands.player.concat(v.piles!.player).every((c) => !STARTER_DECK.includes(c.cardId))).toBe(true);
    expect(ids(v.piles!.cpu)).toEqual(ids(s.piles!.cpu));
    expect(v.piles!.cpu.map((c) => c.cardId)).toEqual([...v.piles!.cpu.map((c) => c.cardId)].sort());
    expect(v.seed).toBe(0);
  });

  it('Online: beide Decks bleiben verdeckt (nur die Anzahl), die Mischzahl bleibt auf dem Server', () => {
    const { state } = startPvp('pvp-seed', [...STARTER_DECK], [...STARTER_DECK].reverse(), null, null);
    for (const seat of ['a', 'b'] as const) {
      const v = viewState(state, seat);
      expect(v.hands.player).toHaveLength(DRAW_HAND_SIZE);
      expect(v.piles!.player).toHaveLength(15);
      expect(v.piles!.player.every((c) => c.cardId === 'hidden')).toBe(true);
      expect(v.piles!.cpu.every((c) => c.cardId === 'hidden')).toBe(true);
      expect(v.seed).toBe(0);
    }
    expect(startPvp('pvp-seed', [...STARTER_DECK], [...STARTER_DECK].reverse(), null, null).state.piles).toEqual(state.piles);
  });
});

describe('Rune der Hand', () => {
  const start = (seed = 'r') => createBattle(DECK, OTHER, 'player', [], undefined, { player: 'rn06', cpu: 'rn06' }, deriveRng(seed, 'deal'));

  it('mischt alle Handkarten ins Deck und zieht genauso viele neu; der Zug bleibt beim Spieler', () => {
    const s = start();
    expect(runeUsable(s, 'player', findRune('rn06')!)).toBe(true);
    const a = applyRune(s, { rune: true });
    expect(a.turn).toBe('player');
    expect(a.moveCount).toBe(0);
    expect(a.hands.player).toHaveLength(DRAW_HAND_SIZE);
    expect(ids(all(a, 'player'))).toEqual(ids(all(s, 'player')));
    expect(a.hands.player).not.toEqual(s.hands.player);
    expect(a.runes.player!.used).toBe(true);
    expect(a.lastDraw).toBe('player');
    // The same position gives the same new hand (the server replays it).
    expect(applyRune(s, { rune: true }).hands).toEqual(a.hands);
    expect(a.log[a.log.length - 1].text).toMatch(/Rune der Hand/);
  });

  it('nicht mit leerem Deck', () => {
    const s = { ...start(), piles: { player: [], cpu: [] } };
    expect(runeUsable(s, 'player', findRune('rn06')!)).toBe(false);
    expect(runeProblem(s, { rune: true })).toMatch(/Deck ist leer/);
  });

  it('der Computer mischt nur eine klar schwache Hand neu (nach seinem eigenen Wissen)', () => {
    const weak = [...CARDS].sort((a, b) => cardPower(a) - cardPower(b));
    const weakest = toHand(weak.slice(0, 5).map((c) => c.id));
    const strongest = toHand(weak.slice(-15).map((c) => c.id));
    const bad = createBattle(DECK, [...weakest, ...strongest], 'cpu', [], undefined, { cpu: 'rn06' });
    expect(chooseCpuRune(bad, createRng(1), { level: 'medium' })).toEqual({ rune: true });
    const good = createBattle(DECK, [...strongest.slice(0, 5), ...weakest, ...strongest.slice(5)], 'cpu', [], undefined, { cpu: 'rn06' });
    expect(chooseCpuRune(good, createRng(1), { level: 'medium' })).toBeNull();
  });

  it('geprüftes Spiel: ein Duell mit Rune der Hand wird vom Server bestätigt', () => {
    for (let n = 1; n <= 4; n++) {
      const t: AdventureTicket = { id: 't', seed: `hand-${n}`, deck: [...STARTER_DECK], owned: [...STARTING_UNLOCKED], playerRune: 'rn06', cpuRune: 'random' };
      const rngs = adventureRngs(t.seed);
      let state = adventureDuel(t, handPicks(t.deck), rngs).start;
      const me = createRng(n);
      const winner = coinToss(rngs.toss);
      const first = winner === 'cpu' ? cpuChoosesFirst() : 'player';
      state = { ...state, turn: first };
      const moves: Action[] = [];
      let used = false;
      while (!isGameOver(state)) {
        let a: Action;
        if (state.turn === 'cpu') a = chooseCpuRune(state, rngs.ai, { level: 'medium' }) ?? chooseCpuMove(state, rngs.ai, { level: 'medium' });
        else if (!used) {
          used = true;
          a = { rune: true };
        } else {
          const legal = legalMoves(state);
          a = legal[Math.floor(me() * legal.length)];
        }
        moves.push(a);
        state = applyAction(state, a);
      }
      const check = checkAdventure(t, { duel: { first, moves } });
      expect(check.ok, JSON.stringify(check).slice(0, 200)).toBe(true);
      if (check.ok) expect(check.outcome).toBe(outcome(state));
    }
  });
});

describe('Balance mit Deck-Regel (v1.40)', () => {
  it('Computer-Deck: Normal, Schwer und Rangliste nur gewöhnliche Karten, Leicht gemischt', async () => {
    const { cpuDeckShare } = await import('../src/game/ai');
    const { leagueCpuHand } = await import('../src/game/verify');
    const { getCard } = await import('../src/game/cards');
    for (const level of ['medium', 'hard'] as const) {
      const d = drawCpuHand(createRng(4), 20, cpuDeckShare(level));
      expect(d).toHaveLength(20);
      expect(d.every((c) => getCard(c.cardId).rarity === 'common')).toBe(true);
    }
    expect(drawCpuHand(createRng(4), 20, cpuDeckShare('easy')).some((c) => getCard(c.cardId).rarity !== 'common')).toBe(true);
    expect(leagueCpuHand('s1').every((c) => getCard(c.cardId).rarity === 'common')).toBe(true);
  });

  it('die schwere KI rechnet auch mit 5 Handkarten bis zum Schluss schnell (kein Hängen am Spielende)', () => {
    const rng = createRng(3);
    let s = createBattle(DECK, drawCpuHand(rng), 'player', [], undefined, {}, rng);
    let slowest = 0;
    while (!isGameOver(s)) {
      const t = performance.now();
      const m = chooseCpuMove(s, rng, { level: 'hard' });
      slowest = Math.max(slowest, performance.now() - t);
      s = applyMove(s, m);
    }
    expect(slowest).toBeLessThan(1500);
  });
});

describe('Erfolge aus geprüften Duellen', () => {
  it('Runen-Einsätze des Spielers werden in der Duell-Statistik gezählt', async () => {
    const { duelStats } = await import('../src/game/campaignGoals');
    const s = createBattle(DECK, OTHER, 'player', [], undefined, { player: 'rn06', cpu: null }, deriveRng('q', 'deal'));
    const after = applyRune(s, { rune: true });
    const st = duelStats(s, [{ rune: true }, chooseCpuMove(after, createRng(1))]);
    expect(st.runes).toBe(1);
  });
});
