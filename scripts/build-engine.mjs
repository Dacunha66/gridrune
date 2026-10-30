// Bundles the server rules (src/server/engine.ts) into one file with a fingerprint in its name:
// public/server/engine-<hash>.js is published with the web version, and the server functions import exactly
// that file (supabase/functions/*/index.ts). A changed engine gets a new name, so nothing changes unnoticed.
import { build } from 'esbuild';
import { createHash } from 'crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';

const out = await build({
  entryPoints: ['src/server/engine.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  minify: true, legalComments: 'none', write: false,
});
const code = out.outputFiles[0].text;
const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
mkdirSync('public/server', { recursive: true });
for (const f of readdirSync('public/server')) if (f.startsWith('engine-')) rmSync(`public/server/${f}`);
writeFileSync(`public/server/engine-${hash}.js`, code);
console.log(`public/server/engine-${hash}.js – after pushing: https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@<commit>/public/server/engine-${hash}.js`);
