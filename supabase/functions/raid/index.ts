// Weltboss-Raid: the referee for raid fights of signed-in players.
// "overview": the raid, its live life points and phase, the player's attacks left today, totals, rank and an open
// fight to continue; rewards earned are paid on the way. "start": checks the 8 cards and the rune, freezes the
// fight setup of the current phase and reserves one attack (atomic, daily limit per UTC day). "finish": replays
// the fight with the game's own rules, computes the damage here and books it once (raid_finish: result, boss life
// points, statistics in one step). "leaderboard": totals by damage. Admin: "admin-list", "admin-publish",
// "admin-status". A fight not finished in time counts as a defeat. The client never sends damage or a result.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import {
  checkRaid, expiredDamage, loadContent, parseRaid, payRaidRewards, phaseIndex, prepareRaid, questDelta, questPeriod, raidDay, raidOpen, raidProblems,
  raidQuestEvent, raidSnapshot, shownAvatar,
} from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@66e3f4c46590a05b1a7a768a1c6bece368faede6/public/server/engine-391f86193bb7.js';

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

/** Erfolge: adds a checked result to the player's quest counters (never fails the request). */
async function addQuest(db: ReturnType<typeof createClient>, player: string, event: unknown) {
  try {
    const p = questPeriod();
    await db.rpc('quest_add', { p_player: player, p_day: p.day, p_week: p.week, p_delta: questDelta(event as never) });
  } catch {
    // Counting quests must never break a game.
  }
}

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
  // Players never see drafts; admins see everything (also in the admin list).
  loadContent(rows ?? [], isAdmin);
  const raidDocs = (rows ?? []).filter((r: Row) => r.collection === 'raids');
  const configOf = (id: unknown, allowDraft = false) => {
    const row = raidDocs.find((r: Row) => r.id === id);
    const c = row ? parseRaid(row.id, row.data) : null;
    return c && (allowDraft || c.status === 'published') ? c : null;
  };
  const stateOf = async (raidId: string): Promise<Row | null> =>
    (await db.from('raid_state').select('*').eq('raid_id', raidId).eq('scope', 'global').maybeSingle()).data;

  /** The raid shown to players: the given one, else the newest published raid with a live state (not archived). */
  async function current(raidId: unknown) {
    if (typeof raidId === 'string') {
      const c = configOf(raidId);
      const st = c ? await stateOf(c.id) : null;
      return c && st && st.status !== 'archived' ? { c, st } : null;
    }
    const { data: states } = await db.from('raid_state').select('*').eq('scope', 'global').neq('status', 'archived');
    const list = (states ?? []).map((st: Row) => ({ c: configOf(st.raid_id), st })).filter((x: { c: unknown }) => x.c) as { c: NonNullable<ReturnType<typeof configOf>>; st: Row }[];
    const now = Date.now();
    list.sort((a, b) => {
      const live = (x: typeof a) => (raidOpen(x.c, x.st.current_hp, now) === 'active' && x.st.status === 'active' ? 1 : 0);
      return live(b) - live(a) || Date.parse(b.c.startsAt) - Date.parse(a.c.startsAt);
    });
    return list[0] ?? null;
  }

  /** What players see as the raid's state: paused / ended by the admin, defeated, upcoming, active, expired. */
  const lifecycle = (c: NonNullable<ReturnType<typeof configOf>>, st: Row) =>
    st.status === 'paused' || st.status === 'ended' ? st.status : st.current_hp <= 0 || st.status === 'defeated' ? 'defeated' : raidOpen(c, st.current_hp);

  /** Fights not finished in time count as defeats (once each). */
  async function expireOld(instance: string, onlyPlayer: string | null = null) {
    let q = db.from('raid_attempts').select('id, player_id, ticket').eq('instance', instance).eq('status', 'started').lt('expires_at', new Date().toISOString()).limit(100);
    if (onlyPlayer) q = q.eq('player_id', onlyPlayer);
    const { data } = await q;
    for (const a of data ?? []) {
      await db.rpc('raid_finish', { p_attempt: a.id, p_player: a.player_id, p_outcome: 'expired', p_fields: 0, p_damage: expiredDamage(a.ticket.snapshot) });
    }
  }

  async function myStats(instance: string) {
    const { data } = await db.from('raid_player_stats').select('*').eq('instance', instance).eq('player_id', uid).maybeSingle();
    return data as Row | null;
  }

  async function myRank(instance: string, stats: Row | null): Promise<number | null> {
    if (!stats) return null;
    const [{ count: higher }, { count: earlier }] = await Promise.all([
      db.from('raid_player_stats').select('player_id', { count: 'exact', head: true }).eq('instance', instance).gt('total_damage', stats.total_damage),
      db.from('raid_player_stats').select('player_id', { count: 'exact', head: true }).eq('instance', instance).eq('total_damage', stats.total_damage)
        .lt('last_damage_at', stats.last_damage_at),
    ]);
    return (higher ?? 0) + (earlier ?? 0) + 1;
  }

  /** Pays raid rewards the player has earned and not received yet (milestones, community goals). */
  async function claimRewards(c: NonNullable<ReturnType<typeof configOf>>, st: Row, stats: Row | null) {
    if (!stats) return [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const [{ data: claims }, { data: saveRow }] = await Promise.all([
        db.from('raid_reward_claims').select('reward_key').eq('instance', st.id).eq('player_id', uid),
        db.from('player_saves').select('save, version').eq('player_id', uid).maybeSingle(),
      ]);
      if (!saveRow) return [];
      const pay = payRaidRewards(saveRow.save, c, { totalDamage: Number(stats.total_damage), attacks: stats.attacks }, st.current_hp,
        (claims ?? []).map((x: Row) => x.reward_key), seed());
      if (!pay) return [];
      const granted = Object.fromEntries(pay.granted.map((g: Row) => [g.key, g]));
      const { data: res, error } = await db.rpc('raid_claim', {
        p_instance: st.id, p_player: uid, p_keys: pay.keys, p_granted: granted, p_save: pay.save, p_version: saveRow.version,
      });
      if (error) return [];
      if (res === 'paid') return pay.granted;
      // 'already' (another request paid a part) or 'conflict' (save changed): look again.
    }
    return [];
  }

  async function attacksToday(instance: string) {
    const { count } = await db.from('raid_attempts').select('id', { count: 'exact', head: true }).eq('instance', instance).eq('player_id', uid).eq('day', raidDay());
    return count ?? 0;
  }

  async function openAttempt(instance: string) {
    const { data } = await db.from('raid_attempts').select('id, ticket, expires_at').eq('instance', instance).eq('player_id', uid).eq('status', 'started').maybeSingle();
    return data ? { ...data.ticket, id: data.id, expiresAt: data.expires_at } : null;
  }

  /** Public parts of the raid for the overview (boss decks are visible in the fight anyway). */
  function publicRaid(c: NonNullable<ReturnType<typeof configOf>>, st: Row) {
    const phase = phaseIndex(c, st.current_hp);
    return {
      id: c.id, name: c.name, bossName: c.bossName, description: c.description, image: c.image, cls: c.cls,
      startsAt: c.startsAt, endsAt: c.endsAt, dailyLimit: c.dailyLimit, resumeMinutes: c.resumeMinutes, damage: c.damage,
      phases: c.phases.map((p) => ({ name: p.name, threshold: p.threshold, level: p.level, mechanic: p.mechanic })),
      milestones: c.milestones, globalRewards: c.globalRewards, minAttacksForGlobal: c.minAttacksForGlobal,
      maxHp: st.max_hp, currentHp: st.current_hp, participants: st.participants, attacks: st.attacks, phase,
      status: lifecycle(c, st), defeatedAt: st.defeated_at,
    };
  }

  const action = body.action;

  if (action === 'overview') {
    const cur = await current(body.raidId);
    if (!cur) return json({ raid: null });
    await expireOld(cur.st.id);
    const st = (await stateOf(cur.c.id))!;
    let stats = await myStats(st.id);
    const granted = await claimRewards(cur.c, st, stats);
    stats = await myStats(st.id);
    const [{ data: claims }, used, open, rank] = await Promise.all([
      db.from('raid_reward_claims').select('reward_key').eq('instance', st.id).eq('player_id', uid),
      attacksToday(st.id), openAttempt(st.id), myRank(st.id, stats),
    ]);
    return json({
      raid: publicRaid(cur.c, st),
      me: {
        attacksLeft: Math.max(0, cur.c.dailyLimit - used), attacksToday: used, totalDamage: Number(stats?.total_damage ?? 0), attacks: stats?.attacks ?? 0,
        wins: stats?.wins ?? 0, draws: stats?.draws ?? 0, losses: stats?.losses ?? 0, best: stats?.best_damage ?? 0, rank,
        claimed: (claims ?? []).map((x: Row) => x.reward_key),
      },
      open, granted, nextReset: `${raidDay(new Date(Date.now() + 86400_000))}T00:00:00.000Z`,
    });
  }

  if (action === 'start') {
    const cur = await current(body.raidId);
    if (!cur) return json({ error: 'no_raid' }, 404);
    await expireOld(cur.st.id, uid);
    const st = (await stateOf(cur.c.id))!;
    const open = await openAttempt(st.id);
    if (open) return json({ ticket: open, resumed: true });
    const life = lifecycle(cur.c, st);
    if (life !== 'active') return json({ error: life }, 409);
    const { data: saveRow } = await db.from('player_saves').select('save, campaign').eq('player_id', uid).maybeSingle();
    if (!saveRow) return json({ error: 'no_save' }, 409);
    const prep = prepareRaid(saveRow.save, saveRow.campaign, body.hand, body.rune ?? null, isAdmin);
    if (!prep.ok) return json({ error: prep.error }, 422);
    const snapshot = raidSnapshot(cur.c, phaseIndex(cur.c, st.current_hp));
    if (!snapshot) return json({ error: 'setup' }, 500);
    const ticket = { seed: seed(), hand: prep.hand, playerRune: prep.rune, snapshot };
    const expires = new Date(Date.now() + cur.c.resumeMinutes * 60_000).toISOString();
    const { data: res, error } = await db.rpc('raid_reserve', {
      p_instance: st.id, p_player: uid, p_day: raidDay(), p_limit: cur.c.dailyLimit, p_ticket: ticket, p_expires: expires,
    });
    if (error) return json({ error: 'database' }, 500);
    if (res === 'open') {
      const again = await openAttempt(st.id);
      return again ? json({ ticket: again, resumed: true }) : json({ error: 'busy' }, 409);
    }
    if (res === 'limit' || res === 'closed' || res === 'busy') return json({ error: res }, 409);
    return json({ ticket: { ...ticket, id: res, expiresAt: expires } });
  }

  if (action === 'finish') {
    const id = typeof body.attemptId === 'string' ? body.attemptId : '';
    const { data: a } = await db.from('raid_attempts').select('*').eq('id', id).eq('player_id', uid).maybeSingle();
    if (!a) return json({ error: 'unknown_attempt' }, 404);
    const resultOf = async (row: Row, extra: Row = {}) => {
      const { data: st } = await db.from('raid_state').select('*').eq('id', row.instance).single();
      const stats = await myStats(row.instance);
      const c = configOf(st.raid_id);
      const granted = c ? await claimRewards(c, st, stats) : [];
      const used = await attacksToday(row.instance);
      return json({
        ok: true, outcome: row.outcome, fields: row.fields, damage: row.damage, applied: row.applied_damage, currentHp: st.current_hp, maxHp: st.max_hp,
        totalDamage: Number(stats?.total_damage ?? 0), attacks: stats?.attacks ?? 0, attacksLeft: c ? Math.max(0, c.dailyLimit - used) : 0,
        rank: await myRank(row.instance, stats), granted, ...extra,
      });
    };
    // Finished before: the same answer again, nothing is booked twice.
    if (a.status !== 'started') return resultOf(a, { repeated: true });
    if (Date.parse(a.expires_at) < Date.now()) {
      await db.rpc('raid_finish', { p_attempt: a.id, p_player: uid, p_outcome: 'expired', p_fields: 0, p_damage: expiredDamage(a.ticket.snapshot) });
    } else {
      const check = checkRaid({ ...a.ticket, id: a.id }, body.log as never);
      if (!check.ok) return json({ ok: false, error: check.error }, 422);
      const { data: booked, error } = await db.rpc('raid_finish', { p_attempt: a.id, p_player: uid, p_outcome: check.outcome, p_fields: check.fields, p_damage: check.damage });
      if (error) return json({ error: 'database' }, 500);
      if (booked && booked.already === false) await addQuest(db, uid, raidQuestEvent(check));
    }
    const { data: done } = await db.from('raid_attempts').select('*').eq('id', a.id).single();
    return resultOf(done);
  }

  if (action === 'leaderboard') {
    const cur = await current(body.raidId);
    if (!cur) return json({ rows: [] });
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
    const offset = Math.max(0, Number(body.offset) || 0);
    const { data: list } = await db.from('raid_player_stats').select('player_id, attacks, total_damage, last_damage_at')
      .eq('instance', cur.st.id).order('total_damage', { ascending: false }).order('last_damage_at', { ascending: true }).range(offset, offset + limit - 1);
    const ids = (list ?? []).map((r: Row) => r.player_id);
    const [{ data: names }, { data: badges }] = ids.length
      ? await Promise.all([db.from('profiles').select('id, display_name').in('id', ids), db.from('quest_progress').select('player_id, titles').in('player_id', ids)])
      : [{ data: [] }, { data: [] }];
    const nameOf = new Map((names ?? []).map((n: Row) => [n.id, n.display_name]));
    // Avatars chosen under Erfolge (start avatar for players without one).
    const avatarOf = new Map((badges ?? []).map((b: Row) => [b.player_id, shownAvatar(b.titles)]));
    const stats = await myStats(cur.st.id);
    return json({
      rows: (list ?? []).map((r: Row, i: number) => ({
        rank: offset + i + 1, name: nameOf.get(r.player_id) ?? 'Spieler', avatar: avatarOf.get(r.player_id) ?? shownAvatar(null), me: r.player_id === uid, attacks: r.attacks,
        totalDamage: Number(r.total_damage), average: r.attacks ? Math.round(Number(r.total_damage) / r.attacks) : 0,
      })),
      me: stats ? { rank: await myRank(cur.st.id, stats), totalDamage: Number(stats.total_damage), attacks: stats.attacks } : null,
      participants: cur.st.participants,
    });
  }

  // ---------- Admin ----------
  if (typeof action === 'string' && action.startsWith('admin-')) {
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
    if (action === 'admin-list') {
      const { data: states } = await db.from('raid_state').select('*').eq('scope', 'global');
      return json({ states: states ?? [] });
    }
    const c = configOf(body.raidId, true);
    if (!c) return json({ error: 'unknown_raid' }, 404);
    const st = await stateOf(c.id);
    if (action === 'admin-publish') {
      // Starts the raid (live life points) or takes over a new version of a running raid.
      if (c.status !== 'published') return json({ error: 'draft' }, 409);
      const problems = raidProblems(c);
      if (problems.length) return json({ error: 'problems', problems }, 422);
      if (!st) {
        const { data, error } = await db.from('raid_state').insert({ raid_id: c.id, max_hp: c.maxHp, current_hp: c.maxHp, config_version: c.version }).select('*').single();
        return error ? json({ error: 'database' }, 500) : json({ state: data });
      }
      // Damage dealt so far stays: new life points = new maximum − damage taken (at least 0).
      const taken = st.max_hp - st.current_hp;
      const hp = Math.max(0, c.maxHp - taken);
      const { data, error } = await db.from('raid_state').update({
        config_version: c.version, max_hp: c.maxHp, current_hp: hp, status: hp === 0 ? 'defeated' : st.status === 'defeated' ? 'active' : st.status,
        defeated_at: hp === 0 ? st.defeated_at ?? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }).eq('id', st.id).select('*').single();
      return error ? json({ error: 'database' }, 500) : json({ state: data });
    }
    if (action === 'admin-status') {
      if (!st) return json({ error: 'not_started' }, 409);
      const status = body.status;
      if (status !== 'active' && status !== 'paused' && status !== 'ended' && status !== 'archived') return json({ error: 'bad_status' }, 400);
      if (status === 'active' && st.current_hp <= 0) return json({ error: 'defeated' }, 409);
      const { data } = await db.from('raid_state').update({ status, updated_at: new Date().toISOString() }).eq('id', st.id).select('*').single();
      return json({ state: data });
    }
  }
  return json({ error: 'bad_request' }, 400);
});
