import { describe, expect, it } from 'vitest';
import { MissionLog, missionDeckPicks, missionRngs, missionStart } from '../src/game/verify';
import { finishTower, onlineQuestEvent, prepareTower, StoredTowerTicket } from '../src/server/engine';
import { CARDS, STARTER_DECK } from '../src/game/cards';
import { defaultSave } from '../src/game/storage';
import { emptyProgress } from '../src/game/campaignProgress';
import { coinToss, cpuChoosesFirst, isGameOver, legalMoves, applyMove } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';
import { TowerFloor, floorMission, parseFloor, setTowerFloors } from '../src/game/tower';

const floor = (n: number, status = 'active'): TowerFloor => parseFloor(`t${String(n).padStart(3, '0')}`, {
  number: n, name: `Etage ${n}`, difficulty: 'easy', arenaId: 'a01', status, reward: { type: 'coins', amount: 25 * n },
  opponent: { name: 'Gegner', level: 'easy', deck: ['c01', 'c03', 'c05', 'c08', 'c10', 'c11', 'c15', 'c20'], prefer: ['natur'] },
})!;

/** Plays a floor like the game: seeded toss and computer, random player moves. */
function play(t: StoredTowerTicket, f: TowerFloor, choices: number): MissionLog {
  const me = createRng(choices);
  const rngs = missionRngs(t.seed);
  const mission = floorMission(f);
  let state = missionStart(t, mission, f.opponent, missionDeckPicks(mission, t.deck));
  const first = coinToss(rngs.toss) === 'cpu' ? cpuChoosesFirst() : me() < 0.5 ? 'player' : 'cpu';
  state = { ...state, turn: first };
  const ai = { level: f.opponent.level, prefer: f.opponent.prefer };
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
  return { run: null, duel: { first, moves } };
}

const ticketOf = (r: ReturnType<typeof prepareTower>, seed: string): StoredTowerTicket => {
  if (!r.ok) throw new Error(r.error);
  return { ...r.ticket, id: 'x', seed } as StoredTowerTicket;
};

describe('Turm der Prüfungen über den Server', () => {
  setTowerFloors([floor(1), floor(2), floor(3), floor(4, 'draft')]);

  it('Etagen werden nicht übersprungen; Entwürfe nur im Admin-Test', () => {
    const save = defaultSave();
    expect(prepareTower(save, emptyProgress(), 0, 't002', STARTER_DECK, null, false, false)).toMatchObject({ ok: false, error: 'locked' });
    expect(prepareTower(save, emptyProgress(), 0, 't001', STARTER_DECK, null, false, false)).toMatchObject({ ok: true });
    expect(prepareTower(save, emptyProgress(), 2, 't001', STARTER_DECK, null, false, false)).toMatchObject({ ok: true });
    expect(prepareTower(save, emptyProgress(), 2, 't003', STARTER_DECK, null, false, false)).toMatchObject({ ok: true });
    expect(prepareTower(save, emptyProgress(), 3, 't004', STARTER_DECK, null, false, false)).toMatchObject({ ok: false, error: 'floor' });
    // Test mode only for admins: a player asking for it is treated like a normal player.
    expect(prepareTower(save, emptyProgress(), 0, 't003', STARTER_DECK, null, false, true)).toMatchObject({ ok: false, error: 'locked' });
    const t = prepareTower(save, emptyProgress(), 0, 't004', STARTER_DECK, null, true, true);
    expect(t).toMatchObject({ ok: true, ticket: { test: true } });
    expect(prepareTower(save, emptyProgress(), 0, 't001', ['c01'], null, false, false)).toMatchObject({ ok: false, error: 'deck' });
  });

  it('nur ein nachgespielter Sieg zahlt die Belohnung; Testläufe zahlen nie', () => {
    const f = floor(1);
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 30 && (wins === 0 || losses === 0); i++) {
      const t = ticketOf(prepareTower(defaultSave(), emptyProgress(), 0, 't001', STARTER_DECK, null, false, false), `s${i}`);
      const r = finishTower(t, play(t, f, i), defaultSave());
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      if (r.won) {
        wins++;
        expect(r.save?.coins).toBe(defaultSave().coins + 25);
        expect(r.granted[0].coins).toBe(25);
        const test = { ...t, test: true };
        const rt = finishTower(test, play(t, f, i), defaultSave());
        expect(rt).toMatchObject({ ok: true, won: true, save: null, granted: [] });
      } else {
        losses++;
        expect(r.save).toBeNull();
      }
    }
    expect(wins).toBeGreaterThan(0);
  });

  it('Erfolge: Turm-Kämpfe und Online-Duelle zählen auch Rune-Einsätze', () => {
    const t = ticketOf(prepareTower(defaultSave(), emptyProgress(), 0, 't001', STARTER_DECK, null, false, false), 'q1');
    const r = finishTower(t, play(t, floor(1), 1), defaultSave());
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.quest.runesUsed).toBe('number');
    expect(onlineQuestEvent(true, true).runesUsed).toBe(1);
    expect(onlineQuestEvent(false).runesUsed).toBe(0);
  });

  it('eine Karte als Etagen-Belohnung (Etage 50/100) wird beim Sieg freigeschaltet', () => {
    const t = ticketOf(prepareTower(defaultSave(), emptyProgress(), 0, 't001', STARTER_DECK, null, false, false), 'card');
    const cardId = CARDS.find((c) => !defaultSave().unlocked.includes(c.id))!.id;
    const withCard = { ...t, reward: { type: 'card' as const, cardId } };
    for (let i = 0; i < 40; i++) {
      const r = finishTower({ ...withCard, seed: `card${i}` }, play({ ...withCard, seed: `card${i}` }, floor(1), i), defaultSave());
      if (r.ok && r.won) {
        expect(r.save?.unlocked).toContain(cardId);
        expect(r.granted[0].cards).toEqual([cardId]);
        return;
      }
    }
    throw new Error('kein Sieg in 40 Versuchen');
  });

  it('ein gefälschtes Protokoll wird abgelehnt', () => {
    const t = ticketOf(prepareTower(defaultSave(), emptyProgress(), 0, 't001', STARTER_DECK, null, false, false), 'fake');
    expect(finishTower(t, { run: null, duel: { first: 'player', moves: [] } }, defaultSave()).ok).toBe(false);
    expect(finishTower(t, null as never, defaultSave()).ok).toBe(false);
  });
});
