// Community: clans and chat of signed-in players. Players read clans, members and chat history directly (RLS) and get
// new messages live (Realtime); every change goes through here: texts are cleaned (word filter, no links), names and
// tags checked, roles and limits enforced by the database functions (one transaction each).
// Player: "overview", "clans", "ranking", "clan-create", "clan-join", "clan-cancel", "clan-answer", "clan-leave",
// "clan-kick", "clan-role", "clan-edit", "rules-accept", "chat-send", "chat-report".
// Admin: "admin-reports", "admin-delete", "admin-dismiss", "admin-mute", "admin-unmute", "admin-muted", "admin-clan-rename",
// "admin-clan-dissolve".
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CLAN_COST, COMMUNITY_DOC, berlinWeek, checkClanName, checkClanTag, cleanDescription, cleanMessage, cleanWords, isEmblem, isJoinMode, weekPoints,
} from './logic.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

const REASON: Record<string, string> = {
  in_clan: 'Du bist schon in einem Clan.', coins: `Dir fehlen Münzen – ein Clan kostet ${CLAN_COST}.`, conflict: 'Dein Spielstand hat sich gerade geändert – bitte noch einmal.',
  name_taken: 'Diesen Clannamen gibt es schon.', tag_taken: 'Dieses Kürzel gibt es schon.', taken: 'Name oder Kürzel gibt es schon.',
  unknown: 'Diesen Clan oder Spieler gibt es nicht (mehr).', closed: 'Dieser Clan nimmt gerade niemanden auf.', full: 'Dieser Clan ist voll (30 Mitglieder).',
  forbidden: 'Dafür fehlt dir die Berechtigung im Clan.', no_clan: 'Du bist in keinem Clan.', bad: 'Das geht so nicht.',
  rules: 'Bitte bestätige zuerst die Chat-Regeln.', muted: 'Du bist im Chat stummgeschaltet.', slow: 'Nicht so schnell – warte kurz.',
  not_member: 'Diesen Clan-Chat können nur Mitglieder nutzen.', empty: 'Die Nachricht ist leer.',
};

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
  const action = String(body.action ?? '');
  const fail = (code: string, status = 422, extra: Row = {}) => json({ ok: false, error: code, reason: REASON[code] ?? 'Das hat nicht geklappt.', ...extra }, status);
  const week = berlinWeek();

  const [{ data: adminRow }, { data: wordsRow }] = await Promise.all([
    db.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    db.from('content_docs').select('data').eq('collection', 'settings').eq('id', COMMUNITY_DOC).maybeSingle(),
  ]);
  const isAdmin = !!adminRow;
  const words = cleanWords((wordsRow?.data as Row | null)?.words);

  /** Names and avatars of players (avatar chosen under Erfolge; start avatar otherwise). */
  async function people(ids: string[]): Promise<Map<string, { name: string; avatar: string }>> {
    const out = new Map<string, { name: string; avatar: string }>();
    if (!ids.length) return out;
    const [{ data: names }, { data: titles }] = await Promise.all([
      db.from('profiles').select('id, display_name').in('id', ids),
      db.from('quest_progress').select('player_id, titles').in('player_id', ids),
    ]);
    const av = new Map((titles ?? []).map((t: Row) => [t.player_id, typeof t.titles?.avatar === 'string' && /^av\d{2,4}$/.test(t.titles.avatar) ? t.titles.avatar : 'av01']));
    for (const i of ids) out.set(i, { name: (names ?? []).find((n: Row) => n.id === i)?.display_name ?? 'Spieler', avatar: av.get(i) ?? 'av01' });
    return out;
  }

  const clanView = (c: Row) => ({
    id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, description: c.description, joinMode: c.join_mode, members: c.members,
    weekPoints: weekPoints(c, week), totalPoints: Number(c.total_points),
  });

  async function myClan() {
    const { data: me } = await db.from('clan_members').select('*').eq('player_id', uid).maybeSingle();
    if (!me) return null;
    const [{ data: clan }, { data: members }, { data: requests }] = await Promise.all([
      db.from('clans').select('*').eq('id', me.clan_id).single(),
      db.from('clan_members').select('*').eq('clan_id', me.clan_id),
      me.role === 'member' ? Promise.resolve({ data: [] }) : db.from('clan_requests').select('player_id, created_at').eq('clan_id', me.clan_id).order('created_at'),
    ]);
    const who = await people([...(members ?? []).map((m: Row) => m.player_id), ...(requests ?? []).map((r: Row) => r.player_id)]);
    const order = { leader: 0, officer: 1, member: 2 } as Record<string, number>;
    return {
      ...clanView(clan), role: me.role,
      list: (members ?? []).map((m: Row) => ({ id: m.player_id, ...who.get(m.player_id)!, role: m.role, weekPoints: weekPoints(m, week), totalPoints: Number(m.total_points), me: m.player_id === uid }))
        .sort((a: Row, b: Row) => order[a.role] - order[b.role] || b.weekPoints - a.weekPoints),
      requests: (requests ?? []).map((r: Row) => ({ id: r.player_id, ...who.get(r.player_id)! })),
    };
  }

  async function overview() {
    const [clan, { data: cp }, { data: reqs }, { data: blocks }] = await Promise.all([
      myClan(),
      db.from('community_players').select('rules_at, muted_until, mute_reason').eq('player_id', uid).maybeSingle(),
      db.from('clan_requests').select('clan_id').eq('player_id', uid),
      db.from('chat_blocks').select('blocked_id').eq('player_id', uid),
    ]);
    const muted = cp?.muted_until && Date.parse(cp.muted_until) > Date.now() ? cp.muted_until : null;
    return {
      ok: true, week, clan, rulesAccepted: !!cp?.rules_at, mutedUntil: muted, muteReason: muted ? cp?.mute_reason ?? '' : '',
      requested: (reqs ?? []).map((r: Row) => r.clan_id), blocked: (blocks ?? []).map((b: Row) => b.blocked_id), admin: isAdmin,
    };
  }

  const done = async (extra: Row = {}) => json({ ...(await overview()), ...extra });

  // ---------- Players ----------
  if (action === 'overview') return json(await overview());

  if (action === 'clans') {
    const q = typeof body.query === 'string' ? body.query.trim().slice(0, 20) : '';
    let sel = db.from('clans').select('*').limit(50);
    if (q) sel = sel.or(`name.ilike.%${q.replace(/[%_,()]/g, '')}%,tag.ilike.%${q.replace(/[%_,()]/g, '')}%`);
    const { data } = await sel.order('total_points', { ascending: false });
    const list = (data ?? []).map(clanView).sort((a, b) => b.weekPoints - a.weekPoints || b.totalPoints - a.totalPoints);
    return json({ ok: true, clans: list });
  }

  if (action === 'ranking') {
    const { data } = await db.from('clans').select('*').eq('week', week).gt('week_points', 0).order('week_points', { ascending: false }).limit(50);
    const { data: me } = await db.from('clan_members').select('clan_id').eq('player_id', uid).maybeSingle();
    let mine: Row | null = null;
    if (me) {
      const { data: c } = await db.from('clans').select('*').eq('id', me.clan_id).single();
      const pts = weekPoints(c, week);
      const { count } = await db.from('clans').select('id', { count: 'exact', head: true }).eq('week', week).gt('week_points', pts);
      mine = { ...clanView(c), rank: pts > 0 ? (count ?? 0) + 1 : null };
    }
    return json({ ok: true, week, clans: (data ?? []).map((c: Row, i: number) => ({ ...clanView(c), rank: i + 1 })), mine });
  }

  if (action === 'clan-create') {
    const n = checkClanName(body.name, words);
    if (!n.ok) return json({ ok: false, reason: n.reason }, 422);
    const t = checkClanTag(body.tag, words);
    if (!t.ok) return json({ ok: false, reason: t.reason }, 422);
    const mode = isJoinMode(body.joinMode) ? body.joinMode : 'open';
    const emblem = isEmblem(body.emblem) ? body.emblem : 'av01';
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: s } = await db.from('player_saves').select('version').eq('player_id', uid).maybeSingle();
      if (!s) return fail('no_save', 409);
      const { data: r, error } = await db.rpc('clan_create', {
        p_player: uid, p_name: n.name, p_tag: t.tag, p_emblem: emblem, p_description: cleanDescription(body.description, words), p_mode: mode, p_cost: CLAN_COST, p_version: s.version,
      });
      if (error) return json({ error: 'database' }, 500);
      if (r?.error === 'conflict') continue;
      if (r?.error) return fail(r.error);
      const { data: save } = await db.from('player_saves').select('save, campaign, version').eq('player_id', uid).single();
      return done({ created: r.clan, save: save.save, campaign: save.campaign, version: save.version });
    }
    return fail('conflict', 409);
  }

  if (action === 'clan-join') {
    const clan = id(body.clanId);
    if (!clan) return fail('unknown');
    const { data: r, error } = await db.rpc('clan_join', { p_player: uid, p_clan: clan });
    if (error) return json({ error: 'database' }, 500);
    return r === 'joined' || r === 'requested' ? done({ result: r }) : fail(r);
  }

  if (action === 'clan-cancel') {
    const clan = id(body.clanId);
    if (clan) await db.from('clan_requests').delete().eq('clan_id', clan).eq('player_id', uid);
    return done();
  }

  if (action === 'clan-answer') {
    const player = id(body.playerId);
    if (!player) return fail('unknown');
    const { data: r, error } = await db.rpc('clan_answer', { p_actor: uid, p_player: player, p_accept: body.accept === true });
    if (error) return json({ error: 'database' }, 500);
    return r === 'joined' || r === 'declined' ? done({ result: r }) : fail(r);
  }

  if (action === 'clan-leave' || action === 'clan-kick') {
    const target = action === 'clan-leave' ? uid : id(body.playerId);
    if (!target) return fail('unknown');
    const { data: r, error } = await db.rpc('clan_remove', { p_actor: uid, p_target: target });
    if (error) return json({ error: 'database' }, 500);
    return r === 'removed' || r === 'dissolved' ? done({ result: r }) : fail(r);
  }

  if (action === 'clan-role') {
    const target = id(body.playerId);
    if (!target) return fail('unknown');
    const { data: r, error } = await db.rpc('clan_role', { p_actor: uid, p_target: target, p_role: String(body.role ?? '') });
    if (error) return json({ error: 'database' }, 500);
    return r === 'ok' ? done() : fail(r);
  }

  if (action === 'clan-edit') {
    const { data: me } = await db.from('clan_members').select('clan_id, role').eq('player_id', uid).maybeSingle();
    if (!me) return fail('no_clan');
    if (me.role !== 'leader') return fail('forbidden');
    const patch: Row = {};
    if (typeof body.description === 'string') patch.description = cleanDescription(body.description, words);
    if (isJoinMode(body.joinMode)) patch.join_mode = body.joinMode;
    if (isEmblem(body.emblem)) patch.emblem = body.emblem;
    if (Object.keys(patch).length) await db.from('clans').update(patch).eq('id', me.clan_id);
    return done();
  }

  if (action === 'rules-accept') {
    await db.from('community_players').upsert({ player_id: uid, rules_at: new Date().toISOString() }, { onConflict: 'player_id', ignoreDuplicates: false });
    return done();
  }

  if (action === 'chat-send') {
    const channel = body.channel === 'global' ? 'global' : typeof body.channel === 'string' && /^clan:[0-9a-f-]{36}$/.test(body.channel) ? body.channel : null;
    if (!channel) return fail('bad');
    const text = cleanMessage(body.body, words);
    if (!text) return fail('empty');
    const me = (await people([uid])).get(uid)!;
    const { data: r, error } = await db.rpc('chat_send', { p_player: uid, p_channel: channel, p_body: text, p_name: me.name.slice(0, 20), p_avatar: me.avatar });
    if (error) return json({ error: 'database' }, 500);
    if (r?.error) return fail(r.error, 422, r.until ? { until: r.until } : {});
    return json({ ok: true, id: r.id, body: text });
  }

  if (action === 'chat-report') {
    const msg = Number(body.messageId);
    if (!Number.isInteger(msg) || msg <= 0) return fail('bad');
    const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
    const { error } = await db.from('chat_reports').upsert({ message_id: msg, reporter: uid, reason }, { onConflict: 'message_id,reporter', ignoreDuplicates: true });
    return error ? fail('unknown') : json({ ok: true });
  }

  // ---------- Admin ----------
  if (action.startsWith('admin-')) {
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
    if (action === 'admin-reports') {
      const { data: reps } = await db.from('chat_reports').select('id, message_id, reporter, reason, created_at').eq('handled', false).order('created_at', { ascending: false }).limit(100);
      const ids = [...new Set((reps ?? []).map((r: Row) => r.message_id))];
      const { data: msgs } = ids.length ? await db.from('chat_messages').select('*').in('id', ids) : { data: [] };
      const who = await people([...new Set((reps ?? []).map((r: Row) => r.reporter))]);
      return json({
        ok: true,
        reports: (reps ?? []).map((r: Row) => {
          const m = (msgs ?? []).find((x: Row) => x.id === r.message_id);
          return { id: r.id, reason: r.reason, at: r.created_at, reporter: who.get(r.reporter)?.name ?? 'Spieler',
            message: m ? { id: m.id, body: m.body, name: m.name, playerId: m.player_id, channel: m.channel, at: m.created_at, deleted: m.deleted } : null };
        }),
      });
    }
    if (action === 'admin-delete') {
      const msg = Number(body.messageId);
      await db.from('chat_messages').update({ deleted: true }).eq('id', msg);
      await db.from('chat_reports').update({ handled: true }).eq('message_id', msg);
      return json({ ok: true });
    }
    if (action === 'admin-dismiss') {
      await db.from('chat_reports').update({ handled: true }).eq('id', Number(body.reportId));
      return json({ ok: true });
    }
    if (action === 'admin-mute' || action === 'admin-unmute') {
      const player = id(body.playerId);
      if (!player) return fail('unknown');
      const hours = Number(body.hours);
      const until = action === 'admin-unmute' ? null
        : new Date(Date.now() + (Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 365) : 24 * 365 * 100) * 3600_000).toISOString();
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 100) : '';
      await db.from('community_players').upsert({ player_id: player, muted_until: until, mute_reason: until ? reason : '' }, { onConflict: 'player_id' });
      if (until && body.messageId) await db.from('chat_reports').update({ handled: true }).eq('message_id', Number(body.messageId));
      return json({ ok: true });
    }
    if (action === 'admin-muted') {
      const { data } = await db.from('community_players').select('player_id, muted_until, mute_reason').gt('muted_until', new Date().toISOString()).limit(200);
      const who = await people((data ?? []).map((r: Row) => r.player_id));
      return json({ ok: true, muted: (data ?? []).map((r: Row) => ({ id: r.player_id, name: who.get(r.player_id)?.name ?? 'Spieler', until: r.muted_until, reason: r.mute_reason })) });
    }
    if (action === 'admin-clan-rename') {
      const clan = id(body.clanId);
      const n = checkClanName(body.name, words);
      const t = checkClanTag(body.tag, words);
      if (!clan || !n.ok || !t.ok) return json({ ok: false, reason: !n.ok ? n.reason : !t.ok ? t.reason : 'Unbekannter Clan.' }, 422);
      const { error } = await db.from('clans').update({ name: n.name, tag: t.tag }).eq('id', clan);
      return error ? fail('taken') : json({ ok: true });
    }
    if (action === 'admin-clan-dissolve') {
      const clan = id(body.clanId);
      if (!clan) return fail('unknown');
      await db.from('chat_messages').delete().eq('channel', `clan:${clan}`);
      await db.from('clans').delete().eq('id', clan);
      return json({ ok: true });
    }
  }
  return json({ error: 'bad_request' }, 400);
});
