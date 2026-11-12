import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FORGE, addDuplicate, buyFrame, craftCard, craftEdition, craftableCards, craftableEditions, equipFrame, forgeFragment, fragmentsLeft,
  meltCards, meltCount, parseForgeDoc, refineEssence, sanitizeForge,
} from '../src/game/forge';
import { CARDS, getCard } from '../src/game/cards';
import { grantRewards } from '../src/game/campaignRewards';
import { buyPack } from '../src/game/shop';
import { createRng } from '../src/game/rng';
import { SaveData, defaultSave, sanitize } from '../src/game/storage';
import { parsePuzzle, setPuzzles, totalPieces } from '../src/game/puzzles';
import { cleanSave, mergeChoices } from '../supabase/functions/save-sync/logic';

afterEach(() => setPuzzles([]));

const withEssence = (save: SaveData, e: Partial<SaveData['forge']['essence']>): SaveData => ({ ...save, forge: { ...save.forge, essence: { ...save.forge.essence, ...e } } });
const owned = defaultSave().unlocked;
const ownedId = owned[0];
const missing = (rarity: string) => CARDS.find((c) => c.rarity === rarity && !c.rewardOnly && !owned.includes(c.id))!.id;

describe('Runenschmiede: Duplikate und Essenzen', () => {
  it('Duplikate aus Boostern und Belohnungen kommen in den Schmelztiegel, nicht in Münzen', () => {
    let save = { ...defaultSave(), coins: 100000 };
    for (let i = 0; i < 40; i++) {
      const r = buyPack(save, 'abenteurer', createRng(i));
      if (r.ok) save = r.save;
    }
    expect(save.coins).toBe(100000 - 40 * 150);
    expect(meltCount(save)).toBeGreaterThan(0);
    const g = grantRewards(defaultSave(), [{ key: 'k', source: 'Test', reward: { type: 'card', cardId: ownedId } }], createRng(1));
    expect(g.save.coins).toBe(0);
    expect(g.granted[0].duplicates).toEqual([ownedId]);
    expect(g.save.forge.melt[ownedId]).toBe(1);
  });

  it('Einschmelzen: eine Essenz der Seltenheit pro Kopie, einzeln oder alle', () => {
    const id = ownedId;
    const r = getCard(id).rarity;
    let save = addDuplicate(addDuplicate(defaultSave(), id), id);
    expect(save.forge.melt[id]).toBe(2);
    const m = meltCards(save, [id]);
    expect(m.ok && m.gained[r]).toBe(2);
    if (!m.ok) return;
    expect(m.save.forge.essence[r]).toBe(2);
    expect(m.save.forge.melt[id]).toBeUndefined();
    expect(meltCards(m.save).ok).toBe(false);
    save = addDuplicate(m.save, CARDS[5].id);
    const all = meltCards(save);
    expect(all.ok && meltCount(all.save)).toBe(0);
  });

  it('Veredeln 4 : 1 in die nächste Seltenheit; mystisch nicht weiter', () => {
    const save = withEssence(defaultSave(), { common: 9 });
    const r = refineEssence(save, 'common', 2);
    expect(r.ok && r.save.forge.essence).toMatchObject({ common: 1, uncommon: 2 });
    expect(refineEssence(save, 'common', 3).ok).toBe(false);
    expect(refineEssence(withEssence(defaultSave(), { mythic: 10 }), 'mythic').ok).toBe(false);
  });
});

describe('Runenschmiede: Wunschkarte, Editionen, Rahmen', () => {
  it('Wunschkarte: nur fehlende Boosterkarten, kostet Essenz ihrer Seltenheit', () => {
    const id = missing('legendary');
    expect(craftCard(defaultSave(), id).ok).toBe(false);
    const save = withEssence(defaultSave(), { legendary: DEFAULT_FORGE.craft.legendary });
    const r = craftCard(save, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.unlocked).toContain(id);
    expect(r.save.forge.essence.legendary).toBe(0);
    expect(craftCard(withEssence(r.save, { legendary: 10 }), id).ok).toBe(false);
    expect(craftCard(withEssence(save, { common: 99 }), ownedId).ok).toBe(false);
    expect(craftableCards(defaultSave()).every((c) => !getCard(c).rewardOnly && !owned.includes(c))).toBe(true);
  });

  it('Editionen nur aus beendeten Events, nie aus laufenden', () => {
    const base = { name: 'E', reward: { type: 'edition', editionId: 'ed01' }, pieces: 4, status: 'published', tasks: [] };
    const now = new Date('2026-12-20T00:00:00Z');
    setPuzzles([parsePuzzle('pz01', { ...base, run: { id: 'r1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-20T00:00:00Z' } })!]);
    expect(craftableEditions(defaultSave(), now).map((e) => e.id)).toEqual(['ed01']);
    const rich = withEssence(defaultSave(), { mythic: 5 });
    const r = craftEdition(rich, 'ed01', now);
    expect(r.ok && r.save.editions.owned).toEqual(['ed01']);
    expect(r.ok && r.save.forge.essence.mythic).toBe(5 - DEFAULT_FORGE.edition.cost);
    setPuzzles([parsePuzzle('pz01', { ...base, run: { id: 'r1', startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-30T00:00:00Z' } })!]);
    expect(craftEdition(rich, 'ed01', now).ok).toBe(false);
  });

  it('Rahmen: kaufen, anlegen, nicht doppelt; fremde Werte werden verworfen', () => {
    const save = withEssence(defaultSave(), { rare: 6 });
    const r = buyFrame(save, 'fr-runen');
    expect(r.ok && r.save.forge.frame).toBe('fr-runen');
    if (!r.ok) return;
    expect(buyFrame(withEssence(r.save, { rare: 99 }), 'fr-runen').ok).toBe(false);
    expect(equipFrame(r.save, null).forge.frame).toBeNull();
    expect(equipFrame(r.save, 'fr-sterne').forge.frame).toBeNull();
    expect(sanitizeForge({ essence: { common: -5, mythic: 'x', rare: 3 }, melt: { c01: 2, '<x>': 4 }, frames: ['fr-runen', 'hack'], frame: 'fr-glut' }))
      .toEqual({ essence: { common: 0, uncommon: 0, rare: 3, epic: 0, legendary: 0, mythic: 0 }, melt: { c01: 2 }, frames: ['fr-runen'], frame: null });
  });

  it('Admin-Preise werden begrenzt, fehlende fallen auf Standard', () => {
    const c = parseForgeDoc({ craft: { common: 0, mythic: 7 }, refine: 100, fragment: { rarity: 'hack', cost: 3 } });
    expect(c.craft.common).toBe(1);
    expect(c.craft.mythic).toBe(7);
    expect(c.refine).toBe(20);
    expect(c.fragment).toEqual({ rarity: 'rare', cost: 3, perStage: 2 });
  });
});

describe('Runenschmiede: Puzzle-Fragmente', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const p = parsePuzzle('pz01', {
    name: 'E', reward: { type: 'edition', editionId: 'ed01' }, pieces: 4, status: 'published', tasks: [],
    run: { id: 'r1', startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-24T00:00:00Z' },
  })!;
  const rich = withEssence(defaultSave(), { rare: 20 });

  it('höchstens 2 pro Stufe, ein fehlendes Teil der aktuellen Stufe, Essenz wird bezahlt', () => {
    const a = forgeFragment(rich, p, [], [], 's1', now);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.key).toBe('r1:forge:0:f1');
    expect(a.piece).toBeGreaterThanOrEqual(0);
    expect(a.piece).toBeLessThan(4);
    expect(a.save.forge.essence.rare).toBe(20 - DEFAULT_FORGE.fragment.cost);
    const b = forgeFragment(a.save, p, [a.piece], [a.key], 's2', now);
    expect(b.ok && b.key).toBe('r1:forge:0:f2');
    if (!b.ok) return;
    expect(b.piece).not.toBe(a.piece);
    expect(fragmentsLeft(p, [a.piece, b.piece], [a.key, b.key], now).left).toBe(0);
    expect(forgeFragment(b.save, p, [a.piece, b.piece], [a.key, b.key], 's3', now).ok).toBe(false);
  });

  it('das letzte Teil einer Stufe: die Edition kommt über das Postfach (nicht direkt); beendete Events nicht', () => {
    const r = forgeFragment(rich, p, [0, 1, 2], [], 's', now);
    expect(r.ok && r.piece).toBe(3);
    expect(r.ok && r.save.editions.owned).not.toContain('ed01');
    expect(r.ok && r.total).toBe(totalPieces(p));
    expect(forgeFragment(rich, p, [], [], 's', new Date('2026-11-25T00:00:00Z')).ok).toBe(false);
    expect(forgeFragment(defaultSave(), p, [], [], 's', now).ok).toBe(false);
  });
});

describe('Runenschmiede: Speichern', () => {
  it('Spielstand behält Essenzen; der Server übernimmt vom Gerät nur den Rahmen (wenn gekauft)', () => {
    const stored = sanitize({ ...defaultSave(), forge: { essence: { rare: 5 }, melt: { [ownedId]: 1 }, frames: ['fr-runen'], frame: null } });
    const device = sanitize({ ...stored, forge: { essence: { rare: 999, mythic: 99 }, melt: {}, frames: ['fr-runen', 'fr-glut'], frame: 'fr-runen' } });
    const merged = sanitize(mergeChoices(cleanSave(stored), cleanSave(device)));
    expect(merged.forge.essence.rare).toBe(5);
    expect(merged.forge.essence.mythic).toBe(0);
    expect(merged.forge.melt[ownedId]).toBe(1);
    expect(merged.forge.frames).toEqual(['fr-runen']);
    expect(merged.forge.frame).toBe('fr-runen');
    const hacked = sanitize(mergeChoices(cleanSave(stored), cleanSave(sanitize({ ...stored, forge: { ...stored.forge, frames: ['fr-glut'], frame: 'fr-glut' } }))));
    expect(hacked.forge.frame).toBeNull();
  });
});
