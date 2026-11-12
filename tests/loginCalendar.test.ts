import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGIN, LOGIN_DAYS, loginClaim, loginView, parseLoginConfig } from '../src/game/loginCalendar';
import { loginClaimServer } from '../src/server/engine';
import { defaultSave } from '../src/game/storage';

const at = (iso: string) => new Date(iso);
const fresh = { claimed: 0, lastDay: null };

describe('Login-Kalender', () => {
  it('Tag 1 ist heute dran, danach erst morgen wieder', () => {
    const now = at('2026-11-12T10:00:00Z');
    const v = loginView(fresh, DEFAULT_LOGIN, now);
    expect(v.canClaim).toBe(true);
    expect(v.fields.map((f) => f.state)).toEqual(['today', 'open', 'open', 'open', 'open', 'open', 'open']);
    const c = loginClaim(fresh, DEFAULT_LOGIN, now)!;
    expect(c.day).toBe(1);
    expect(c.reward).toEqual({ type: 'coins', amount: 50 });
    expect(c.state).toEqual({ claimed: 1, lastDay: '2026-11-12' });
    expect(loginClaim(c.state, DEFAULT_LOGIN, at('2026-11-12T22:30:00Z'))).toBeNull(); // 23:30 in Berlin: noch derselbe Tag
    const after = loginView(c.state, DEFAULT_LOGIN, now);
    expect(after.canClaim).toBe(false);
    expect(after.fields[0].state).toBe('done');
    expect(loginClaim(c.state, DEFAULT_LOGIN, at('2026-11-12T23:30:00Z'))?.day).toBe(2); // 00:30 in Berlin
  });
  it('verpasste Tage: der Kalender zählt einfach weiter', () => {
    const c = loginClaim({ claimed: 3, lastDay: '2026-11-01' }, DEFAULT_LOGIN, at('2026-11-12T10:00:00Z'))!;
    expect(c.day).toBe(4);
  });
  it('nach Tag 7 beginnt er wieder bei Tag 1; Tag 7 bleibt bis morgen sichtbar', () => {
    const c = loginClaim({ claimed: 6, lastDay: '2026-11-11' }, DEFAULT_LOGIN, at('2026-11-12T10:00:00Z'))!;
    expect(c.day).toBe(LOGIN_DAYS);
    expect(c.reward.packId).toBe('helden');
    expect(loginView(c.state, DEFAULT_LOGIN, at('2026-11-12T12:00:00Z')).fields.every((f) => f.state === 'done')).toBe(true);
    expect(loginClaim(c.state, DEFAULT_LOGIN, at('2026-11-13T10:00:00Z'))?.day).toBe(1);
  });
  it('ausgeschaltet: nichts abzuholen', () => {
    const off = { ...DEFAULT_LOGIN, enabled: false };
    expect(loginClaim(fresh, off)).toBeNull();
    expect(loginView(fresh, off).canClaim).toBe(false);
  });
  it('Admin-Daten werden geprüft; Unsinn wird durch die Grundeinstellung des Tages ersetzt', () => {
    const c = parseLoginConfig({ enabled: true, rewards: [{ type: 'coins', amount: 20 }, { type: 'title', label: 'x' }, { type: 'pack', packId: 'helden', amount: 50 }, null] });
    expect(c.rewards).toHaveLength(7);
    expect(c.rewards[0]).toEqual({ type: 'coins', amount: 20 });
    expect(c.rewards[1]).toEqual(DEFAULT_LOGIN.rewards[1]);
    expect(c.rewards[2]).toEqual({ type: 'pack', packId: 'helden', amount: 10 });
    expect(c.rewards[3]).toEqual(DEFAULT_LOGIN.rewards[3]);
    expect(parseLoginConfig(null).enabled).toBe(true);
  });
  it('Server zahlt Münzen und Packs in den Spielstand', () => {
    const save = defaultSave();
    const r = loginClaimServer(save, fresh, 'seed', at('2026-11-12T10:00:00Z'))!;
    expect(r.save.coins).toBe(save.coins + 50);
    expect(r.before).toBe(0);
    const p = loginClaimServer(save, { claimed: 4, lastDay: '2026-11-11' }, 'seed', at('2026-11-12T10:00:00Z'))!;
    expect(p.day).toBe(5);
    expect(p.granted.cards.length + p.granted.duplicates.length).toBeGreaterThan(0);
    expect(loginClaimServer(save, r.state, 'seed', at('2026-11-12T11:00:00Z'))).toBeNull();
  });
});
