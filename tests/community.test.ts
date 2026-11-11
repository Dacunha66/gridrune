import { describe, expect, it } from 'vitest';
import { checkClanName, checkClanTag, cleanDescription, cleanMessage, cleanWords, filterWords } from '../supabase/functions/community/logic';

describe('Community: Texte', () => {
  it('Wortfilter: Beleidigungen werden ersetzt, auch mit Ersatzzeichen; harmlose Wörter bleiben', () => {
    expect(filterWords('du Arschloch').text).toBe('du ********');
    expect(filterWords('du 4r5chl0ch').hit).toBe(true);
    expect(filterWords('Hurens0hnnn').hit).toBe(true);
    expect(filterWords('Der Barsch im Bach').hit).toBe(false);
    expect(filterWords('Guter Zug, gut gespielt!').hit).toBe(false);
    expect(filterWords('du kartoffel', ['Kartoffel']).hit).toBe(true);
  });
  it('Nachrichten: getrimmt, max. 200 Zeichen, ohne Links und Steuerzeichen; leer = nichts', () => {
    expect(cleanMessage('  hallo   welt  ')).toBe('hallo welt');
    expect(cleanMessage('schau www.example.com und https://x.io/a')).toBe('schau [Link entfernt] und [Link entfernt]');
    expect(cleanMessage('meine seite spam.de')).toBe('meine seite [Link entfernt]');
    expect(cleanMessage('a'.repeat(500))!.length).toBe(200);
    expect(cleanMessage('   ')).toBeNull();
    expect(cleanMessage(42)).toBeNull();
    expect(cleanMessage('hi​\u0007du')).toBe('hi du');
  });
  it('Clanname und Kürzel', () => {
    expect(checkClanName('  Die  Wölfe ')).toEqual({ ok: true, name: 'Die Wölfe' });
    expect(checkClanName('ab').ok).toBe(false);
    expect(checkClanName('<script>').ok).toBe(false);
    expect(checkClanName('Fuck Clan').ok).toBe(false);
    expect(checkClanTag('wolf')).toEqual({ ok: true, tag: 'WOLF' });
    expect(checkClanTag('W').ok).toBe(false);
    expect(checkClanTag('WÖLF2').ok).toBe(false);
    expect(cleanDescription('Hallo www.spam.de Freunde')).toBe('Hallo Freunde');
    expect(cleanWords(' Kartoffel , A, kartoffel\nRübe')).toEqual(['kartoffel', 'rübe']);
  });
});

import { berlinWeek } from '../supabase/functions/community/logic';
import { questWeek } from '../src/game/quests';
describe('Community: Woche', () => {
  it('gleiche Woche wie die Erfolge (Montag 0 Uhr Berlin)', () => {
    for (const t of ['2026-11-11T12:00:00Z', '2026-11-15T22:59:00Z', '2026-11-15T23:00:00Z', '2026-12-31T23:30:00Z', '2027-01-03T12:00:00Z']) {
      expect(berlinWeek(new Date(t))).toBe(questWeek(new Date(t)));
    }
  });
});
