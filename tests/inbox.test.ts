import { describe, expect, it } from 'vitest';
import { checkGift, inboxClaimServer, raidOwedServer } from '../src/server/engine';
import { defaultSave } from '../src/game/storage';
import { CARDS } from '../src/game/cards';
import { parseRaid } from '../src/game/raid';

describe('Postfach', () => {
  it('Abholen: Münzen, Runensteine, Pack (geöffnet), Karte – Ergebnis je Eintrag', () => {
    const missing = CARDS.find((c) => !defaultSave().unlocked.includes(c.id))!.id;
    const r = inboxClaimServer({ ...defaultSave(), coins: 10 }, [
      { id: 'a', title: 'Münzen', reward: { type: 'coins', amount: 150 } },
      { id: 'b', title: 'Steine', reward: { type: 'stones', amount: 20 } },
      { id: 'c', title: 'Pack', reward: { type: 'pack', amount: 1, packId: 'helden' } },
      { id: 'd', title: 'Karte', reward: { type: 'card', cardId: missing } },
      { id: 'e', title: 'Unsinn', reward: { type: 'title', label: 'x' } },
    ], 'seed');
    expect(r.save.coins).toBe(160);
    expect(r.save.stones).toBe(20);
    expect(r.results.c.cards.length + r.results.c.duplicates.length).toBe(3);
    expect(r.results.d.cards).toEqual([missing]);
    expect(r.save.unlocked).toContain(missing);
    expect(r.results.e).toBeUndefined();
  });
  it('Geschenke: nur was es im Spiel gibt', () => {
    expect(checkGift({ type: 'coins', amount: 50 })).toEqual({ type: 'coins', amount: 50 });
    expect(checkGift({ type: 'card', cardId: 'x999' })).toBeNull();
    expect(checkGift({ type: 'pack', amount: 2, packId: 'gibtsnicht' })).toBeNull();
    expect(checkGift({ type: 'title', label: 'Held' })).toBeNull();
  });
  it('Raid: offene Belohnungen werden genannt, schon vergebene nicht', () => {
    const c = parseRaid('raid01', {
      name: 'Testraid', bossName: 'Boss', status: 'published', maxHp: 1000, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z',
      milestones: [{ damage: 100, reward: { type: 'coins', amount: 10 } }], globalRewards: [{ percent: 100, reward: { type: 'pack', amount: 1, packId: 'helden' } }], minAttacksForGlobal: 1,
    });
    expect(c).not.toBeNull();
    if (!c) return;
    const owed = raidOwedServer(c, { totalDamage: 500, attacks: 2 }, 0, []);
    expect(owed.map((o) => o.key)).toEqual(['p:100:coins', 'g:100:pack']);
    expect(owed[1].title).toContain('Boss besiegt');
    expect(raidOwedServer(c, { totalDamage: 500, attacks: 2 }, 0, ['p:100:coins', 'g:100:pack'])).toEqual([]);
  });
});

describe('Postfach: Karten-Editionen aus Puzzle-Events', () => {
  it('beim Abholen kommt die Edition in die Sammlung; schon vorhandene bleibt einfach', () => {
    const r = inboxClaimServer(defaultSave(), [{ id: 'e1', title: 'Mondfinsternis: Stufe 1 geschafft', reward: { type: 'edition', editionId: 'ed01' } }], 'seed');
    expect(r.save.editions.owned).toEqual(['ed01']);
    expect(r.results.e1.editions).toEqual(['ed01']);
    const again = inboxClaimServer(r.save, [{ id: 'e2', title: 'x', reward: { type: 'edition', editionId: 'ed01' } }], 'seed');
    expect(again.save.editions.owned).toEqual(['ed01']);
    expect(inboxClaimServer(defaultSave(), [{ id: 'e3', title: 'x', reward: { type: 'edition', editionId: 'ed999' } }], 'seed').results.e3).toBeUndefined();
  });
});
