// Erfolge: the player's quest board and collecting rewards. Counters are raised only by the other server functions
// after a checked result (quest_add); here the board is computed with the game's own rules (engine.js) and rewards
// are paid exactly once (quest_claim: claim rows, save and titles in one step). "overview", "claim", "equip-title",
// "equip-avatar" (only avatars unlocked by collected achievements).
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import { loadContent, parseRaid, questClaim, questDay, questEquipAvatar, questEquipTitle, questOverview, questWeek, raidOpen } from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@b998b5ae75017b029c0ed5679268ea53783ca76e/public/server/engine-fac78c159612.js';

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

  const { data: rows, error: e1 } = await db.from('content_docs').select('collection, id, data');
  if (e1) return json({ error: 'database' }, 500);
  loadContent(rows ?? [], false);
  const now = new Date();
  const day = questDay(now);
  const week = questWeek(now);

  /** Progress row plus the keys collected for today, this week and the achievements. */
  async function readState() {
    const [{ data: prog }, { data: claims }] = await Promise.all([
      db.from('quest_progress').select('day, week, daily, weekly, total, titles').eq('player_id', uid).maybeSingle(),
      db.from('quest_claims').select('key').eq('player_id', uid).or(`key.like.a:*,key.like.d:${day}:*,key.like.w:${week}:*`),
    ]);
    return { ...(prog ?? {}), claimed: (claims ?? []).map((c: Row) => c.key) };
  }

  /** Weltbosse defeated with this player taking part. */
  async function raidsDefeated(): Promise<number> {
    const { data: mine } = await db.from('raid_player_stats').select('instance').eq('player_id', uid).gt('attacks', 0);
    const ids = (mine ?? []).map((r: Row) => r.instance);
    if (ids.length === 0) return 0;
    const { count } = await db.from('raid_state').select('id', { count: 'exact', head: true }).in('id', ids).or('status.eq.defeated,current_hp.lte.0');
    return count ?? 0;
  }

  /** A Weltboss can be attacked right now (published, started, not over, not defeated, not paused or ended). */
  async function raidActive(): Promise<boolean> {
    const { data: states } = await db.from('raid_state').select('raid_id, status, current_hp').eq('scope', 'global').eq('status', 'active').gt('current_hp', 0);
    return (states ?? []).some((st: Row) => {
      const doc = (rows ?? []).find((r: Row) => r.collection === 'raids' && r.id === st.raid_id);
      const c = doc ? parseRaid(doc.id, doc.data) : null;
      return !!c && c.status === 'published' && raidOpen(c, st.current_hp, now.getTime()) === 'active';
    });
  }
  const raidInfo = async () => {
    const [defeated, active] = await Promise.all([raidsDefeated(), raidActive()]);
    return { defeated, active };
  };

  const readSave = async () => (await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).maybeSingle()).data as Row | null;

  if (body.action === 'overview') {
    const [save, state, raids] = await Promise.all([readSave(), readState(), raidInfo()]);
    if (!save) return json({ error: 'no_save' }, 409);
    return json(questOverview(save.save, save.campaign, state, raids, now));
  }

  if (body.action === 'claim') {
    const raids = await raidInfo();
    for (let attempt = 0; attempt < 4; attempt++) {
      const [save, state] = await Promise.all([readSave(), readState()]);
      if (!save) return json({ error: 'no_save' }, 409);
      const r = questClaim(save.save, save.campaign, state, raids, body.keys ?? null, seed(), now);
      if (!r) return json({ ok: true, granted: [], save: save.save, campaign: save.campaign, version: save.version, ...questOverview(save.save, save.campaign, state, raids, now) });
      const titlesChanged = JSON.stringify(r.titles) !== JSON.stringify((state as Row).titles ?? { owned: [], equipped: null });
      const granted = Object.fromEntries(r.granted.map((g: Row) => [g.key, g]));
      const { data: res, error } = await db.rpc('quest_claim', {
        p_player: uid, p_keys: r.keys, p_granted: granted, p_save: r.save, p_version: save.version, p_titles: titlesChanged ? r.titles : null,
      });
      if (error) return json({ error: 'database' }, 500);
      if (res === 'paid') {
        const after = await readState();
        return json({ ok: true, granted: r.granted, save: r.save, campaign: save.campaign, version: save.version + 1, ...questOverview(r.save, save.campaign, after, raids, now) });
      }
      // 'already' (collected by another request) or 'conflict' (the save changed): look again.
    }
    return json({ error: 'busy' }, 503);
  }

  if (body.action === 'equip-title') {
    const state = await readState();
    const titles = questEquipTitle(state, body.title ?? null);
    if (!titles) return json({ error: 'title' }, 422);
    const { error } = await db.from('quest_progress').upsert({ player_id: uid, day: (state as Row).day ?? day, week: (state as Row).week ?? week, titles, updated_at: now.toISOString() });
    if (error) return json({ error: 'database' }, 500);
    return json({ ok: true, titles });
  }
  if (body.action === 'equip-avatar') {
    const state = await readState();
    const titles = questEquipAvatar(state, body.avatar ?? null);
    if (!titles) return json({ error: 'avatar' }, 422);
    const { error } = await db.from('quest_progress').upsert({ player_id: uid, day: (state as Row).day ?? day, week: (state as Row).week ?? week, titles, updated_at: now.toISOString() });
    if (error) return json({ error: 'database' }, 500);
    return json({ ok: true, titles });
  }
  return json({ error: 'bad_request' }, 400);
});
