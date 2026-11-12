import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_NIGHTMARE, nightmareTicket, parseNightmare, setNightmareConfig, ticketNightmare } from '../src/game/nightmare';
import { AdventureTicket, adventureDuel, adventureRngs, checkAdventure, handPicks, simpleCpuDeck } from '../src/game/verify';
import { CARDS, RARITY_ORDER, STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyMove, coinToss, cpuChoosesFirst, isGameOver, legalMoves, outcome } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';
import { aiCoins, computeReward, isAiLevel } from '../src/game/rewards';
import { prepareAdventure } from '../src/server/engine';
import { defaultSave } from '../src/game/storage';

const rank = (id: string) => RARITY_ORDER[CARDS.find((c) => c.id === id)!.rarity];

afterEach(() => setNightmareConfig(DEFAULT_NIGHTMARE));

describe('Schwierigkeit „Albtraum“', () => {
  it('Einstellungen werden geprüft', () => {
    expect(parseNightmare({ deckBoost: 9, valueBonus: -3, coins: { win: 'x', draw: 5, loss: 99999 } }))
      .toEqual({ deckBoost: 2, valueBonus: 0, coins: { win: 250, draw: 5, loss: 10000 } });
    expect(parseNightmare(null)).toEqual(DEFAULT_NIGHTMARE);
    expect(isAiLevel('nightmare')).toBe(true);
  });
  it('die KI bekommt Karten mindestens so selten wie die des Spielers, mit Bonus auf den Werten', () => {
    const deck = [...STARTER_DECK];
    const plain = simpleCpuDeck(createRng(4), 'nightmare', deck, { deckBoost: 1, valueBonus: 0 });
    const avg = (ids: string[]) => ids.reduce((s, id) => s + rank(id), 0) / ids.length;
    expect(avg(plain.map((c) => c.cardId))).toBeGreaterThan(avg(deck));
    expect(plain.every((c) => c.mod === 0)).toBe(true);
    const bonus = simpleCpuDeck(createRng(4), 'nightmare', deck, { deckBoost: 0, valueBonus: 2 });
    expect(bonus.every((c) => c.mod === 2)).toBe(true);
    expect(bonus.some((c) => deck.includes(c.cardId))).toBe(false);
  });
  it('Münzen kommen aus den Admin-Einstellungen', () => {
    expect(aiCoins('nightmare')).toEqual({ win: 250, draw: 100, loss: 40 });
    setNightmareConfig({ ...DEFAULT_NIGHTMARE, coins: { win: 400, draw: 150, loss: 60 } });
    expect(computeReward('win', 'nightmare').coins).toBe(400);
    expect(computeReward('win', 'hard').coins).toBe(150);
  });
  it('das Ticket behält die Einstellungen vom Spielstart; der Server spielt die Partie damit genau nach', () => {
    setNightmareConfig({ ...DEFAULT_NIGHTMARE, deckBoost: 1, valueBonus: 1 });
    const prep = prepareAdventure(defaultSave(), null, [...STARTER_DECK], null, false, 'nightmare');
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.ticket.nightmare).toEqual({ deckBoost: 1, valueBonus: 1 });
    const t: AdventureTicket = { ...(prep.ticket as AdventureTicket), id: 't', seed: 'albtraum-1', owned: [...STARTING_UNLOCKED] };
    // The admin changes the settings during the game: the replay still uses the ticket's values.
    setNightmareConfig({ ...DEFAULT_NIGHTMARE, deckBoost: 2, valueBonus: 0 });
    const me = createRng(7);
    const rngs = adventureRngs(t.seed);
    let state = adventureDuel(t, handPicks(t.deck), rngs).start;
    expect([...state.hands.cpu, ...(state.piles?.cpu ?? [])].every((c) => c.mod === 1)).toBe(true);
    const first = coinToss(rngs.toss) === 'cpu' ? cpuChoosesFirst() : 'player';
    state = { ...state, turn: first };
    const moves: Action[] = [];
    const ai = { level: 'nightmare' } as const;
    while (!isGameOver(state)) {
      if (state.turn === 'cpu') {
        const a: Action = chooseCpuRune(state, rngs.ai, ai) ?? chooseCpuMove(state, rngs.ai, ai);
        moves.push(a);
        state = applyAction(state, a);
      } else {
        const legal = legalMoves(state);
        const m = legal[Math.floor(me() * legal.length)];
        moves.push(m);
        state = applyMove(state, m);
      }
    }
    const check = checkAdventure(t, { duel: { first, moves } });
    expect(check.ok, JSON.stringify(check)).toBe(true);
    if (check.ok) expect(check.outcome).toBe(outcome(state));
    // The same moves do not fit a ticket with other Albtraum values.
    expect(checkAdventure({ ...t, nightmare: { deckBoost: 2, valueBonus: 0 } }, { duel: { first, moves } }).ok).toBe(false);
    expect(ticketNightmare(undefined)).toEqual(nightmareTicket(DEFAULT_NIGHTMARE));
  });
});
