import { describe, expect, it } from 'vitest';
import { CARDS, DECK_SIZE, STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyReward, computeReward, grant, leagueReward } from '../src/game/rewards';
import { KeyValueStore, SAVE_KEY, defaultSave, isValidDeck, loadSave, writeSave } from '../src/game/storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('Speichern & Laden', () => {
  it('neuer Spieler: mindestens 20 Karten und gültiges Starterdeck', () => {
    const save = loadSave(memoryStore());
    expect(save.unlocked.length).toBeGreaterThanOrEqual(20);
    expect(save.deck).toHaveLength(DECK_SIZE);
    expect(isValidDeck(save.deck, save.unlocked)).toBe(true);
  });

  it('speichert und lädt Sammlung, Deck und Münzen', () => {
    const store = memoryStore();
    const save = defaultSave();
    save.unlocked.push('e01', 'l01');
    save.deck = [...STARTER_DECK.slice(0, 18), 'e01', 'l01'];
    save.coins = 345;
    expect(writeSave(save, store)).toBe(true);
    const loaded = loadSave(store);
    expect(loaded).toEqual(save);
  });

  it('beschädigte Daten führen zu einem gültigen Neustart', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{kaputt');
    expect(loadSave(store)).toEqual(defaultSave());
    store.setItem(SAVE_KEY, JSON.stringify({ unlocked: ['xyz', 'e02'], deck: ['c01'], coins: -5 }));
    const s = loadSave(store);
    expect(s.unlocked).toContain('e02');
    expect(s.unlocked).not.toContain('xyz');
    expect(s.deck).toEqual(STARTER_DECK);
    expect(s.coins).toBe(0);
  });

  it('ohne Speicher (z. B. privater Modus) läuft das Spiel trotzdem', () => {
    const throwing: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSave(throwing)).toEqual(defaultSave());
    expect(writeSave(defaultSave(), throwing)).toBe(false);
  });

  it('Deck braucht 20 unterschiedliche, freigeschaltete Karten', () => {
    expect(isValidDeck(STARTER_DECK, STARTING_UNLOCKED)).toBe(true);
    expect(isValidDeck([...STARTER_DECK.slice(0, 19), STARTER_DECK[0]], STARTING_UNLOCKED)).toBe(false);
    expect(isValidDeck([...STARTER_DECK.slice(0, 19), 'l01'], STARTING_UNLOCKED)).toBe(false);
    expect(isValidDeck(STARTER_DECK.slice(0, 19), STARTING_UNLOCKED)).toBe(false);
  });
});

describe('Belohnungen', () => {
  const unlocked = defaultSave().unlocked;

  it('Einfaches Spiel: nur Münzen nach Schwierigkeit, nie eine Karte', () => {
    expect(computeReward('win', 'easy')).toEqual({ coins: 30, newCard: null, duplicateCard: null });
    expect(computeReward('win', 'medium').coins).toBe(50);
    expect(computeReward('win', 'hard').coins).toBe(100);
    expect([computeReward('draw', 'easy').coins, computeReward('draw', 'medium').coins, computeReward('draw', 'hard').coins]).toEqual([10, 20, 40]);
    expect([computeReward('loss', 'easy').coins, computeReward('loss', 'medium').coins, computeReward('loss', 'hard').coins]).toEqual([5, 10, 15]);
    const after = applyReward(defaultSave(), 'win', computeReward('win', 'hard'));
    expect(after.unlocked).toEqual(defaultSave().unlocked);
    expect(after.coins).toBe(defaultSave().coins + 100);
    expect(after.stats.wins).toBe(1);
  });

  it('Rangliste: gewonnenes Match schaltet eine zufällige Karte frei, die noch fehlt (gleicher Seed = gleiche Karte)', () => {
    const r = leagueReward(true, 'match-1', unlocked);
    expect(r.coins).toBe(0);
    expect(r.newCard).not.toBeNull();
    expect(unlocked).not.toContain(r.newCard);
    expect(leagueReward(true, 'match-1', unlocked)).toEqual(r);
    const cards = new Set(Array.from({ length: 30 }, (_, i) => leagueReward(true, `m-${i}`, unlocked).newCard));
    expect(cards.size).toBeGreaterThan(5);
    const after = grant(defaultSave(), r);
    expect(after.unlocked).toContain(r.newCard);
    expect(after.stats).toEqual(defaultSave().stats);
  });

  it('Rangliste: alle Karten schon da → 50 Münzen; verloren → nichts', () => {
    expect(leagueReward(true, 'x', CARDS.map((c) => c.id))).toEqual({ coins: 50, newCard: null, duplicateCard: null });
    expect(leagueReward(false, 'x', unlocked)).toEqual({ coins: 0, newCard: null, duplicateCard: null });
  });
});
