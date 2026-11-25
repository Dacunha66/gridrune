import { describe, expect, it } from 'vitest';
import { isSoundOn, onSoundChange, setSoundOn, sfx } from '../src/game/sound';

describe('Töne', () => {
  it('lassen sich aus- und einschalten und brechen ohne Audio nie das Spiel', () => {
    const seen: boolean[] = [];
    const off = onSoundChange((v) => seen.push(v));
    setSoundOn(false);
    expect(isSoundOn()).toBe(false);
    expect(() => sfx('win')).not.toThrow();
    setSoundOn(true);
    expect(isSoundOn()).toBe(true);
    for (const k of ['tap', 'place', 'flip', 'rune', 'win', 'lose', 'draw', 'coin', 'reward'] as const) expect(() => sfx(k)).not.toThrow();
    off();
    expect(seen).toEqual([false, true]);
  });
});
