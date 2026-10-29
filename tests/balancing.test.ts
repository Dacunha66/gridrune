import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CARDS, STARTER_DECK, STARTING_UNLOCKED, getCard, setCardCatalog } from '../src/game/cards';
import { CardRecord, OUTLIER_THRESHOLD, balanceReport, buildCatalog, builtinRecords, parseCardRecord, repairDeck } from '../src/game/catalog';
import { loadGameSettings, saveGameSettings } from '../src/game/cardStore';
import { createRng } from '../src/game/rng';
import { FINAL_GATE, generateGates } from '../src/game/runner';
import { DEFAULT_DISCOVERY_SHARES, SETTINGS, defaultSettings, parseSettings, setGameSettings, sharePercents } from '../src/game/settings';
import { PACKS, rollPack } from '../src/game/shop';
import { fakeDb } from './fakeDb';

afterEach(() => {
  setCardCatalog(BUILTIN_CARDS);
  setGameSettings(defaultSettings());
});

function useRecords(records: CardRecord[]) {
  const cat = buildCatalog(records);
  setCardCatalog(cat.active, cat.known);
}

const owned = new Set(STARTING_UNLOCKED);
const finalOffers = (seed: number) => generateGates(STARTER_DECK, createRng(seed), owned)[FINAL_GATE].offers.map((o) => o.cardId);

describe('Standardwerte ändern nichts', () => {
  it('Standard-Häufigkeiten sind die bisherigen Werte', () => {
    expect(SETTINGS.discoveryShares).toEqual({ common: 28, uncommon: 30, rare: 24, epic: 12, legendary: 5, mythic: 1 });
  });

  it('alte Kartendokumente ohne neue Felder: dürfen in den Lauf, sind nicht „nur Belohnung“', () => {
    const r = parseCardRecord('c01', { name: 'Alt', rarity: 'common', top: 4, right: 4, bottom: 4, left: 4, status: 'active' })!;
    expect(r.inRunner).toBe(true);
    expect(r.rewardOnly).toBe(false);
  });
});

describe('Häufigkeit der Seltenheiten im Lauf', () => {
  it('ungültige oder leere Einstellungen fallen auf die Standardwerte zurück', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings({ discoveryShares: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 } })).toEqual(defaultSettings());
    expect(parseSettings({ discoveryShares: { common: -5, mythic: 99999, rare: 'x' } }).discoveryShares).toMatchObject({ common: 0, mythic: 1000, rare: DEFAULT_DISCOVERY_SHARES.rare });
  });

  it('Prozentanzeige ergibt zusammen 100 %', () => {
    const p = sharePercents(DEFAULT_DISCOVERY_SHARES);
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it('nur Legendär eingestellt: im Finaltor erscheinen nur legendäre Karten', () => {
    setGameSettings({ ...defaultSettings(), discoveryShares: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 1, mythic: 0 } });
    for (let seed = 1; seed <= 100; seed++) for (const id of finalOffers(seed)) expect(getCard(id).rarity).toBe('legendary');
  });

  it('höherer Anteil = häufiger', () => {
    const count = () => {
      let n = 0;
      for (let seed = 1; seed <= 1500; seed++) n += finalOffers(seed).filter((id) => getCard(id).rarity === 'epic').length;
      return n;
    };
    const before = count();
    setGameSettings({ ...defaultSettings(), discoveryShares: { ...DEFAULT_DISCOVERY_SHARES, epic: 60 } });
    expect(count()).toBeGreaterThan(before * 2);
  });

  it('Einstellungen werden gespeichert und geladen; Spieler können sie nicht ändern', async () => {
    const admin = fakeDb({ admin: true });
    expect(await loadGameSettings(admin.db)).toBeNull();
    await saveGameSettings(admin.db, { ...defaultSettings(), discoveryShares: { ...DEFAULT_DISCOVERY_SHARES, mythic: 5 } });
    expect((await loadGameSettings(admin.db))?.discoveryShares.mythic).toBe(5);
    const player = fakeDb({ admin: false });
    await expect(saveGameSettings(player.db, defaultSettings())).rejects.toMatchObject({ code: 'invalid_argument' });
  });
});

describe('Welche Karten im Lauf erscheinen dürfen', () => {
  it('Karten mit „nicht im Lauf“ erscheinen nie als neue Karte', () => {
    const records = builtinRecords('t');
    const banned = records.filter((r) => r.rarity === 'rare').map((r) => r.id);
    for (const r of records) if (banned.includes(r.id)) r.inRunner = false;
    useRecords(records);
    for (let seed = 1; seed <= 500; seed++) for (const id of finalOffers(seed)) expect(banned).not.toContain(id);
  });

  it('„nicht im Lauf“ betrifft nur neue Karten – eigene Deckkarten bleiben im Lauf', () => {
    const records = builtinRecords('t');
    for (const r of records) if (STARTER_DECK.includes(r.id)) r.inRunner = false;
    useRecords(records);
    const gates = generateGates(STARTER_DECK, createRng(1), owned);
    expect(gates.slice(0, FINAL_GATE).flatMap((g) => g.offers).every((o) => STARTER_DECK.includes(o.cardId))).toBe(true);
  });
});

describe('Karten nur durch Belohnung', () => {
  it('erscheinen nie in Booster-Packs, aber im Lauf (und können so gewonnen werden)', () => {
    const records = builtinRecords('t');
    const rewardOnly = records.filter((r) => r.rarity === 'mythic' || r.rarity === 'legendary').map((r) => r.id);
    for (const r of records) if (rewardOnly.includes(r.id)) r.rewardOnly = true;
    useRecords(records);
    for (let seed = 1; seed <= 500; seed++) {
      for (const pack of PACKS) for (const id of rollPack(pack, createRng(seed))) expect(rewardOnly).not.toContain(id);
    }
    setGameSettings({ ...defaultSettings(), discoveryShares: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 1, mythic: 1 } });
    expect(finalOffers(1).some((id) => rewardOnly.includes(id))).toBe(true);
  });

  it('werden auch bei der Deck-Reparatur nicht verschenkt', () => {
    const records = builtinRecords('t');
    for (const r of records) if (r.rarity === 'common') r.rewardOnly = true;
    useRecords(records);
    const r = repairDeck([], [], CARDS);
    expect(r.deck).toHaveLength(20);
    for (const id of r.unlocked) expect(getCard(id).rewardOnly).not.toBe(true);
  });
});

describe('Gesamtstärke und Auffälligkeiten', () => {
  it('die 100 vorhandenen Karten sind alle unauffällig', () => {
    const report = balanceReport(builtinRecords('t'));
    expect([...report.cards.values()].filter((c) => c.flag)).toEqual([]);
    expect(report.stats.common.count).toBe(30);
    expect(report.stats.mythic.avg).toBeGreaterThan(report.stats.legendary.avg);
  });

  it(`eine Karte ${OUTLIER_THRESHOLD}+ Punkte über/unter dem Schnitt ihrer Seltenheit wird markiert`, () => {
    const records = builtinRecords('t');
    const strong = records.find((r) => r.id === 'c01')!;
    Object.assign(strong, { top: 7, right: 7, bottom: 7, left: 7 }); // Σ 28 for a common card
    const weak = records.find((r) => r.id === 'l01')!;
    Object.assign(weak, { top: 3, right: 3, bottom: 3, left: 3 }); // Σ 12 for a legendary card
    const report = balanceReport(records);
    expect(report.cards.get('c01')).toMatchObject({ sum: 28, flag: 'strong' });
    expect(report.cards.get('l01')).toMatchObject({ sum: 12, flag: 'weak' });
    expect(report.cards.get('c02')?.flag).toBeNull();
  });

  it('Vergleich nur mit aktiven Karten; eine allein stehende Seltenheit hat keinen Vergleich', () => {
    const records = builtinRecords('t').filter((r) => r.rarity !== 'mythic');
    records.push({ ...records[0], id: 'k001', rarity: 'mythic', top: 1, right: 1, bottom: 1, left: 1 });
    const report = balanceReport(records);
    expect(report.cards.get('k001')).toMatchObject({ avg: null, flag: null });
  });
});
