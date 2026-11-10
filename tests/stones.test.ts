import { describe, expect, it } from 'vitest';
import { DEFAULT_STONES, buyCoins, buyOffer, claimFreeCoins, dailyOffers, freeCoinsAt, isOfferBought, offerPrice, parseStoneDoc } from '../src/game/stones';
import { defaultSave, sanitize } from '../src/game/storage';
import { CARDS, getCard } from '../src/game/cards';
import { grantRewards } from '../src/game/campaignRewards';
import { grantQuestRewards } from '../src/game/quests';
import { createRng } from '../src/game/rng';
import { cleanSave, mergeChoices } from '../supabase/functions/save-sync/logic';

const t0 = new Date('2026-11-10T08:00:00Z');
const later = (h: number) => new Date(t0.getTime() + h * 3600_000);

describe('Runensteine: Gratis-Münzen', () => {
  it('100 Münzen, danach erst nach 12 Stunden wieder', () => {
    const a = claimFreeCoins(defaultSave(), t0);
    expect(a.ok && a.save.coins).toBe(100);
    if (!a.ok) return;
    expect(freeCoinsAt(a.save, later(11.9))).not.toBeNull();
    expect(claimFreeCoins(a.save, later(11.9)).ok).toBe(false);
    const b = claimFreeCoins(a.save, later(12));
    expect(b.ok && b.save.coins).toBe(200);
  });
});

describe('Runensteine: Münzen kaufen', () => {
  it('zieht Steine ab und gibt Münzen; ohne genug Steine nicht', () => {
    const s = { ...defaultSave(), stones: 130 };
    const r = buyCoins(s, 'c2');
    expect(r.ok && [r.save.stones, r.save.coins]).toEqual([10, 2000]);
    expect(buyCoins({ ...s, stones: 49 }, 'c1').ok).toBe(false);
    expect(buyCoins(s, 'x9').ok).toBe(false);
  });
  it('ein Paket für 50 Steine reicht für ein Helden-Pack (750 Münzen)', () => {
    expect(DEFAULT_STONES.coinBundles[0].coins).toBeGreaterThanOrEqual(750);
  });
});

describe('Runensteine: Kartenangebote', () => {
  it('jeden Tag neue Angebote, nur Karten, die man nicht hat, gleich für denselben Spieler', () => {
    const s = defaultSave();
    const a = dailyOffers(s, 'u1', t0);
    expect(a.length).toBe(DEFAULT_STONES.offers);
    expect(new Set(a).size).toBe(a.length);
    expect(a.some((id) => s.unlocked.includes(id))).toBe(false);
    expect(a.every((id) => !getCard(id).rewardOnly)).toBe(true);
    expect(dailyOffers(s, 'u1', later(3))).toEqual(a);
    expect(dailyOffers(s, 'u1', later(48))).not.toEqual(a);
    expect(dailyOffers(s, 'u2', t0)).not.toEqual(a);
  });
  it('kaufen: Karte dazu, Steine weg, Angebot bleibt gleich und ist als gekauft markiert', () => {
    const s = { ...defaultSave(), stones: 5000 };
    const offers = dailyOffers(s, 'u1', t0);
    const id = offers[2];
    const r = buyOffer(s, 'u1', id, t0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.unlocked).toContain(id);
    expect(r.save.stones).toBe(5000 - offerPrice(id));
    expect(dailyOffers(r.save, 'u1', t0)).toEqual(offers);
    expect(isOfferBought(r.save, id, t0)).toBe(true);
    expect(buyOffer(r.save, 'u1', id, t0).ok).toBe(false);
    // A card that is not offered today cannot be bought.
    const other = CARDS.find((c) => !offers.includes(c.id) && !s.unlocked.includes(c.id))!;
    expect(buyOffer(s, 'u1', other.id, t0).ok).toBe(false);
    expect(buyOffer({ ...s, stones: 0 }, 'u1', id, t0).ok).toBe(false);
  });
  it('Preise nach Seltenheit; Admin-Werte werden geprüft', () => {
    const c = parseStoneDoc({ freeCoins: -5, freeHours: 0, cardPrice: { epic: 77 }, coinBundles: [{ stones: 10, coins: 'x' }], payments: true });
    expect(c.freeCoins).toBe(0);
    expect(c.freeHours).toBe(1);
    expect(c.cardPrice.epic).toBe(77);
    expect(c.cardPrice.common).toBe(DEFAULT_STONES.cardPrice.common);
    expect(c.coinBundles[0]).toEqual({ id: 'c1', stones: 10, coins: DEFAULT_STONES.coinBundles[0].coins });
    expect(c.payments).toBe(false);
  });
});

describe('Runensteine: verdienen und speichern', () => {
  it('Belohnungen aus Kampagne/Raid und Erfolgen geben Steine', () => {
    const r = grantRewards(defaultSave(), [{ key: 'k', source: 'Test', reward: { type: 'stones', amount: 30 } }], createRng(1));
    expect(r.save.stones).toBe(30);
    expect(r.granted[0].stones).toBe(30);
    const q = grantQuestRewards(defaultSave(), { owned: [], equipped: null }, [{ key: 'q', source: 'Quest', reward: { type: 'stones', amount: 20 } }], createRng(1));
    expect(q.save.stones).toBe(20);
  });
  it('Spielstand behält Steine; der Server übernimmt sie nie vom Gerät', () => {
    const s = sanitize({ ...defaultSave(), stones: 42, shop: { freeAt: t0.toISOString(), offerDay: '2026-11-10', offerBought: ['c01'] } });
    expect(s.stones).toBe(42);
    expect(s.shop.freeAt).toBe(t0.toISOString());
    const stored = cleanSave(s);
    expect(stored.stones).toBe(42);
    const merged = mergeChoices(stored, { ...s, stones: 99999, shop: { freeAt: null, offerDay: '', offerBought: [] } }) as { stones: number; shop: { freeAt: string | null } };
    expect(merged.stones).toBe(42);
    expect(merged.shop.freeAt).toBe(t0.toISOString());
  });
});
