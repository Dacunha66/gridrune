// The server functions load the game rules as one bundled file (public/server/engine-<hash>.js, made by
// scripts/build-engine.mjs). These checks run on every push: the bundle loads and survives real content (a crash
// here took the server functions down once), every function points at the same engine, and every name a function
// imports really exists in it. Pointing all functions at the engine: node scripts/set-engine.mjs
import { describe, expect, it } from 'vitest';
import content from './fixtures/content-sample.json';

const ENGINE_URL = /https:\/\/cdn\.jsdelivr\.net\/gh\/Dacunha66\/gridrune@([0-9a-f]{40})\/public\/server\/(engine-[0-9a-f]+\.js)/;
type Engine = Record<string, unknown> & {
  loadContent: (rows: unknown[], isAdmin: boolean) => void;
  ladderStatusServer: (raw: unknown) => { state: { step: number } };
  questPeriod: () => { day: string };
};

const engineFiles = import.meta.glob<Engine>('../public/server/engine-*.js');
const sources = import.meta.glob<string>('../supabase/functions/*/index.ts', { query: '?raw', import: 'default', eager: true });
const functions = Object.entries(sources).flatMap(([path, src]) => {
  const m = src.match(ENGINE_URL);
  if (!m) return [];
  const block = src.match(/import\s*\{([^}]*)\}\s*from\s*'https:\/\/cdn\.jsdelivr\.net[^']*'/);
  const names = (block?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return [{ fn: path.split('/').slice(-2)[0], commit: m[1], file: m[2], names }];
});
const engineName = (path: string) => path.split('/').pop()!;

describe('Server-Regeln (Engine-Bündel)', () => {
  it('es gibt genau eine Engine-Datei', () => {
    expect(Object.keys(engineFiles)).toHaveLength(1);
  });

  it('alle Server-Funktionen nutzen dieselbe Engine (Datei und Stand)', () => {
    expect(functions.length).toBeGreaterThanOrEqual(7);
    const list = functions.map((f) => `${f.fn}: ${f.file}@${f.commit.slice(0, 7)}`).join('\n');
    expect(new Set(functions.map((f) => f.file)).size, list).toBe(1);
    expect(new Set(functions.map((f) => f.commit)).size, list).toBe(1);
    expect(functions[0].file, 'Die Funktionen zeigen nicht auf die aktuelle Engine – node scripts/set-engine.mjs').toBe(engineName(Object.keys(engineFiles)[0]));
  });

  it('lädt mit echten Inhalten und kennt alle Namen, die die Funktionen brauchen', async () => {
    const engine = await Object.values(engineFiles)[0]();
    expect(() => engine.loadContent(content, false)).not.toThrow();
    expect(() => engine.loadContent(content, true)).not.toThrow();
    for (const f of functions) {
      const missing = f.names.filter((n) => !(n in engine));
      expect(missing, `${f.fn} importiert, was es nicht gibt`).toEqual([]);
    }
    // A few calls the functions make right after loading.
    expect(engine.ladderStatusServer(null).state.step).toBe(0);
    expect(engine.questPeriod().day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
