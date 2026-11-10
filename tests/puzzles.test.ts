import { describe, expect, it } from 'vitest';
import {
  BUILTIN_EDITIONS, PuzzleCounters, currentStage, earnedClaim, newlyDone, puzzleStages, stageDone, totalPieces, equipEdition, grantPuzzleReward, missingPieces, parseEdition, parsePuzzle, puzzlePhase,
  puzzleProblems, setEditions, taskKey, taskViews,
} from '../src/game/puzzles';
import { defaultSave, sanitize } from '../src/game/storage';
import { questDay, questWeek } from '../src/game/quests';
import { cleanSave, mergeChoices } from '../supabase/functions/save-sync/logic';

const now = new Date('2026-11-12T10:00:00Z');
const raw = {
  name: 'Mondfinsternis', reward: { type: 'edition', editionId: 'ed01' }, pieces: 9, status: 'published',
  run: { id: 'r1', startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-24T00:00:00Z' },
  tasks: [
    { id: 'tday', metric: 'wins', target: 2, fragments: 1, period: 'daily' },
    { id: 'tweek', metric: 'wins', target: 10, fragments: 2, period: 'weekly' },
    { id: 'tonce', metric: 'big_wins', target: 1, fragments: 1, period: 'once' },
  ],
};
const p = parsePuzzle('pz01', raw)!;
const counters = (wins: number, big = 0, weekWins = wins): PuzzleCounters => ({
  day: questDay(now), week: questWeek(now), daily: { wins }, weekly: { wins: weekWins }, total: { wins: weekWins, big_wins: big },
});

describe('Puzzle-Events: Regeln', () => {
  it('liest Admin-Daten sicher ein (3×3 bei 9 Teilen, unbekannte Aufgaben fallen weg)', () => {
    expect(p.cols * p.rows).toBe(9);
    expect(parsePuzzle('pz02', { ...raw, tasks: [{ id: 'tx', metric: 'hack', target: 1 }] })!.tasks).toEqual([]);
    expect(parsePuzzle('bad', raw)).toBeNull();
    expect(parsePuzzle('pz03', { ...raw, reward: { type: 'card', cardId: 'c01' } })).toBeNull();
    expect(puzzleProblems(p)).toEqual([]);
  });
  it('Status: nie vor dem Start sichtbar, Ende, Entwurf', () => {
    expect(puzzlePhase(p, new Date('2026-11-09T23:59:00Z'))).toBe('planned');
    expect(puzzlePhase(p, now)).toBe('active');
    expect(puzzlePhase(p, new Date('2026-11-24T00:00:00Z'))).toBe('ended');
    expect(puzzlePhase({ ...p, status: 'draft' }, now)).toBe('draft');
  });
  it('erledigte Aufgaben geben fehlende Teile – nie doppelt, nie zweimal für dieselbe Aufgabe', () => {
    const c = earnedClaim(p, [], counters(2, 1), [], 'seed', now)!;
    expect(c.keys).toEqual([taskKey(p, p.tasks[0], now), taskKey(p, p.tasks[2], now)]);
    expect(c.pieces.length).toBe(2);
    expect(new Set(c.pieces).size).toBe(2);
    // The same tasks again: nothing (already claimed).
    expect(earnedClaim(p, c.pieces, counters(5, 3), c.keys, 'other', now)).toBeNull();
    // Pieces already owned are never given again.
    const have = [0, 1, 2, 3, 4, 5, 6, 7];
    const d = earnedClaim(p, have, counters(10, 1, 10), [], 'x', now)!;
    expect(d.pieces).toEqual([8]);
    expect(d.complete).toBe(true);
    expect(missingPieces(p, [...have, ...d.pieces])).toEqual([]);
  });
  it('nicht erreichte Ziele, beendete Events und fertige Puzzles geben nichts', () => {
    expect(earnedClaim(p, [], counters(1), [], 's', now)).toBeNull();
    expect(earnedClaim(p, [], counters(5), [], 's', new Date('2026-11-25T00:00:00Z'))).toBeNull();
    expect(earnedClaim(p, [0, 1, 2, 3, 4, 5, 6, 7, 8], counters(5), [], 's', now)).toBeNull();
  });
  it('tägliche Zähler gelten nur heute; eine neue Runde hat neue Schlüssel, die Teile bleiben', () => {
    const old: PuzzleCounters = { ...counters(5), day: '2026-11-01' };
    expect(taskViews(p, old, [], now)[0].value).toBe(0);
    const r2 = { ...p, run: { ...p.run, id: 'r2' } };
    expect(taskKey(r2, p.tasks[2], now)).not.toBe(taskKey(p, p.tasks[2], now));
  });
});

describe('Puzzle-Events: Editionen', () => {
  it('Belohnung genau einmal; Auswahl nur mit eigener Edition', () => {
    const s1 = grantPuzzleReward(defaultSave(), p);
    expect(s1.editions.owned).toEqual(['ed01']);
    expect(grantPuzzleReward(s1, p)).toBe(s1);
    expect(equipEdition(defaultSave(), 'r02', 'ed01').editions.equipped).toEqual({});
    expect(equipEdition(s1, 'r02', 'ed01').editions.equipped).toEqual({ r02: 'ed01' });
    expect(equipEdition(s1, 'c01', 'ed01').editions.equipped).toEqual({});
    expect(equipEdition(equipEdition(s1, 'r02', 'ed01'), 'r02', null).editions.equipped).toEqual({});
  });
  it('Admin-Edition ersetzt die eingebaute; ungültige werden verworfen', () => {
    expect(parseEdition('ed01', { cardId: 'r02', name: 'Neu', frame: 'x' })!.frame).toBe('none');
    expect(parseEdition('xx', { cardId: 'r02' })).toBeNull();
    setEditions([parseEdition('ed01', { cardId: 'r02', name: 'Neu' })!]);
    setEditions(BUILTIN_EDITIONS);
  });
  it('Speichern: Besitz nur vom Server, Auswahl vom Gerät', () => {
    const stored = cleanSave(sanitize({ ...defaultSave(), editions: { owned: ['ed01'], equipped: {} } }));
    const incoming = { ...defaultSave(), editions: { owned: ['ed01', 'ed99'], equipped: { r02: 'ed01', c01: 'ed99' } } };
    const m = mergeChoices(stored, incoming) as { editions: { owned: string[]; equipped: Record<string, string> } };
    expect(m.editions.owned).toEqual(['ed01']);
    expect(m.editions.equipped).toEqual({ r02: 'ed01' });
    const fresh = mergeChoices(cleanSave(defaultSave()), incoming) as typeof m;
    expect(fresh.editions).toEqual({ owned: [], equipped: {} });
  });
});

describe('Puzzle-Events: Stufen (Selten → Episch → Legendär → Mystisch)', () => {
  const staged = parsePuzzle('pz01', {
    ...raw,
    tasks: [{ id: 'tbig', metric: 'wins', target: 1, fragments: 5, period: 'once' }, { id: 'tday', metric: 'wins', target: 2, fragments: 1, period: 'daily' }],
    stages: [{ editionId: 'ed02', pieces: 9 }, { editionId: 'ed03', pieces: 12 }, { editionId: 'ed04', pieces: 16, cols: 4, rows: 4 }, { editionId: 'bad' }],
  })!;
  it('liest Stufen; Teile werden über alle Stufen gezählt', () => {
    expect(staged.stages.map((s) => [s.editionId, s.pieces, s.cols, s.rows])).toEqual([['ed02', 9, 3, 3], ['ed03', 12, 3, 4], ['ed04', 16, 4, 4]]);
    expect(totalPieces(staged)).toBe(46);
    expect(puzzleStages(staged).map((s) => s.offset)).toEqual([0, 9, 18, 30]);
  });
  it('erst die aktuelle Stufe, Überzähliges in die nächste; dort wird die Edition fällig', () => {
    const have = [0, 1, 2, 3, 4, 5, 6];
    const c = earnedClaim(staged, have, counters(2), [], 's', now)!;
    expect(c.pieces.length).toBe(6);
    expect(c.pieces.filter((i) => i < 9).sort()).toEqual([7, 8]);
    expect(c.pieces.every((i) => i < 18)).toBe(true);
    const done = newlyDone(staged, have, c.pieces);
    expect(done.map((s) => s.editionId)).toEqual(['ed01']);
    const save = grantPuzzleReward(defaultSave(), staged, [...have, ...c.pieces]);
    expect(save.editions.owned).toEqual(['ed01']);
    expect(currentStage(staged, [...have, ...c.pieces])!.index).toBe(1);
    expect(c.complete).toBe(false);
  });
  it('alles geschafft: alle Editionen, Puzzle vollständig', () => {
    const all = Array.from({ length: 46 }, (_, i) => i);
    expect(stageDone(puzzleStages(staged)[3], all)).toBe(true);
    expect(grantPuzzleReward(defaultSave(), staged, all).editions.owned).toEqual(['ed01', 'ed02', 'ed03', 'ed04']);
    expect(earnedClaim(staged, all, counters(5), [], 's', now)).toBeNull();
    expect(currentStage(staged, all)).toBeNull();
  });
});
