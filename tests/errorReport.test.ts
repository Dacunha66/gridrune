import { describe, expect, it } from 'vitest';
import { deviceKind } from '../src/game/errorReport';

describe('Fehlersammlung: Geräteart ohne persönliche Daten', () => {
  it('nennt nur Gerät und Browser', () => {
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Windows · Firefox');
  });
});
