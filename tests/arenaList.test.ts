import { describe, expect, it } from 'vitest';
import { BUILTIN_ARENAS, moveId, orderedArenas, parseArenaList } from '../src/game/arenas';

describe('Arenen-Liste im Admin (Reihenfolge, gelöschte Standard-Arenen)', () => {
  it('liest nur gültige Arena-Kennungen, ohne Doppelte', () => {
    expect(parseArenaList({ order: ['a02', 'x', 'a02', 'a01', 3], hidden: ['a05', 'nope'] })).toEqual({ order: ['a02', 'a01'], hidden: ['a05'] });
    expect(parseArenaList(null)).toEqual({ order: [], hidden: [] });
  });

  it('sortiert nach der gespeicherten Reihenfolge, neue Arenen hinten, gelöschte raus', () => {
    const ids = orderedArenas(BUILTIN_ARENAS, { order: ['a03', 'a01'], hidden: ['a02'] }).map((a) => a.id);
    expect(ids.slice(0, 2)).toEqual(['a03', 'a01']);
    expect(ids).not.toContain('a02');
    expect(ids.length).toBe(BUILTIN_ARENAS.length - 1);
    expect(ids.slice(2)).toEqual([...ids.slice(2)].sort());
  });

  it('verschiebt eine Arena an eine andere Stelle', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveId(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
