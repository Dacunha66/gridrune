// Puzzle-Events: the player's events with their pieces and task progress. Counters are raised only by the other server
// functions after a checked result (quest_add → puzzle_add); here fragments earned are given automatically (puzzle_claim:
// claim rows, pieces and – for a complete puzzle – the save with the reward in one step, never twice).
// "overview": every visible event (running, ended, archived) – earned fragments are given on the way.
// "admin-stats": numbers of one event for the admin.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import { loadContent, puzzleClaimServer, puzzleView, visiblePuzzles } from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@3439c1ac0b806edc745ebdc10f87dc4af1a8c3ee/public/server/engine-d57bdb5e04bf.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function seed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await db.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: 'not_signed_in' }, 401);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const [{ data: rows, error: e1 }, { data: adminRow }] = await Promise.all([
    db.from('content_docs').select('collection, id, data'),
    db.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
  ]);
  if (e1) return json({ error: 'database' }, 500);
  const isAdmin = !!adminRow;
  // Players never see drafts – also admins play with what is published (drafts are tested in the admin's test mode).
  loadContent(rows ?? [], false);

  async function state(puzzleId: string, runId: string) {
    const [{ data: prog }, { data: counters }, { data: claims }] = await Promise.all([
      db.from('puzzle_progress').select('pieces, completed_at').eq('player_id', uid).eq('puzzle_id', puzzleId).maybeSingle(),
      db.from('puzzle_counters').select('day, week, daily, weekly, total').eq('player_id', uid).eq('puzzle_id', puzzleId).eq('run_id', runId).maybeSingle(),
      db.from('puzzle_claims').select('key').eq('player_id', uid).eq('puzzle_id', puzzleId).like('key', `${runId}:%`),
    ]);
    return {
      have: ((prog?.pieces ?? []) as number[]).map(Number),
      completedAt: (prog?.completed_at ?? null) as string | null,
      counters: (counters ?? null) as Row | null,
      claimed: (claims ?? []).map((c: Row) => c.key as string),
    };
  }

  if (body.action === 'overview') {
    const now = new Date();
    const events = [];
    let cloud: Row | null = null;
    const gained: Record<string, number[]> = {};
    for (const p of visiblePuzzles(now)) {
      let st = await state(p.id, p.run.id);
      // Earned fragments are given right away (retried when pieces or the save changed in between).
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: saveRow } = await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).maybeSingle();
        if (!saveRow) break;
        const c = puzzleClaimServer(saveRow.save, p.id, st.have, st.counters as never, st.claimed, seed(), now);
        if (!c) break;
        const { data: res, error } = await db.rpc('puzzle_claim', {
          p_player: uid, p_puzzle: p.id, p_keys: c.keys, p_pieces: c.pieces, p_total: c.total, p_save: c.save, p_version: saveRow.version,
        });
        if (error) return json({ error: 'database' }, 500);
        if (res === 'paid') {
          gained[p.id] = [...(gained[p.id] ?? []), ...c.pieces];
          if (c.save) cloud = { save: c.save, campaign: saveRow.campaign, version: saveRow.version + 1 };
        }
        st = await state(p.id, p.run.id);
        if (res === 'paid') continue; // more tasks may be done
      }
      events.push({ ...puzzleView(p, st.have, st.completedAt, st.counters as never, st.claimed, now), gained: gained[p.id] ?? [] });
    }
    return json({ events, ...(cloud ?? {}) });
  }

  if (body.action === 'admin-stats') {
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
    const id = typeof body.puzzleId === 'string' ? body.puzzleId : '';
    const runId = typeof body.runId === 'string' ? body.runId : 'r1';
    const [{ data: prog }, { data: counters }, { data: claims }] = await Promise.all([
      db.from('puzzle_progress').select('player_id, pieces, completed_at').eq('puzzle_id', id).limit(10000),
      db.from('puzzle_counters').select('player_id').eq('puzzle_id', id).eq('run_id', runId).limit(10000),
      db.from('puzzle_claims').select('player_id, key').eq('puzzle_id', id).like('key', `${runId}:%`).limit(50000),
    ]);
    const players = new Set([...(prog ?? []).map((r: Row) => r.player_id), ...(counters ?? []).map((r: Row) => r.player_id)]);
    const pieces = (prog ?? []).map((r: Row) => (r.pieces ?? []).length as number);
    const byTask: Record<string, number> = {};
    for (const c of claims ?? []) {
      const task = String(c.key).split(':').pop()!;
      byTask[task] = (byTask[task] ?? 0) + 1;
    }
    return json({
      participants: players.size,
      averagePieces: players.size ? Math.round((pieces.reduce((a: number, b: number) => a + b, 0) / players.size) * 10) / 10 : 0,
      completed: (prog ?? []).filter((r: Row) => r.completed_at).length,
      claimsByTask: byTask,
    });
  }
  return json({ error: 'bad_request' }, 400);
});
