import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CARDS, STARTER_DECK, getCard, isCardId, setCardCatalog } from '../src/game/cards';
import {
  CardRecord, MIN_ACTIVE_CARDS, buildCatalog, cardSum, builtinRecords, duplicateRecord, newRecord, nextCardId, parseCardRecord,
  powerHint, recordToCard, repairDeck,
} from '../src/game/catalog';
import { cropToPortrait, deleteCardRecord, loadCardRecords, saveCardRecord } from '../src/game/cardStore';
import { generateGates } from '../src/game/runner';
import { drawCpuHand } from '../src/game/ai';
import { rollPack, PACKS } from '../src/game/shop';
import { createRng } from '../src/game/rng';
import { fakeDb } from './fakeDb';

afterEach(() => setCardCatalog(BUILTIN_CARDS));

const rec = (over: Partial<CardRecord> = {}): CardRecord => ({ ...newRecord('k001', 't'), name: 'Testkarte', status: 'active', ...over });

describe('Kartendaten prüfen', () => {
  it('übernimmt gültige Daten und begrenzt Werte auf 1–10', () => {
    const r = parseCardRecord('k007', { name: '  Glutdrache ', rarity: 'epic', top: 12, right: 0, bottom: '7', left: 5.6, status: 'active', hue: 400 })!;
    expect(r).toMatchObject({ id: 'k007', name: 'Glutdrache', rarity: 'epic', top: 10, right: 1, bottom: 7, left: 6, status: 'active', hue: 40 });
  });

  it('lehnt unbrauchbare Daten ab (kein Name, falsche Seltenheit, fehlende Werte, schlechte ID)', () => {
    expect(parseCardRecord('k001', { rarity: 'rare', top: 1, right: 1, bottom: 1, left: 1 })).toBeNull();
    expect(parseCardRecord('k001', { name: 'X', rarity: 'super', top: 1, right: 1, bottom: 1, left: 1 })).toBeNull();
    expect(parseCardRecord('k001', { name: 'X', rarity: 'rare', top: 1, right: 1, bottom: 1 })).toBeNull();
    expect(parseCardRecord('../hack', { name: 'X', rarity: 'rare', top: 1, right: 1, bottom: 1, left: 1 })).toBeNull();
  });

  it('unbekannter Status wird zum Entwurf, unsichere Bild-IDs werden verworfen', () => {
    const r = parseCardRecord('k002', { name: 'X', rarity: 'rare', top: 1, right: 1, bottom: 1, left: 1, status: 'live', imageId: 'javascript:alert(1)' })!;
    expect(r.status).toBe('draft');
    expect(r.imageId).toBeNull();
  });

  it('Bild-ID wird zur Bildadresse der Karte', () => {
    expect(recordToCard(rec({ imageId: 'abcdef0123456789abcdef0123456789' })).image).toBe('/_blob/abcdef0123456789abcdef0123456789');
    expect(recordToCard(rec()).image).toBeUndefined();
  });
});

describe('Karten-IDs, Duplizieren, Stärke-Hinweis', () => {
  it('vergibt fortlaufende IDs k001, k002 … ohne Kollision', () => {
    expect(nextCardId(['c01', 'm04'])).toBe('k001');
    expect(nextCardId(['k001', 'k009', 'c01'])).toBe('k010');
  });

  it('Duplikat bekommt neue ID, „(Kopie)“ und startet als Entwurf', () => {
    const d = duplicateRecord(rec({ name: 'Glutdrache' }), 'k002', 'now');
    expect(d).toMatchObject({ id: 'k002', name: 'Glutdrache (Kopie)', status: 'draft', createdAt: 'now' });
  });

  it('Stärke-Hinweis kennt die empfohlene Summe je Seltenheit', () => {
    expect(powerHint({ rarity: 'common', top: 4, right: 4, bottom: 4, left: 3 })).toEqual({ sum: 15, effect: 0, total: 15, min: 13, max: 16, ok: true });
    expect(powerHint({ rarity: 'common', top: 9, right: 9, bottom: 9, left: 9 }).ok).toBe(false);
  });

  it('Effektstärke zählt mit: Arkane Kraft wie +4', () => {
    expect(powerHint({ rarity: 'common', top: 4, right: 4, bottom: 4, left: 3, effect: 'arkane_kraft' })).toMatchObject({ sum: 15, effect: 4, total: 19, ok: false });
    expect(cardSum({ top: 4, right: 4, bottom: 4, left: 3, effect: 'kampfgeist' })).toBe(17.1);
  });

  it('Klasse und Effekt: alte Karten bekommen eine Klasse, unpassende Effekte werden verworfen', () => {
    const base = { name: 'Test', rarity: 'common', top: 4, right: 4, bottom: 4, left: 4, status: 'active' };
    expect(parseCardRecord('c01', base)).toMatchObject({ cls: 'natur', effect: null });
    expect(parseCardRecord('k050', base)).toMatchObject({ cls: 'krieger', effect: null });
    expect(parseCardRecord('k050', { ...base, cls: 'magier', effect: 'arkane_kraft' })).toMatchObject({ cls: 'magier', effect: 'arkane_kraft' });
    expect(parseCardRecord('k050', { ...base, cls: 'feuer', effect: 'arkane_kraft' })).toMatchObject({ cls: 'feuer', effect: null });
    expect(parseCardRecord('k050', { ...base, cls: 'drache', effect: 'gibtsnicht' })).toMatchObject({ cls: 'krieger', effect: null });
    const card = recordToCard(parseCardRecord('k050', { ...base, cls: 'schatten', effect: 'schwaechender_blick' })!);
    expect(card).toMatchObject({ cls: 'schatten', effect: 'schwaechender_blick' });
  });

  it('jede eingebaute Karte hat eine Klasse', () => {
    for (const r of builtinRecords()) expect(r.cls, r.id).toBeTruthy();
  });
});

describe('Katalog im Spiel', () => {
  it('Übernahme der 100 vorhandenen Karten ohne Verlust', () => {
    const records = builtinRecords('t');
    expect(records).toHaveLength(100);
    const cat = buildCatalog(records);
    expect(cat.usable).toBe(true);
    expect(cat.active.map((c) => c.id).sort()).toEqual(BUILTIN_CARDS.map((c) => c.id).sort());
    for (const c of BUILTIN_CARDS) expect(cat.active.find((a) => a.id === c.id)).toMatchObject({ name: c.name, top: c.top, right: c.right, bottom: c.bottom, left: c.left, rarity: c.rarity });
  });

  it('nur aktive Karten kommen ins Spiel; Entwürfe und deaktivierte bleiben bekannt', () => {
    const records = builtinRecords('t');
    records[0].status = 'disabled';
    records[1].status = 'draft';
    records.push(rec({ id: 'k001', name: 'Neue Karte', rarity: 'legendary', top: 7, right: 7, bottom: 7, left: 7 }));
    const cat = buildCatalog(records);
    setCardCatalog(cat.active, cat.known);
    expect(CARDS.some((c) => c.id === records[0].id)).toBe(false);
    expect(CARDS.some((c) => c.id === records[1].id)).toBe(false);
    expect(CARDS.some((c) => c.id === 'k001')).toBe(true);
    // Players who own a disabled card still see it in old saves.
    expect(getCard(records[0].id).name).toBe(records[0].name);
    expect(isCardId('k001')).toBe(true);
  });

  it('neue aktive Karte erscheint in Toren, Packs und kann beim Gegner landen', () => {
    const records = builtinRecords('t').map((r) => ({ ...r, status: r.rarity === 'legendary' ? 'disabled' as const : r.status }));
    records.push(rec({ id: 'k001', name: 'Neue Legende', rarity: 'legendary', top: 7, right: 7, bottom: 7, left: 7 }));
    const cat = buildCatalog(records);
    setCardCatalog(cat.active, cat.known);
    let inGate = false;
    let inPack = false;
    for (let seed = 1; seed <= 3000 && !(inGate && inPack); seed++) {
      if (generateGates(STARTER_DECK, createRng(seed)).some((g) => g.offers.some((o) => o.cardId === 'k001'))) inGate = true;
      if (rollPack(PACKS[1], createRng(seed)).includes('k001')) inPack = true;
    }
    expect(inGate).toBe(true);
    expect(inPack).toBe(true);
    // Disabled cards never appear.
    for (let seed = 1; seed <= 300; seed++) {
      for (const g of generateGates(STARTER_DECK, createRng(seed))) {
        for (const o of g.offers) if (getCard(o.cardId).rarity === 'legendary') expect(o.cardId).toBe('k001');
      }
    }
  });

  it(`zu wenige aktive Karten (< ${MIN_ACTIVE_CARDS}): das Spiel nutzt weiter die eingebauten Karten`, () => {
    const records = builtinRecords('t').slice(0, MIN_ACTIVE_CARDS - 1);
    const cat = buildCatalog(records);
    expect(cat.usable).toBe(false);
    expect(cat.active).toHaveLength(100);
  });

  it('der Computer findet auch mit ungewöhnlichem Katalog immer 8 Karten', () => {
    const records = builtinRecords('t').map((r) => ({ ...r, status: ['common', 'uncommon', 'rare'].includes(r.rarity) ? 'disabled' as const : r.status }));
    records.push(...Array.from({ length: 10 }, (_, i) => rec({ id: `k0${10 + i}`, name: `Extra ${i}`, rarity: 'epic', top: 6, right: 6, bottom: 6, left: 6 })));
    const cat = buildCatalog(records);
    expect(cat.usable).toBe(true);
    setCardCatalog(cat.active, cat.known);
    expect(new Set(drawCpuHand(createRng(1)).map((c) => c.cardId)).size).toBe(8);
  });
});

describe('Deck-Reparatur bei deaktivierten Karten', () => {
  it('ersetzt deaktivierte Deckkarten durch eigene aktive Karten', () => {
    const records = builtinRecords('t');
    records.find((r) => r.id === STARTER_DECK[0])!.status = 'disabled';
    const cat = buildCatalog(records);
    const owned = [...STARTER_DECK, 'c11', 'c12'];
    const r = repairDeck([...STARTER_DECK], owned, cat.active);
    expect(r.deck).toHaveLength(20);
    expect(new Set(r.deck).size).toBe(20);
    expect(r.deck).not.toContain(STARTER_DECK[0]);
    expect(r.unlocked).toEqual(owned);
  });

  it('besitzt der Spieler zu wenige aktive Karten, werden schwache aktive Karten geschenkt', () => {
    const records = builtinRecords('t');
    for (const id of STARTER_DECK.slice(0, 5)) records.find((r) => r.id === id)!.status = 'disabled';
    const cat = buildCatalog(records);
    const r = repairDeck([...STARTER_DECK], [...STARTER_DECK], cat.active);
    expect(r.deck).toHaveLength(20);
    expect(r.unlocked.length).toBe(25);
    for (const id of r.deck) expect(r.unlocked).toContain(id);
  });

  it('gültiges Deck bleibt unverändert', () => {
    const cat = buildCatalog(builtinRecords('t'));
    const deck = [...STARTER_DECK];
    expect(repairDeck(deck, deck, cat.active).deck).toBe(deck);
  });
});

describe('Kartendatenbank', () => {
  it('Admin: speichern, laden, ändern und löschen', async () => {
    const { db, store } = fakeDb({ admin: true });
    await saveCardRecord(db, rec({ id: 'k001', name: 'Glutdrache' }));
    expect(store.get('k001')).not.toHaveProperty('id');
    let all = await loadCardRecords(db);
    expect(all?.map((r) => r.name)).toEqual(['Glutdrache']);
    await saveCardRecord(db, rec({ id: 'k001', name: 'Glutdrache II', top: 9 }));
    all = await loadCardRecords(db);
    expect(all?.[0]).toMatchObject({ name: 'Glutdrache II', top: 9 });
    await deleteCardRecord(db, 'k001');
    expect(await loadCardRecords(db)).toEqual([]);
  });

  it('Spieler ohne Admin-Rechte können nichts verändern (Server lehnt ab)', async () => {
    const { db, store } = fakeDb({ admin: false });
    await expect(saveCardRecord(db, rec())).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(deleteCardRecord(db, 'c01')).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(store.size).toBe(0);
  });

  it('beschädigte Dokumente in der Datenbank werden übersprungen', async () => {
    const { db, store } = fakeDb();
    store.set('k001', { name: '', rarity: 'rare' });
    store.set('k002', { name: 'Gut', rarity: 'rare', top: 5, right: 5, bottom: 5, left: 5, status: 'active' });
    expect((await loadCardRecords(db))?.map((r) => r.id)).toEqual(['k002']);
  });

  it('ohne Plattform (lokal) gibt es keine Datenbank – das Spiel nutzt die eingebauten Karten', async () => {
    expect(await loadCardRecords(null)).toBeNull();
  });
});

describe('Bildzuschnitt 3:4', () => {
  it('Querformat-Foto wird mittig auf 3:4 zugeschnitten und verkleinert', () => {
    expect(cropToPortrait(4032, 3024)).toEqual({ sx: 882, sy: 0, sw: 2268, sh: 3024, outW: 720, outH: 960 });
  });
  it('Hochformat-Foto (iPhone) wird oben/unten beschnitten', () => {
    const c = cropToPortrait(3024, 4032 + 400);
    expect(c.sw / c.sh).toBeCloseTo(0.75, 2);
    expect(c.outW).toBe(720);
  });
  it('kleine Bilder werden nicht vergrößert', () => {
    expect(cropToPortrait(300, 400)).toMatchObject({ outW: 300, outH: 400 });
  });
});

describe('Spielstand und Datenbank-Karten', () => {
  it('eine aus der Datenbank freigeschaltete Karte bleibt nach Neustart erhalten, auch bevor die Datenbank geladen ist', async () => {
    const { loadSave, writeSave, defaultSave } = await import('../src/game/storage');
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const s = defaultSave();
    s.unlocked.push('k001');
    writeSave(s, store);
    expect(loadSave(store).unlocked).toContain('k001');
  });
});
