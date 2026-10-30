import { describe, expect, it } from 'vitest';
import { CAMPAIGN, Mission, setCampaign, mergeContent } from '../src/game/campaign';
import { CampaignProgress, emptyProgress, missionProgress, sanitizeProgress } from '../src/game/campaignProgress';
import { owedRewards, payRewards } from '../src/game/campaignRewards';
import { MissionLog, handPicks, missionRngs, missionStart, adventureRunner } from '../src/game/verify';
import { claimCampaign, finishMission, prepareMission, buyPackServer, buySkinServer, StoredMissionTicket } from '../src/server/engine';
import { STARTER_DECK } from '../src/game/cards';
import { defaultSave } from '../src/game/storage';
import { suggestHand, missionPool } from '../src/game/campaign';
import { coinToss, cpuChoosesFirst, isGameOver, legalMoves, applyMove } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';
import { Pick } from '../src/game/runner';

const content = () => mergeContent({});
const won = (ids: string[]): CampaignProgress => {
  const p = emptyProgress();
  for (const id of ids) p.missions[id] = { ...missionProgress(p, id), wins: 1 };
  return p;
};

/** Plays a mission like the game: seeded toss and computer, random player moves. */
function playMission(t: StoredMissionTicket, mission: Mission, choices: number): MissionLog {
  const me = createRng(choices);
  const rngs = missionRngs(t.seed);
  const opponent = CAMPAIGN.opponents.find((o) => o.id === mission.opponentId)!;
  let picks: Pick[];
  let run: MissionLog['run'] = null;
  if (mission.mode === 'runner') {
    const sim = adventureRunner(t, rngs.runner);
    let steps = 0;
    while (!sim.finished && steps++ < 5000) {
      if (me() < 0.04) sim.moveLane(me() < 0.5 ? -1 : 1);
      sim.update(1 / 30);
    }
    picks = sim.picks.slice();
    run = { inputs: sim.inputs.slice(), skippedAt: null };
  } else picks = handPicks(t.hand!);
  let state = missionStart(t, mission, opponent, picks);
  const winner = coinToss(rngs.toss);
  const first = winner === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const ai = { level: opponent.level, prefer: opponent.prefer };
  const moves: Action[] = [];
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
  return { run, duel: { first, moves } };
}

describe('Kampagne über den Server (Phase 4c)', () => {
  setCampaign(content());

  it('Belohnungen: erster Sieg, Sterne und Meilensteine werden genau einmal gezahlt', () => {
    const c = content();
    const m = { ...c.missions[0], firstReward: { type: 'coins', amount: 100 }, goalRewards: [{ type: 'coins', amount: 50 }, { type: 'alt_art' }, null] } as Mission;
    const cc = { ...c, missions: [m, ...c.missions.slice(1)] };
    const p = won([m.id]);
    p.missions[m.id].stars = [true, true, false];
    const owed = owedRewards(p, cc).filter((o) => o.key.startsWith('first:') || o.key.startsWith('goal:'));
    expect(owed.map((o) => o.key)).toEqual([`first:${m.id}`, `goal:${m.id}:0`]);
    const r = payRewards(defaultSave(), p, owed, createRng(1));
    expect(r.save.coins).toBe(150);
    expect(owedRewards(r.progress, cc).some((o) => o.key.startsWith('first:') || o.key.startsWith('goal:'))).toBe(false);
    // "paid" survives the sanitizer (device copy / server storage)
    expect(sanitizeProgress(JSON.parse(JSON.stringify(r.progress))).paid).toEqual(r.progress.paid);
  });

  it('Nachzahlung für alte Sterne nur einmal', () => {
    const p = won(['m001', 'm002', 'm003', 'm004', 'm005']);
    for (const id of Object.keys(p.missions)) p.missions[id].stars = [true, true, false];
    const first = claimCampaign(defaultSave(), p, 'seed-a');
    if (first) {
      expect(first.granted.length).toBeGreaterThan(0);
      expect(claimCampaign(first.save, first.campaign, 'seed-b')).toBeNull();
    } else {
      // Built-in content may carry no payable rewards – then nothing is owed at all.
      expect(owedRewards(p, CAMPAIGN)).toEqual([]);
    }
  });

  it('gesperrte Missionen, fremde Karten und falsche Hände werden abgelehnt', () => {
    const save = defaultSave();
    const m1 = CAMPAIGN.missions.find((m) => m.id === 'm001')!;
    const hand = suggestHand(m1, missionPool(m1, STARTER_DECK)).map((c) => c.cardId);
    expect(prepareMission(save, emptyProgress(), 'm002', STARTER_DECK, hand, null, false)).toMatchObject({ ok: false, error: 'mission' });
    expect(prepareMission(save, emptyProgress(), 'm001', STARTER_DECK, ['x99', ...hand.slice(1)], null, false)).toMatchObject({ ok: false, error: 'hand' });
    expect(prepareMission(save, emptyProgress(), 'm001', ['c01'], hand, null, false)).toMatchObject({ ok: false, error: 'deck' });
    expect(prepareMission(save, emptyProgress(), 'm001', STARTER_DECK, hand, null, false)).toMatchObject({ ok: true });
  });

  it('ehrlich gespielte Missionen (Duell und Lauf) werden bestätigt und gespeichert', () => {
    const save = defaultSave();
    for (const [id, before] of [['m001', emptyProgress()], ['m006', won(['m001', 'm002', 'm003', 'm004', 'm005'])]] as const) {
      const mission = CAMPAIGN.missions.find((m) => m.id === id)!;
      const hand = suggestHand(mission, missionPool(mission, STARTER_DECK)).map((c) => c.cardId);
      for (let s = 1; s <= 6; s++) {
        const prep = prepareMission(save, before, id, STARTER_DECK, hand, null, false);
        expect(prep.ok).toBe(true);
        if (!prep.ok) continue;
        const t = { ...prep.ticket, id: 't', seed: `seed-${id}-${s}` };
        const log = playMission(t, mission, s);
        const r = finishMission(t, log, save, before);
        expect(r.ok, JSON.stringify(r)).toBe(true);
        if (!r.ok) continue;
        const mp = missionProgress(r.campaign, id);
        expect(mp.wins + mp.draws + mp.losses).toBe(1);
        expect(mp.wins === 1).toBe(r.outcome === 'win');
        // Tampering: an extra move or a changed one is refused.
        const bad = structuredClone(log);
        bad.duel.moves.push(bad.duel.moves[0]);
        expect(finishMission(t, bad, save, before)).toMatchObject({ ok: false });
      }
    }
  });
});

describe('Shop über den Server (Phase 4b)', () => {
  it('Pack: Münzen werden abgezogen, Karten gezogen; zu wenig Münzen = Ablehnung', () => {
    const rich = { ...defaultSave(), coins: 1000 };
    const r = buyPackServer(rich, 'abenteurer', 'seed-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards.length).toBe(3);
      expect(r.save.coins).toBe(1000 - 150 + r.cards.reduce((n, c) => n + c.refund, 0));
    }
    expect(buyPackServer(defaultSave(), 'abenteurer', 'seed-1')).toMatchObject({ ok: false });
    expect(buyPackServer(rich, 'gibtsnicht', 'seed-1')).toMatchObject({ ok: false });
  });
  it('Skin: nur einmal kaufbar', () => {
    const r = buySkinServer({ ...defaultSave(), coins: 5000 }, 'card-smaragd');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.coins).toBe(4750);
      expect(buySkinServer(r.save, 'card-smaragd')).toMatchObject({ ok: false });
    }
  });
});
