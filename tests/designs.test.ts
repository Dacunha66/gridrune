import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT, EMPTY_STATE, LAYOUT_LIMITS, clampFit, clampLayout, designToDoc, displaySize, dragFit, fitStyle, layoutVars, newDesign,
  nextDesignId, parseDesign, parseDesignState, publish, restorePrevious,
} from '../src/game/designs';

describe('Design-Daten', () => {
  it('ungültige Werte werden in sichere Grenzen gebracht', () => {
    const l = clampLayout({ size: 5, offsetY: -1, gap: 99, frame: -3, cellAlpha: 2, cellBorders: 'ja' });
    expect(l).toEqual({ size: LAYOUT_LIMITS.size[1], offsetY: 0, gap: LAYOUT_LIMITS.gap[1], frame: 0, cellAlpha: 1, cellBorders: DEFAULT_LAYOUT.cellBorders });
    expect(clampLayout({ size: 0.1 }).size).toBe(LAYOUT_LIMITS.size[0]);
    expect(clampFit({ zoom: 0.2, px: 3, py: 'x' })).toEqual({ zoom: 1, px: 1, py: 0.5 });
    expect(clampFit({ zoom: 99 }).zoom).toBe(4);
  });

  it('Dokumente aus der Datenbank werden geprüft, fremde Daten verworfen', () => {
    const d = newDesign('d001', 'board', 't');
    const doc = { ...designToDoc({ ...d, imageId: 'aaaaaaaa1', displayId: 'bbbbbbbb2', imageW: 3000, imageH: 4000 }), evil: '<script>' };
    const back = parseDesign('d001', doc)!;
    expect(back).toMatchObject({ id: 'd001', kind: 'board', imageId: 'aaaaaaaa1', displayId: 'bbbbbbbb2', imageW: 3000, imageH: 4000 });
    expect(back).not.toHaveProperty('evil');
    expect(parseDesign('x1', doc)).toBeNull();
    expect(parseDesign('d002', { ...doc, kind: 'arena' })).toBeNull();
    expect(parseDesign('d003', { ...doc, imageId: '../../etc' })!.imageId).toBeNull();
    expect(parseDesignState({ board: 'd001', page: 'nope', boardPrev: null })).toMatchObject({ board: 'd001', page: null, boardPrev: null });
  });

  it('IDs werden fortlaufend vergeben', () => {
    expect(nextDesignId([])).toBe('d001');
    expect(nextDesignId(['d001', 'd009', 'x'])).toBe('d010');
  });
});

describe('Veröffentlichen und zurück', () => {
  it('merkt sich das vorherige Design und kann zurückkehren', () => {
    let s = publish(EMPTY_STATE, 'board', 'd001', 't1');
    expect(s).toMatchObject({ board: 'd001', boardPrev: null });
    s = publish(s, 'board', 'd002', 't2');
    expect(s).toMatchObject({ board: 'd002', boardPrev: 'd001' });
    s = restorePrevious(s, 'board', 't3');
    expect(s).toMatchObject({ board: 'd001', boardPrev: 'd002' });
    s = publish(s, 'board', null, 't4');
    expect(s).toMatchObject({ board: null, boardPrev: 'd001' });
    expect(s.page).toBeNull();
  });
  it('Spielfeld und Hintergrund sind unabhängig', () => {
    const s = publish(publish(EMPTY_STATE, 'page', 'd005'), 'board', 'd001');
    expect(s).toMatchObject({ page: 'd005', board: 'd001' });
  });
});

describe('Bildausschnitt', () => {
  it('Kopie fürs Spiel: ganzes Bild, nur verkleinert, nie vergrößert oder beschnitten', () => {
    expect(displaySize(3024, 4032, { w: 1536, h: 2048 })).toEqual({ w: 1536, h: 2048 });
    expect(displaySize(4000, 2000, { w: 1536, h: 2048 })).toEqual({ w: 1536, h: 768 });
    expect(displaySize(800, 600, { w: 1536, h: 2048 })).toEqual({ w: 800, h: 600 });
  });
  it('Verschieben mit dem Finger: Richtung, Grenzen, ohne Überstand keine Bewegung', () => {
    const fit = { zoom: 1, px: 0.5, py: 0.5 };
    // Wide picture on a 3:4 frame: only horizontal room (picture 600 px wide on a 300 px frame).
    const moved = dragFit(fit, -30, 50, 2000, 1333.33, 300, 400);
    expect(moved.px).toBeCloseTo(0.5 + 30 / 300, 2);
    expect(moved.py).toBe(0.5);
    expect(dragFit(fit, -9999, 0, 2000, 1333.33, 300, 400).px).toBe(1);
    expect(dragFit({ ...fit, zoom: 2 }, 0, -40, 2000, 1333.33, 300, 400).py).toBeCloseTo(0.5 + 40 / 400, 2);
  });
  it('CSS: Zoom um den gewählten Bildpunkt', () => {
    expect(fitStyle({ zoom: 1.5, px: 0, py: 1 })).toEqual({ objectPosition: '0.00% 100.00%', transform: 'scale(1.500)', transformOrigin: '0.00% 100.00%' });
    expect(layoutVars({ ...DEFAULT_LAYOUT, gap: 6 })['--board-gap']).toBe('6px');
  });
});
