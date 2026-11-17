// Points every server function that uses the game rules at the same engine file:
//   node scripts/set-engine.mjs            → the commit currently checked out (HEAD)
//   node scripts/set-engine.mjs <commit>   → a given commit
// The engine file (public/server/engine-<hash>.js) must be in that commit. Afterwards: commit, push and deploy ALL
// functions listed below together – tests/engineBundle.test.ts fails if they ever point at different engines.
import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync } from 'fs';

const commit = process.argv[2] ?? execSync('git rev-parse HEAD').toString().trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Kein gültiger Commit: ${commit}`);
const engines = readdirSync('public/server').filter((f) => /^engine-[0-9a-f]+\.js$/.test(f));
if (engines.length !== 1) throw new Error(`Erwartet genau eine Engine-Datei in public/server, gefunden: ${engines.join(', ') || 'keine'}`);
const file = engines[0];
try {
  execSync(`git cat-file -e ${commit}:public/server/${file}`, { stdio: 'ignore' });
} catch {
  throw new Error(`public/server/${file} ist nicht im Commit ${commit} – erst committen.`);
}

const URL_RE = /https:\/\/cdn\.jsdelivr\.net\/gh\/Dacunha66\/gridrune@[0-9a-f]{40}\/public\/server\/engine-[0-9a-f]+\.js/g;
const changed = [];
for (const fn of readdirSync('supabase/functions')) {
  const path = `supabase/functions/${fn}/index.ts`;
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (!URL_RE.test(src)) continue;
  const next = src.replace(URL_RE, `https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@${commit}/public/server/${file}`);
  if (next !== src) writeFileSync(path, next);
  changed.push(fn);
}
console.log(`Engine ${file} @ ${commit.slice(0, 7)} – bitte ALLE diese Funktionen veröffentlichen: ${changed.join(', ')}`);
