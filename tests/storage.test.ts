import { describe, expect, it } from 'vitest';
import { DECK_SIZE, STARTER_DECK, STARTING_UNLOCKED } from '../src/game/cards';
import { applyReward, computeReward } from '../src/game/rewards';
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
  const pick = (cardId: string, kind: 'deck' | 'discovery', gate = 0) => ({ cardId, kind, gate, mod: 0 });

  it('Sieg schaltet höchstens eine neue entdeckte Karte frei (die seltenste)', () => {
    const r = computeReward('win', [pick('e01', 'discovery'), pick('l03', 'discovery', 1), pick('c01', 'deck', 2)], unlocked);
    expect(r.newCard).toBe('l03');
    const after = applyReward(defaultSave(), 'win', r);
    expect(after.unlocked).toContain('l03');
    expect(after.unlocked).not.toContain('e01');
    expect(after.stats.wins).toBe(1);
  });

  it('bereits vorhandene Entdeckung wird zu Münzen', () => {
    const r = computeReward('win', [pick('c12', 'discovery')], unlocked);
    expect(r.newCard).toBeNull();
    expect(r.duplicateCard).toBe('c12');
    expect(r.coins).toBeGreaterThan(computeReward('win', [], unlocked).coins);
  });

  it('Unentschieden: weniger Münzen, keine Karte; Niederlage: Trostpreis', () => {
    const win = computeReward('win', [], unlocked);
    const draw = computeReward('draw', [pick('l01', 'discovery')], unlocked);
    const loss = computeReward('loss', [pick('l01', 'discovery')], unlocked);
    expect(draw.newCard).toBeNull();
    expect(loss.newCard).toBeNull();
    expect(draw.coins).toBeLessThan(win.coins);
    expect(loss.coins).toBeGreaterThan(0);
    expect(loss.coins).toBeLessThan(draw.coins);
  });
});
