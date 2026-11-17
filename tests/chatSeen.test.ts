import { describe, expect, it } from 'vitest';
import { countUnread } from '../src/game/chatSeen';

const me = 'me';
const rows = [
  { id: 10, channel: 'global', player_id: 'a' },
  { id: 9, channel: 'global', player_id: me },
  { id: 8, channel: 'clan:x', player_id: 'b' },
  { id: 7, channel: 'global', player_id: 'blocked' },
  { id: 5, channel: 'global', player_id: 'a' },
];

describe('Neue Chat-Nachrichten', () => {
  it('beim ersten Mal zählt nichts – der jetzige Stand wird Startpunkt', () => {
    const r = countUnread(rows, me, null);
    expect(r.total).toBe(0);
    expect(r.start).toEqual({ global: 10, 'clan:x': 8 });
  });

  it('zählt nur fremde, ungelesene Nachrichten pro Kanal', () => {
    const r = countUnread(rows, me, { global: 6, 'clan:x': 8 }, new Set(['blocked']));
    expect(r.byChannel).toEqual({ global: 1 });
    expect(r.total).toBe(1);
  });

  it('eigene Nachrichten und gelesene zählen nie', () => {
    expect(countUnread(rows, me, { global: 10, 'clan:x': 8 }).total).toBe(0);
  });

  it('ein noch nie geöffneter Kanal (z. B. neuer Clan) zählt erst ab jetzt', () => {
    expect(countUnread(rows, me, { global: 10 }).byChannel).toEqual({});
  });
});
