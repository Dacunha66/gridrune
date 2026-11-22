import { describe, expect, it } from 'vitest';
import { canPlayFloor, floorMission, floorState, floorToDoc, parseFloor, towerProgress, visibleFloors } from '../src/game/tower';

const opp = { name: 'Lehrling', emoji: '📘', level: 'easy', deck: ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08'], prefer: ['natur'] };
const raw = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n, section: 'Die Erwachenden Hallen', name: `Etage ${n}`, description: '', difficulty: n === 10 ? 'boss' : 'easy',
  arenaId: 'a01', opponent: opp, reward: { type: 'coins', amount: 25 }, status: 'active', ...extra,
});
const floors = Array.from({ length: 10 }, (_, i) => parseFloor(`t${String(i + 1).padStart(3, '0')}`, raw(i + 1))!);

describe('Turm der Prüfungen – Regeln', () => {
  it('liest Etagen und weist kaputte ab', () => {
    expect(floors.every(Boolean)).toBe(true);
    expect(floors[0].opponent.id).toBe('o9001');
    expect(parseFloor('x1', raw(1))).toBeNull();
    expect(parseFloor('t001', raw(0))).toBeNull();
    expect(parseFloor('t001', { ...raw(1), opponent: { ...opp, deck: [] } })).toBeNull();
  });

  it('zeigt nur veröffentlichte Etagen (Entwürfe nur im Test), sortiert, eine pro Nummer', () => {
    const draft = parseFloor('t011', raw(11, { status: 'draft' }))!;
    const dup = parseFloor('t099', raw(3))!;
    expect(visibleFloors([...floors].reverse()).map((f) => f.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(visibleFloors([...floors, draft], true).length).toBe(11);
    expect(visibleFloors([...floors, dup]).length).toBe(10);
  });

  it('Etage 1 ist am Anfang die einzige spielbare; nichts kann übersprungen werden', () => {
    expect(floorState(floors[0], 0)).toBe('current');
    expect(floorState(floors[1], 0)).toBe('locked');
    expect(canPlayFloor(floors[1], 0)).toBe(false);
    expect(canPlayFloor(floors[0], 0)).toBe(true);
    // After 5 wins: 1–5 done (replayable), 6 current, 7 locked.
    expect(floorState(floors[4], 5)).toBe('done');
    expect(canPlayFloor(floors[2], 5)).toBe(true);
    expect(floorState(floors[5], 5)).toBe('current');
    expect(canPlayFloor(floors[6], 5)).toBe(false);
  });

  it('Fortschrittsanzeige: „Etage 6 von 10“, „5 Etagen abgeschlossen“, Gipfel nach Etage 10', () => {
    const p = towerProgress(floors, 5);
    expect(p.current?.number).toBe(6);
    expect([p.sectionPos, p.sectionSize, p.done, p.top]).toEqual([6, 10, 5, false]);
    const end = towerProgress(floors, 10);
    expect([end.current, end.done, end.top]).toEqual([null, 10, true]);
  });

  it('eine Etage ist eine Mission mit genau einem Ziel: gewinnen', () => {
    const m = floorMission(floors[9]);
    expect(m.goals).toEqual([{ id: 't010-g1', type: 'win', n: 0 }]);
    expect(m.kind).toBe('boss');
    expect(m.mode).toBe('duel');
  });

  it('Speichern und Lesen ergeben dieselbe Etage', () => {
    expect(parseFloor('t004', floorToDoc(floors[3]))).toEqual(floors[3]);
  });
});
