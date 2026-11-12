import { describe, expect, it } from 'vitest';
import { cardCrop, cropToPortrait } from '../src/game/cardStore';

describe('Kartenbild: Ausschnitt wählen', () => {
  it('Zoom 1 in der Mitte ist derselbe Zuschnitt wie bisher', () => {
    const a = cardCrop(4000, 3000, { zoom: 1, cx: 0.5, cy: 0.5 });
    const b = cropToPortrait(4000, 3000);
    expect([a.sx, a.sy, a.sw, a.sh, a.outW, a.outH]).toEqual([b.sx, b.sy, b.sw, b.sh, b.outW, b.outH]);
  });
  it('Zoom verkleinert den Ausschnitt, er bleibt 3:4 und im Bild', () => {
    const c = cardCrop(4000, 3000, { zoom: 2, cx: 0, cy: 1 });
    expect(c.sw / c.sh).toBeCloseTo(0.75, 5);
    expect(c.sw).toBeCloseTo(1125, 5);
    expect(c.sx).toBe(0);
    expect(c.sy + c.sh).toBeCloseTo(3000, 5);
    const r = cardCrop(4000, 3000, { zoom: 1, cx: 1, cy: 0.5 });
    expect(r.sx + r.sw).toBeCloseTo(4000, 5);
  });
  it('unsinnige Werte werden begrenzt', () => {
    const c = cardCrop(800, 1200, { zoom: 99, cx: Number.NaN, cy: -5 });
    expect(c.sw).toBeCloseTo(800 / 4, 5);
    expect(c.sy).toBe(0);
    expect(cardCrop(800, 1200, { zoom: 0.1, cx: 0.5, cy: 0.5 }).sw).toBe(800);
  });
});
