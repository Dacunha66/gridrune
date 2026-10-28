import { describe, expect, it } from 'vitest';
import { CARDS, RARITY_ORDER, getCard } from '../src/game/cards';
import { createRng } from '../src/game/rng';
import { DUPLICATE_REFUND, PACKS, buyPack, buySkin, equipSkin, rollPack } from '../src/game/shop';
import { DEFAULT_SKINS } from '../src/game/skins';
import { KeyValueStore, defaultSave, loadSave, writeSave } from '../src/game/storage';

const rich = (coins = 5000) => ({ ...defaultSave(), coins });

describe('Kartenshop – Booster-Packs', () => {
  it('ein Pack enthält 3 verschiedene Karten', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const pack of PACKS) {
        const cards = rollPack(pack, createRng(seed));
        expect(cards).toHaveLength(3);
        expect(new Set(cards).size).toBe(3);
      }
    }
  });

  it('Helden-Pack garantiert mindestens eine epische oder legendäre Karte', () => {
    const hero = PACKS.find((p) => p.id === 'helden')!;
    for (let seed = 1; seed <= 300; seed++) {
      const cards = rollPack(hero, createRng(seed));
      expect(cards.some((id) => RARITY_ORDER[getCard(id).rarity] >= RARITY_ORDER.epic)).toBe(true);
    }
  });

  it('Kauf zieht Münzen ab, schaltet neue Karten frei und erstattet Doppelte', () => {
    const save = rich(1000);
    const r = buyPack(save, 'abenteurer', createRng(11));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const refund = r.cards.reduce((s, c) => s + c.refund, 0);
    expect(r.save.coins).toBe(1000 - 150 + refund);
    for (const c of r.cards) {
      expect(r.save.unlocked).toContain(c.cardId);
      expect(c.isNew).toBe(!save.unlocked.includes(c.cardId));
      expect(c.refund).toBe(c.isNew ? 0 : DUPLICATE_REFUND[getCard(c.cardId).rarity]);
    }
    expect(new Set(r.save.unlocked).size).toBe(r.save.unlocked.length);
  });

  it('ohne genug Münzen wird nichts gekauft', () => {
    const r = buyPack(rich(149), 'abenteurer', createRng(1));
    expect(r.ok).toBe(false);
  });

  it('mit genug Packs lässt sich die ganze Sammlung freischalten', () => {
    let save = rich(1_000_000);
    const rng = createRng(5);
    for (let i = 0; i < 500 && save.unlocked.length < CARDS.length; i++) {
      const r = buyPack(save, 'helden', rng);
      if (r.ok) save = r.save;
    }
    expect(save.unlocked.length).toBe(CARDS.length);
  });
});

describe('Kartenshop – Skins', () => {
  it('Standard-Skins gehören von Anfang an dir', () => {
    const s = defaultSave();
    expect(s.skins.card).toBe(DEFAULT_SKINS.card);
    expect(s.skins.runner).toBe(DEFAULT_SKINS.runner);
  });

  it('Kaufen zieht Münzen ab und rüstet den Skin aus; kein Doppelkauf', () => {
    const r = buySkin(rich(300), 'card-smaragd');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.coins).toBe(50);
    expect(r.save.skins.card).toBe('card-smaragd');
    expect(buySkin(r.save, 'card-smaragd').ok).toBe(false);
  });

  it('zu wenig Münzen oder unbekannter Skin: kein Kauf', () => {
    expect(buySkin(rich(100), 'card-gletscher').ok).toBe(false);
    expect(buySkin(rich(), 'gibt-es-nicht').ok).toBe(false);
  });

  it('nur gekaufte Skins lassen sich ausrüsten', () => {
    const s = rich();
    expect(equipSkin(s, 'runner-glut')).toBe(s);
    const r = buySkin(s, 'runner-glut');
    if (!r.ok) throw new Error('should buy');
    const back = equipSkin(r.save, 'runner-blau');
    expect(back.skins.runner).toBe('runner-blau');
    expect(equipSkin(back, 'runner-glut').skins.runner).toBe('runner-glut');
  });

  it('Skins werden gespeichert; manipulierte Daten fallen auf Standard zurück', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const r = buySkin(rich(), 'runner-schatten');
    if (!r.ok) throw new Error('should buy');
    writeSave(r.save, store);
    expect(loadSave(store).skins).toEqual(r.save.skins);
    const tampered = { ...r.save, skins: { owned: ['runner-schatten'], card: 'card-gletscher', runner: 'card-smaragd' } };
    writeSave(tampered as typeof r.save, store);
    const loaded = loadSave(store);
    expect(loaded.skins.card).toBe(DEFAULT_SKINS.card);
    expect(loaded.skins.runner).toBe(DEFAULT_SKINS.runner);
    expect(loaded.skins.owned).toContain('runner-schatten');
  });

  it('alte Spielstände ohne Skins laden weiter', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const { skins: _drop, ...old } = { ...defaultSave(), coins: 77 };
    void _drop;
    store.setItem('project-card-rush/save-v1', JSON.stringify(old));
    const loaded = loadSave(store);
    expect(loaded.coins).toBe(77);
    expect(loaded.skins).toEqual(defaultSave().skins);
  });
});
