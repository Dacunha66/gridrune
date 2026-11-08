import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUESTS, QuestConfig, QuestState, activeQuests, addEvent, claimQuests, claimable, emptyQuestState, eventDelta, parseQuestConfig, parseQuestState,
  questBoard, questDay, questWeek,
} from '../src/game/quests';
import { defaultSave } from '../src/game/storage';

const at = (iso: string) => new Date(iso);
const ctx = { cards: 30, worldsComplete: 0, raidsDefeated: 0 };

describe('Erfolge: Tage und Wochen in deutscher Zeit', () => {
  it('der Tag wechselt um Mitternacht in Berlin (Winter- und Sommerzeit)', () => {
    expect(questDay(at('2026-11-05T22:59:00Z'))).toBe('2026-11-05');
    expect(questDay(at('2026-11-05T23:00:00Z'))).toBe('2026-11-06');
    expect(questDay(at('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(questDay(at('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });
  it('die Woche wechselt am Montag um Mitternacht (ISO-Woche)', () => {
    expect(questWeek(at('2026-11-06T12:00:00Z'))).toBe('2026-W45');
    expect(questWeek(at('2026-11-08T22:59:00Z'))).toBe('2026-W45');
    expect(questWeek(at('2026-11-08T23:00:00Z'))).toBe('2026-W46');
    expect(questWeek(at('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('Erfolge: Auswahl der Quests', () => {
  it('pro Tag dieselben 3 verschiedenen Quests für alle, an anderen Tagen andere Auswahl möglich', () => {
    const a = activeQuests(DEFAULT_QUESTS.daily, 3, '2026-11-06');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((d) => d.id)).size).toBe(3);
    expect(activeQuests(DEFAULT_QUESTS.daily, 3, '2026-11-06').map((d) => d.id)).toEqual(a.map((d) => d.id));
    const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((d) => activeQuests(DEFAULT_QUESTS.daily, 3, d).map((x) => x.id).join());
    expect(new Set([a.map((d) => d.id).join(), ...days]).size).toBeGreaterThan(1);
  });
  it('abgeschaltete Quests kommen nicht vor', () => {
    const list = DEFAULT_QUESTS.daily.map((d, i) => ({ ...d, enabled: i < 3 }));
    for (const day of ['2026-11-06', '2026-11-07']) expect(activeQuests(list, 3, day).every((d) => d.enabled)).toBe(true);
  });
});

describe('Erfolge: Fortschritt', () => {
  it('Ereignisse zählen für Tag, Woche und insgesamt; ein neuer Tag beginnt bei 0, insgesamt bleibt', () => {
    let s = emptyQuestState(at('2026-11-06T10:00:00Z'));
    s = addEvent(s, { games: 1, wins: 1, captures: 4, effects: { kampfgeist: 2 } }, at('2026-11-06T10:00:00Z'));
    expect(s.daily).toMatchObject({ games: 1, wins: 1, captures: 4, effects: 2, 'fx:kampfgeist': 2 });
    s = addEvent(s, { games: 1 }, at('2026-11-07T10:00:00Z'));
    expect(s.daily).toEqual({ games: 1 });
    expect(s.weekly.games).toBe(2);
    expect(s.total).toMatchObject({ games: 2, wins: 1, captures: 4 });
  });
  it('ungültige Zahlen und unbekannte Effekte werden ignoriert', () => {
    expect(eventDelta({ games: -3, wins: Number.NaN, effects: { unbekannt: 3 } as never })).toEqual({});
  });
  it('Tafel: erledigt, abgeholt, Bonus erst wenn alle Tagesquests erledigt sind', () => {
    const now = at('2026-11-06T10:00:00Z');
    const config: QuestConfig = { ...DEFAULT_QUESTS, daily: DEFAULT_QUESTS.daily.slice(0, 3) };
    let s = emptyQuestState(now);
    s = addEvent(s, { wins: 2, games: 3 }, now);
    let b = questBoard(config, s, ctx, now);
    const won = b.daily.find((i) => i.id === 'd-win2')!;
    expect(won).toMatchObject({ done: true, claimed: false, progress: 2 });
    expect(b.dailyBonus.done).toBe(false);
    s = addEvent(s, { captures: 20 }, now);
    b = questBoard(config, s, ctx, now);
    expect(b.dailyBonus.done).toBe(true);
    expect(b.daily.find((i) => i.id === 'd-cap15')!.progress).toBe(15);
    b = questBoard(config, { ...s, claimed: [won.key] }, ctx, now);
    expect(b.daily.find((i) => i.id === 'd-win2')!.claimed).toBe(true);
  });
  it('Erfolge mit Stand: Kartenanzahl und verschiedene Effekte', () => {
    const now = at('2026-11-06T10:00:00Z');
    let s = emptyQuestState(now);
    for (const id of ['kampfgeist', 'schildwall', 'arkane_kraft', 'magische_barriere', 'wurzelkraft', 'naturbund', 'flammenherz', 'frostpanzer', 'schattenmantel',
      'schwaechender_blick', 'wirbelwind', 'kettenuebernahme', 'dominanz', 'standhaft']) s = addEvent(s, { effects: { [id]: 1 } }, now);
    const b = questBoard(DEFAULT_QUESTS, s, { ...ctx, cards: 120 }, now);
    expect(b.achievements.find((i) => i.id === 'a-fx14')!.done).toBe(true);
    expect(b.achievements.find((i) => i.id === 'a-cards100')!.done).toBe(true);
    expect(b.achievements.find((i) => i.id === 'a-cards150')!.done).toBe(false);
  });
});

describe('Erfolge: Belohnungen abholen', () => {
  const now = at('2026-11-06T10:00:00Z');
  const config: QuestConfig = {
    ...DEFAULT_QUESTS,
    daily: DEFAULT_QUESTS.daily.slice(0, 3),
    achievements: [
      { id: 'a-t', metric: 'wins', target: 1, reward: { type: 'title', title: 'Tester' }, enabled: true },
      { id: 'a-s', metric: 'wins', target: 1, reward: { type: 'skin', skinId: 'card-runengold' }, enabled: true },
      { id: 'a-p', metric: 'wins', target: 1, reward: { type: 'pack', packId: 'abenteurer', amount: 1 }, enabled: true },
      { id: 'a-far', metric: 'wins', target: 99, reward: { type: 'coins', amount: 999 }, enabled: true },
    ],
  };
  const state = (): QuestState => addEvent(emptyQuestState(now), { wins: 2, games: 3 }, now);
  it('zahlt nur Erledigtes aus: Münzen, Titel, Kartenrücken, Booster', () => {
    const save = defaultSave();
    const r = claimQuests(save, state(), config, ctx, null, 'seed', now)!;
    expect(r.keys).toEqual(expect.arrayContaining([`d:2026-11-06:d-win2`, `d:2026-11-06:d-play3`, 'a:a-t', 'a:a-s', 'a:a-p']));
    expect(r.keys).not.toContain('a:a-far');
    expect(r.save.coins).toBeGreaterThanOrEqual(save.coins + 80);
    expect(r.titles.owned).toEqual(['Tester']);
    expect(r.save.skins.owned).toContain('card-runengold');
    expect(r.save.unlocked.length + r.granted.reduce((n, g) => n + g.duplicates.length, 0)).toBe(save.unlocked.length + 3);
  });
  it('bereits Abgeholtes nie zweimal; nur gewünschte Schlüssel', () => {
    const s = state();
    const first = claimQuests(defaultSave(), s, config, ctx, ['a:a-t'], 'seed', now)!;
    expect(first.keys).toEqual(['a:a-t']);
    expect(claimQuests(defaultSave(), { ...s, claimed: first.keys }, config, ctx, ['a:a-t'], 'seed', now)).toBeNull();
  });
  it('ein Kartenrücken, den man schon hat, wird zu Münzen', () => {
    const save = defaultSave();
    const owned = { ...save, skins: { ...save.skins, owned: [...save.skins.owned, 'card-runengold'] } };
    const r = claimQuests(owned, state(), config, ctx, ['a:a-s'], 'seed', now)!;
    expect(r.save.coins).toBe(owned.coins + 200);
  });
  it('gleiches Ergebnis bei gleichem Seed (Booster)', () => {
    const a = claimQuests(defaultSave(), state(), config, ctx, ['a:a-p'], 'x', now)!;
    const b = claimQuests(defaultSave(), state(), config, ctx, ['a:a-p'], 'x', now)!;
    expect(a.save.unlocked).toEqual(b.save.unlocked);
  });
  it('nichts erledigt → nichts abzuholen', () => {
    const b = questBoard(config, emptyQuestState(now), ctx, now);
    expect(claimable(b)).toEqual([]);
  });
});

describe('Erfolge: gespeicherte Daten sind nicht vertrauenswürdig', () => {
  it('Tages-/Wochenquests dürfen keinen Stand zählen; kaputte Belohnungen fallen weg', () => {
    const c = parseQuestConfig({
      daily: [{ id: 'x', metric: 'cards', target: 5, reward: { type: 'coins', amount: 10 } }, { id: 'y', metric: 'wins', target: 1, reward: { type: 'card' } },
        { id: 'z', metric: 'wins', target: 1, reward: { type: 'coins', amount: 10 } }],
    });
    expect(c.daily.map((d) => d.id)).toEqual(['z']);
    expect(c.weekly.length).toBe(DEFAULT_QUESTS.weekly.length);
  });
  it('ein Titel kann nur getragen werden, wenn man ihn besitzt', () => {
    expect(parseQuestState({ titles: { owned: ['A'], equipped: 'B' } }).titles.equipped).toBeNull();
    expect(parseQuestState({ titles: { owned: ['A'], equipped: 'A' } }).titles.equipped).toBe('A');
  });
});

describe('Erfolge: neue Zähler (v1.41)', () => {
  it('Kantersiege, Runen, Geländeboni und Kristall-Siege werden gezählt', () => {
    expect(eventDelta({ bigWins: 1, runesUsed: 2, terrainBonus: 3, kristallWins: 1 })).toEqual({ big_wins: 1, runes_used: 2, terrain: 3, kristall_wins: 1 });
  });
  it('Erfolgsreihen: eindeutige Kennungen, aufsteigende Stufen, Titel höchstens 24 Zeichen', () => {
    const ids = DEFAULT_QUESTS.achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const chains = new Map<string, number[]>();
    for (const a of DEFAULT_QUESTS.achievements) chains.set(a.chain ?? a.id, [...(chains.get(a.chain ?? a.id) ?? []), a.target]);
    for (const targets of chains.values()) expect(targets).toEqual([...targets].sort((x, y) => x - y));
    expect(DEFAULT_QUESTS.achievements.every((a) => a.reward.type !== 'title' || (a.reward.title ?? '').length <= 24)).toBe(true);
    expect(DEFAULT_QUESTS.achievements.length).toBeGreaterThanOrEqual(50);
  });
});
