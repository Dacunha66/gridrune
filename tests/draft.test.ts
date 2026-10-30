import { describe, expect, it } from 'vitest';
import {
  DRAFT_DECK_SIZE, DRAFT_POOL_PLAN, DRAFT_POOL_SIZE, completeDraftDeck, computerDraftHand, draftLayout, draftPool, replayDraftRun, validDraftDeck,
} from '../src/game/draft';
import { CARDS, getCard } from '../src/game/cards';
import { RunnerSim } from '../src/game/runner';
import { createRng } from '../src/game/rng';
import { startPvp } from '../src/game/pvp';

describe('Draft-Liga: Regeln', () => {
  it('Pool: 30 verschiedene Karten nach Bauplan, gleich für beide, unabhängig vom Seed-Aufrufer', () => {
    const pool = draftPool('seed-1');
    expect(pool.length).toBe(DRAFT_POOL_SIZE);
    expect(new Set(pool).size).toBe(DRAFT_POOL_SIZE);
    expect(draftPool('seed-1')).toEqual(pool);
    expect(draftPool('seed-2')).not.toEqual(pool);
    const count = (r: string) => pool.filter((id) => getCard(id).rarity === r).length;
    // Built-in catalogue has enough cards of each rarity for the plan.
    for (const [r, n] of Object.entries(DRAFT_POOL_PLAN)) if (CARDS.filter((c) => c.rarity === r && !c.rewardOnly).length >= n!) expect(count(r)).toBe(n);
    expect(count('mythic')).toBe(0);
  });

  it('Deck: nur 20 verschiedene Karten aus dem Pool; Auffüllen nimmt die stärksten', () => {
    const pool = draftPool('seed-3');
    const deck = completeDraftDeck(pool, pool.slice(0, 5));
    expect(deck.length).toBe(DRAFT_DECK_SIZE);
    expect(deck.slice(0, 5)).toEqual(pool.slice(0, 5));
    expect(validDraftDeck(deck, pool)).toBe(true);
    expect(validDraftDeck(deck.slice(1), pool)).toBe(false);
    expect(validDraftDeck([...deck.slice(1), deck[1]], pool)).toBe(false);
  });

  it('Strecke: jede legendäre Karte im Deck wird an einem Tor angeboten; Steine/Funde für beide gleich', () => {
    for (let s = 0; s < 40; s++) {
      const pool = draftPool(`legend-${s}`);
      const legends = pool.filter((id) => getCard(id).rarity === 'legendary');
      const deck = completeDraftDeck(pool, legends);
      const layout = draftLayout(`legend-${s}`, 'a', deck);
      const offered = new Set(layout.gates.flatMap((g) => g.offers.map((o) => o.cardId)));
      for (const id of legends) expect(offered.has(id)).toBe(true);
      const other = draftLayout(`legend-${s}`, 'b', completeDraftDeck(pool, []));
      expect(other.obstacles).toEqual(layout.obstacles);
      expect(other.gates.map((g) => g.offers.find((o) => o.kind === 'discovery')?.cardId)).toEqual(layout.gates.map((g) => g.offers.find((o) => o.kind === 'discovery')?.cardId));
    }
  });

  it('Lauf wird vom Server nachgespielt (gleiche 8 Karten), Manipulation abgelehnt', () => {
    const pool = draftPool('run-1');
    const deck = completeDraftDeck(pool);
    const layout = draftLayout('run-1', 'a', deck);
    const me = createRng(5);
    const sim = new RunnerSim(layout);
    let steps = 0;
    while (!sim.finished && steps++ < 5000) {
      if (me() < 0.04) sim.moveLane(me() < 0.5 ? -1 : 1);
      sim.update(1 / 30);
    }
    const r = replayDraftRun(layout, { inputs: sim.inputs.slice(), skippedAt: null });
    expect(r.error).toBeNull();
    expect(r.picks).toEqual(sim.picks);
    expect(replayDraftRun(layout, { inputs: [{ d: 10, lane: 1 }], skippedAt: null }).error).not.toBeNull();
    // Time ran out: everything taken automatically.
    expect(replayDraftRun(layout, { inputs: [], skippedAt: 0 }).picks.length).toBe(8);
    // Duel start with the run's penalties.
    const { state } = startPvp('run-1', r.picks.map((p) => ({ cardId: p.cardId, mod: p.mod })), computerDraftHand(draftLayout('run-1', 'b', completeDraftDeck(pool))), null, null);
    expect(state.hands.player.map((h) => h.mod)).toEqual(r.picks.map((p) => p.mod));
    expect(state.hands.cpu.length).toBe(8);
  });
});
