import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CardDef, STARTER_DECK, getCard, setCardCatalog } from '../src/game/cards';
import { HAND_SIZE, Move, applyMove, createBattle, isGameOver, legalMoves, toHand } from '../src/game/battle';
import { ARENAS, BUILTIN_ARENAS, setArenas } from '../src/game/arenas';
import { chooseCpuMove } from '../src/game/ai';
import { createRng } from '../src/game/rng';
import {
  BUILTIN_MISSIONS, BUILTIN_OPPONENTS, BUILTIN_WORLDS, CampaignContent, Mission, mergeContent, missionPool, missionProblems, nextMissionId,
  parseMission, parseOpponent, parseWorld, suggestHand, worldProblems,
} from '../src/game/campaign';
import { DuelStats, Goal, duelStats, goalMet, goalProblems } from '../src/game/campaignGoals';
import {
  emptyProgress, loadProgress, missionStars, missionUnlocked, recordResult, sanitizeProgress, worldPercent, worldStars, worldUnlocked, writeProgress,
} from '../src/game/campaignProgress';

// The live card database gives these cards their effects (built-in cards have none).
const LIVE: CardDef[] = BUILTIN_CARDS.map((c) =>
  c.id === 'c01' ? { ...c, effect: 'naturbund' } : c.id === 'c06' ? { ...c, effect: 'wurzelkraft' } : c.id === 'c04' ? { ...c, effect: 'schwaechender_blick' } : c,
);

beforeEach(() => {
  setCardCatalog(LIVE);
  setArenas([]);
});
afterEach(() => setCardCatalog(BUILTIN_CARDS));

const content = (): CampaignContent => mergeContent({});

function stats(over: Partial<DuelStats> = {}): DuelStats {
  return { outcome: 'win', fields: 9, margin: 2, captures: 0, played: {}, terrainBonus: 0, effects: {}, stumbles: null, ...over };
}

/** Plays a full duel with two computer players (the "player" side uses the medium AI too). */
function playOut(playerIds: string[], cpuIds: string[], terrain = BUILTIN_ARENAS[0].cells, seed = 1) {
  const start = createBattle(toHand(playerIds), toHand(cpuIds), 'player', [], terrain);
  const rng = createRng(seed);
  let s = start;
  const moves: Move[] = [];
  while (!isGameOver(s)) {
    const m = chooseCpuMove(s, rng, { level: s.turn === 'cpu' ? 'hard' : 'medium' });
    moves.push(m);
    s = applyMove(s, m);
  }
  return { start, moves, end: s };
}

describe('Kampagne: Flüsterwald', () => {
  it('die eingebaute Testwelt hat keine Fehler (nur bestehende Karten, erreichbare Ziele)', () => {
    const c = content();
    const errors = worldProblems(BUILTIN_WORLDS[0], c).filter((p) => p.level === 'error');
    expect(errors).toEqual([]);
    expect(BUILTIN_MISSIONS).toHaveLength(10);
    expect(BUILTIN_MISSIONS.map((m) => m.kind)).toEqual(['tutorial', 'normal', 'normal', 'normal', 'special', 'normal', 'normal', 'elite', 'elite', 'boss']);
    for (const o of BUILTIN_OPPONENTS) {
      expect(o.deck).toHaveLength(HAND_SIZE);
      expect(new Set(o.deck).size).toBe(HAND_SIZE);
      for (const id of o.deck) expect(getCard(id).id).toBe(id);
    }
    // 30 stars, the last milestone at exactly 30.
    expect(BUILTIN_MISSIONS.reduce((n, m) => n + m.goals.length, 0)).toBe(30);
    expect(Math.max(...BUILTIN_WORLDS[0].milestones.map((m) => m.stars))).toBe(30);
  });

  it('jede Mission beginnt mit dem Ziel „gewinnen“ und hat feste Ziel-IDs', () => {
    const ids = new Set<string>();
    for (const m of BUILTIN_MISSIONS) {
      expect(m.goals[0].type).toBe('win');
      for (const g of m.goals) ids.add(g.id);
    }
    expect(ids.size).toBe(30);
  });

  it('fehlende Karten und unmögliche Ziele werden gemeldet', () => {
    const c = content();
    const m: Mission = { ...BUILTIN_MISSIONS[0], goals: [...BUILTIN_MISSIONS[0].goals.slice(0, 2), { id: 'x', type: 'terrain_bonus', n: 1 }] };
    expect(missionProblems(m, c).some((p) => p.level === 'error' && /Gelände/.test(p.text))).toBe(true);
    const o = { ...BUILTIN_OPPONENTS[0], deck: ['c01', 'zz99'] };
    const c2 = { ...c, opponents: [o, ...c.opponents.slice(1)] };
    const errs = missionProblems(BUILTIN_MISSIONS[0], c2).filter((p) => p.level === 'error').map((p) => p.text);
    expect(errs.some((t) => /2 statt 8/.test(t))).toBe(true);
    expect(errs.some((t) => /zz99/.test(t))).toBe(true);
    // Mooslichtung has 6 forest fields – 7 terrain bonuses are impossible.
    const seven: Mission = { ...BUILTIN_MISSIONS[2], goals: [BUILTIN_MISSIONS[2].goals[0], { id: 'y', type: 'terrain_bonus', n: 7 }] };
    expect(missionProblems(seven, c).some((p) => p.level === 'error' && /nur 6 Geländefelder/.test(p.text))).toBe(true);
    // Only Krieger allowed in a forest arena: no card gets a terrain bonus there.
    const krieger: Mission = { ...BUILTIN_MISSIONS[2], onlyClass: 'krieger', goals: [BUILTIN_MISSIONS[2].goals[0], { id: 'z', type: 'terrain_bonus', n: 1 }] };
    expect(missionProblems(krieger, c).some((p) => p.level === 'error' && /Keine aktive Karte bekommt|keinen Bonus/.test(p.text))).toBe(true);
  });

  it('unerreichbare Freischalt-Bedingungen und Kreise werden erkannt', () => {
    const c = content();
    const w2 = { ...BUILTIN_WORLDS[0], id: 'w02', name: 'Zwei', unlock: { minStars: 99 }, milestones: [] };
    const w1 = { ...BUILTIN_WORLDS[0], unlock: { afterWorld: 'w02' } };
    const c2 = { ...c, worlds: [w1, { ...w2, unlock: { afterWorld: 'w01', minStars: 99 } }] };
    const p1 = worldProblems(w1, c2).map((p) => p.text);
    expect(p1.some((t) => /Kreis/.test(t))).toBe(true);
    const p2 = worldProblems(c2.worlds[1], c2).map((p) => p.text);
    expect(p2.some((t) => /99 ★/.test(t))).toBe(true);
    const m = { ...BUILTIN_MISSIONS[1], minWorldStars: 10 };
    expect(missionProblems(m, c).some((p) => /nur 3 erreichbar/.test(p.text))).toBe(true);
  });
});

describe('Kampagne: Sterne-Ziele', () => {
  it('alle Zusatzziele brauchen einen Sieg', () => {
    const goal: Goal = { id: 'g', type: 'min_fields', n: 10 };
    expect(goalMet(goal, stats({ fields: 11 }))).toBe(true);
    expect(goalMet(goal, stats({ fields: 11, outcome: 'draw' }))).toBe(false);
    expect(goalMet({ id: 'g', type: 'without_class', n: 0, cls: 'magier' }, stats({ played: { natur: 8 } }))).toBe(true);
    expect(goalMet({ id: 'g', type: 'without_class', n: 0, cls: 'magier' }, stats({ played: { magier: 1 } }))).toBe(false);
    expect(goalMet({ id: 'g', type: 'runner_clean', n: 0 }, stats({ stumbles: 0 }))).toBe(true);
    expect(goalMet({ id: 'g', type: 'runner_clean', n: 0 }, stats({ stumbles: 1 }))).toBe(false);
    expect(goalMet({ id: 'g', type: 'runner_clean', n: 0 }, stats({ stumbles: null }))).toBe(false);
  });

  it('Nachspielen der Züge ergibt dieselben Werte wie das Duell', () => {
    const { start, moves, end } = playOut(STARTER_DECK.slice(0, 8), BUILTIN_OPPONENTS[1].deck);
    const st = duelStats(start, moves);
    let player = 0;
    let cpu = 0;
    for (const c of end.board) if (c) (c.owner === 'player' ? player++ : cpu++);
    expect(st.fields).toBe(player);
    expect(st.margin).toBe(player - cpu);
    expect(Object.values(st.played).reduce((a, b) => a + (b ?? 0), 0)).toBe(8);
    // Captures: count every flip of the player's own moves.
    let s = start;
    let caps = 0;
    for (const m of moves) {
      const side = s.turn;
      s = applyMove(s, m);
      if (side === 'player') caps += s.lastFlips.length;
    }
    expect(st.captures).toBe(caps);
  });

  it('Geländebonus: Naturkarte auf Wald zählt (Element), Krieger auf Wald nicht', () => {
    const forest = ARENAS.find((a) => a.id === 'a07')!.cells;
    const start = createBattle(toHand(['c09', 'c03', 'c02', 'c05', 'c07', 'c08', 'c10', 'c11']), toHand(BUILTIN_OPPONENTS[0].deck), 'player', [], forest);
    expect(duelStats(start, [{ handIndex: 0, cell: 0 }]).terrainBonus).toBe(1);
    expect(duelStats(start, [{ handIndex: 1, cell: 0 }]).terrainBonus).toBe(0);
  });

  it('Geländebonus: Sumpfechse auf einem Waldfeld zählt einmal, auf normalem Feld nicht', () => {
    const forest = ARENAS.find((a) => a.id === 'a07')!.cells;
    const hand = ['c06', 'c01', 'c02', 'c03', 'c05', 'c07', 'c08', 'c09'];
    const start = createBattle(toHand(hand), toHand(BUILTIN_OPPONENTS[0].deck), 'player', [], forest);
    expect(forest[0]).toBe('wald');
    const onForest = duelStats(start, [{ handIndex: 0, cell: 0 }]);
    expect(onForest.terrainBonus).toBe(1);
    // Terrain gives at most +1: Wurzelkraft does not work on top of the element bonus.
    expect(onForest.effects.wurzelkraft ?? 0).toBe(0);
    const onNormal = duelStats(start, [{ handIndex: 0, cell: 1 }]);
    expect(onNormal.terrainBonus).toBe(0);
  });

  it('Naturbund zählt nur, wenn eine eigene Naturkarte angrenzt', () => {
    const start = createBattle(toHand(['c09', 'c01', 'c02', 'c03', 'c05', 'c07', 'c08', 'c10']), toHand(BUILTIN_OPPONENTS[1].deck));
    const cpuMove = (s: ReturnType<typeof createBattle>) => legalMoves(s).find((m) => m.cell === 15)!;
    const s1 = applyMove(start, { handIndex: 0, cell: 0 });
    const s2 = applyMove(s1, cpuMove(s1));
    const next = duelStats(start, [{ handIndex: 0, cell: 0 }, cpuMove(s1), { handIndex: 0, cell: 1 }]);
    expect(next.effects.naturbund).toBe(1);
    const apart = duelStats(start, [{ handIndex: 0, cell: 0 }, cpuMove(s1), { handIndex: 0, cell: 10 }]);
    expect(apart.effects.naturbund ?? 0).toBe(0);
    expect(s2.turn).toBe('player');
  });

  it('Ziele, die einem einfachen Sieg entsprechen, oder unmögliche Zahlen werden gemeldet', () => {
    const ctx = { runner: false, terrain: BUILTIN_ARENAS[0].cells, rocks: 0 };
    expect(goalProblems({ id: 'g', type: 'min_fields', n: 9 }, ctx).warnings.join()).toMatch(/einfachen Sieg/);
    expect(goalProblems({ id: 'g', type: 'min_fields', n: 17 }, ctx).errors.length).toBeGreaterThan(0);
    expect(goalProblems({ id: 'g', type: 'runner_clean', n: 0 }, ctx).errors.join()).toMatch(/Lauf/);
    expect(goalProblems({ id: 'g', type: 'terrain_bonus', n: 1 }, ctx).errors.join()).toMatch(/kein Gelände/);
    expect(goalProblems({ id: 'g', type: 'play_class', n: 2, cls: 'feuer' }, { ...ctx, onlyClass: 'natur' }).errors.length).toBe(1);
  });
});

describe('Kampagne: Fortschritt', () => {
  it('Sterne gehen nie verloren – auch nicht bei schlechterem Ergebnis oder geänderten Zielen', () => {
    const m = BUILTIN_MISSIONS[1];
    let p = emptyProgress();
    const r1 = recordResult(p, m, stats({ fields: 11, captures: 6 }));
    expect(r1.newStars).toEqual([0, 1, 2]);
    expect(r1.firstWin).toBe(true);
    p = r1.progress;
    const r2 = recordResult(p, m, stats({ outcome: 'loss', fields: 3 }));
    expect(r2.newStars).toEqual([]);
    expect(missionStars(r2.progress, m)).toBe(3);
    // Admin replaces goal 3 with a new goal (new id): the star stays.
    const edited = { ...m, goals: [m.goals[0], m.goals[1], { id: 'neu', type: 'min_fields' as const, n: 14 }] };
    expect(missionStars(r2.progress, edited)).toBe(3);
    expect(r2.progress.missions[m.id].wins).toBe(1);
    expect(r2.progress.missions[m.id].losses).toBe(1);
  });

  it('neue Sterne werden nur einmal gemeldet (kein zweites Mal bei Wiederholung)', () => {
    const m = BUILTIN_MISSIONS[1];
    const r1 = recordResult(emptyProgress(), m, stats({ captures: 6 }));
    expect(r1.newStars).toEqual([0, 1]);
    const r2 = recordResult(r1.progress, m, stats({ captures: 6 }));
    expect(r2.newStars).toEqual([]);
    expect(r2.firstWin).toBe(false);
    const r3 = recordResult(r2.progress, m, stats({ fields: 10 }));
    expect(r3.newStars).toEqual([2]);
  });

  it('Missionen öffnen sich nacheinander; Weltfortschritt in %', () => {
    const c = content();
    let p = emptyProgress();
    expect(missionUnlocked(c, p, BUILTIN_MISSIONS[0])).toBe(true);
    expect(missionUnlocked(c, p, BUILTIN_MISSIONS[1])).toBe(false);
    p = recordResult(p, BUILTIN_MISSIONS[0], stats()).progress;
    expect(missionUnlocked(c, p, BUILTIN_MISSIONS[1])).toBe(true);
    expect(worldPercent(c, p, 'w01')).toBe(10);
    expect(worldStars(c, p, 'w01')).toBe(1);
    // A drafted (unpublished) mission is skipped for players.
    const c2 = { ...c, missions: c.missions.map((m) => (m.id === 'm002' ? { ...m, status: 'draft' as const } : m)) };
    expect(missionUnlocked(c2, p, BUILTIN_MISSIONS[2])).toBe(true);
    const w2 = { ...BUILTIN_WORLDS[0], id: 'w02', unlock: { afterWorld: 'w01' } };
    expect(worldUnlocked(c, p, w2)).toBe(false);
  });

  it('Speicherstand ist robust und getrennt vom normalen Spielstand', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const p = recordResult(emptyProgress(), BUILTIN_MISSIONS[0], stats()).progress;
    expect(writeProgress(p, store)).toBe(true);
    expect([...mem.keys()]).toEqual(['gridrune/campaign-v1']);
    expect(loadProgress(store)).toEqual(p);
    mem.set('gridrune/campaign-v1', '{kaputt');
    expect(loadProgress(store)).toEqual(emptyProgress());
    expect(sanitizeProgress({ missions: { m001: { wins: -3, stars: [true, 'x'], goalsMet: [1, 'a'] }, böse: {} } }).missions).toEqual({
      m001: { wins: 0, draws: 0, losses: 0, stars: [true, false, false], goalsMet: ['a'], firstWinAt: null, lastPlayedAt: null },
    });
  });
});

describe('Kampagne: Karten des Spielers', () => {
  it('Spezialmission „nur Natur“: eigene Naturkarten plus gewöhnliche Leihkarten, nie stärkere', () => {
    const m = BUILTIN_MISSIONS[4];
    const pool = missionPool(m, ['c02', 'c03', 'c01', 'u06']);
    expect(pool.filter((c) => !c.loan).map((c) => c.cardId)).toEqual(['c01', 'u06']);
    const loans = pool.filter((c) => c.loan);
    expect(loans.length).toBe(6);
    for (const l of loans) {
      expect(getCard(l.cardId).rarity).toBe('common');
      expect(getCard(l.cardId).cls).toBe('natur');
    }
    expect(suggestHand(m, pool)).toHaveLength(8);
  });

  it('Vorschlag erfüllt Klassen-Ziele und meidet verbotene Klassen', () => {
    const m = BUILTIN_MISSIONS[0];
    const hand = suggestHand(m, missionPool(m, STARTER_DECK));
    expect(hand).toHaveLength(8);
    expect(hand.filter((c) => getCard(c.cardId).cls === 'natur').length).toBeGreaterThanOrEqual(2);
    const m7 = BUILTIN_MISSIONS[6];
    const hand7 = suggestHand(m7, missionPool(m7, STARTER_DECK));
    expect(hand7.some((c) => getCard(c.cardId).cls === 'schatten')).toBe(false);
    const m3 = BUILTIN_MISSIONS[2];
    expect(suggestHand(m3, missionPool(m3, STARTER_DECK)).some((c) => c.cardId === 'c06')).toBe(true);
  });
});

describe('Kampagne: Daten aus der Datenbank', () => {
  it('ungültige Dokumente werden abgelehnt oder bereinigt', () => {
    expect(parseWorld('x1', { name: 'A' })).toBeNull();
    expect(parseWorld('w02', { name: '' })).toBeNull();
    const w = parseWorld('w02', { name: 'Zwei', status: 'hack', milestones: [{ stars: 5, reward: { type: 'coins', amount: 1e9 } }, { stars: 1, reward: { type: 'evil' } }] })!;
    expect(w.status).toBe('draft');
    expect(w.milestones).toEqual([{ stars: 5, reward: { type: 'coins', amount: 100000 } }]);
    const m = parseMission('m011', { name: 'Neu', worldId: 'w01', goals: [{ id: 'a', type: 'min_fields', n: 99 }, { id: 'b', type: 'bogus' }] })!;
    expect(m.goals.map((g) => g.type)).toEqual(['win', 'min_fields']);
    expect(m.goals[1].n).toBe(16);
    expect(parseOpponent('o011', { name: 'G', deck: ['c01', 'c01', 'c02', 5], level: 'godlike' })).toMatchObject({ deck: ['c01', 'c02'], level: 'medium' });
    expect(nextMissionId(['m001', 'm010'])).toBe('m011');
  });

  it('gespeicherte Inhalte ersetzen die eingebauten (gleiche ID)', () => {
    const c = mergeContent({ worlds: [{ ...BUILTIN_WORLDS[0], name: 'Mein Wald' }] });
    expect(c.worlds).toHaveLength(1);
    expect(c.worlds[0].name).toBe('Mein Wald');
  });
});

describe('KI-Stufen', () => {
  it('mittel ist genau die bisherige KI; jede Stufe spielt nur erlaubte Züge', () => {
    const start = createBattle(toHand(STARTER_DECK.slice(0, 8)), toHand(BUILTIN_OPPONENTS[3].deck), 'cpu');
    for (const level of ['easy', 'medium', 'hard'] as const) {
      let s = start;
      const rng = createRng(3);
      while (!isGameOver(s)) {
        const m = chooseCpuMove(s, rng, { level });
        expect(legalMoves(s)).toContainEqual(m);
        s = applyMove(s, m);
      }
    }
    expect(chooseCpuMove(start, createRng(5))).toEqual(chooseCpuMove(start, createRng(5), { level: 'medium' }));
  });

  it('schwer gewinnt öfter als leicht (gleiche Karten, gleiche Regeln)', () => {
    const decks = [BUILTIN_OPPONENTS[3].deck, BUILTIN_OPPONENTS[6].deck];
    let hardWins = 0;
    let easyWins = 0;
    for (let i = 0; i < 40; i++) {
      const [a, b] = i % 2 === 0 ? decks : [decks[1], decks[0]];
      let s = createBattle(toHand(a), toHand(b), i % 4 < 2 ? 'player' : 'cpu');
      const rng = createRng(100 + i);
      while (!isGameOver(s)) s = applyMove(s, chooseCpuMove(s, rng, { level: s.turn === 'player' ? 'hard' : 'easy' }));
      let p = 0;
      let c = 0;
      for (const x of s.board) if (x) (x.owner === 'player' ? p++ : c++);
      if (p > c) hardWins++;
      if (c > p) easyWins++;
    }
    expect(hardWins).toBeGreaterThan(easyWins * 2);
  });
});
