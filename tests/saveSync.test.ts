import { describe, expect, it } from 'vitest';
// The server function's rules (Deno file without Deno APIs – the same code runs on the server).
import { COIN_STEP, cleanCampaign, cleanSave, implausible, mergeChoices } from '../supabase/functions/save-sync/logic';
import { defaultSave } from '../src/game/storage';
import { emptyProgress } from '../src/game/campaignProgress';

const base = () => cleanSave({ ...defaultSave(), coins: 500 });
const camp = (stars: boolean[] = [true, false, false], wins = 1) =>
  cleanCampaign({ ...emptyProgress(), missions: { m001: { wins, draws: 0, losses: 0, stars, goalsMet: [], firstWinAt: null, lastPlayedAt: null } } });

describe('Spielstand im Konto: Prüfung auf dem Server', () => {
  it('normales Weiterspielen wird angenommen (Sieg, Booster, Deck, Sterne)', () => {
    const old = base();
    const next = cleanSave({ ...old, coins: 500 + 100 - 150 + 25, unlocked: [...(old.unlocked as string[]), 'r01', 'u05'], stats: { wins: 1, draws: 0, losses: 0, runs: 1 } });
    expect(implausible(old, next, camp(), camp([true, true, false], 2), 1)).toBeNull();
  });
  it('lehnt unmögliche Sprünge ab', () => {
    const old = base();
    expect(implausible(old, cleanSave({ ...old, coins: 500 + COIN_STEP + 1 }), camp(), camp(), 0)).toMatch(/Münzen/);
    expect(implausible(old, cleanSave({ ...old, unlocked: (old.unlocked as string[]).slice(1) }), camp(), camp(), 0)).toMatch(/Karten verschwunden/);
    const many = Array.from({ length: 13 }, (_, i) => `x${String(i + 10)}`);
    expect(implausible(old, cleanSave({ ...old, unlocked: [...(old.unlocked as string[]), ...many] }), camp(), camp(), 0)).toMatch(/zu viele neue Karten/);
    expect(implausible(old, old, camp([true, true, false]), camp([true, false, false]), 0)).toMatch(/Kampagne/);
    const st = cleanSave({ ...old, stats: { wins: 3, draws: 0, losses: 0, runs: 3 } });
    expect(implausible(st, old, camp(), camp(), 0)).toMatch(/Statistik/);
  });
  it('längere Offline-Zeit erlaubt entsprechend mehr Münzen', () => {
    const old = base();
    const rich = cleanSave({ ...old, coins: 500 + COIN_STEP + 3000 });
    expect(implausible(old, rich, camp(), camp(), 0)).not.toBeNull();
    expect(implausible(old, rich, camp(), camp(), 15)).toBeNull();
  });
  it('bereinigt fremde und kaputte Werte', () => {
    const s = cleanSave({ coins: -5, unlocked: ['c01', '<script>', 'c01'], deck: ['c01', 'zz99'], hacked: true, runes: { owned: ['rn01', 'x'], equipped: 'evil' } });
    expect(s.coins).toBe(0);
    expect(s.unlocked).toEqual(['c01']);
    expect(s.deck).toEqual(['c01']);
    expect('hacked' in s).toBe(false);
    expect(s.runes).toEqual({ owned: ['rn01'], equipped: null });
    const c = cleanCampaign({ missions: { m001: { wins: 2, stars: [true, 'yes'] }, bad: {} } });
    expect(Object.keys(c.missions as object)).toEqual(['m001']);
  });
});

describe('Spielstand gesperrt (Phase 4d)', () => {
  it('nur Deck, Einstellungen, ausgerüstete Skins und Rune kommen vom Spiel', () => {
    const stored = cleanSave({ ...defaultSave(), coins: 300 });
    const owned = stored.unlocked as string[];
    const deck = [...(stored.deck as string[])].reverse();
    const cheat = { ...stored, coins: 99999, unlocked: [...owned, 'l03'], deck, stats: { wins: 50, draws: 0, losses: 0, runs: 50 },
      settings: { reducedMotion: true }, skins: { owned: ['card-saphir', 'runner-blau', 'card-smaragd'], card: 'card-smaragd', runner: 'runner-blau' },
      runes: { owned: ['rn01', 'rn02'], equipped: 'rn01' } };
    const m = mergeChoices(stored, cheat) as unknown as ReturnType<typeof defaultSave>;
    expect(m.coins).toBe(300);
    expect(m.unlocked).toEqual(owned);
    expect(m.stats.wins).toBe(0);
    expect(m.deck).toEqual(deck);
    expect(m.settings.reducedMotion).toBe(true);
    expect(m.skins.card).toBe('card-saphir');
    expect(m.skins.owned).toEqual(stored.skins && (stored.skins as { owned: string[] }).owned);
    expect(m.runes).toEqual({ owned: [], equipped: 'rn01' });
  });
  it('ein Deck mit fremden Karten wird nicht übernommen', () => {
    const stored = cleanSave(defaultSave());
    const bad = [...(stored.deck as string[]).slice(1), 'l03'];
    expect((mergeChoices(stored, { ...stored, deck: bad }) as { deck: string[] }).deck).toEqual(stored.deck);
  });
});
