// Online duels between two signed-in players. This function is the referee: it creates matches (invite code or
// random opponent), checks every move with the game's own rules (engine.js) and decides time-outs (a random card
// after 30 seconds) and absences (whoever is still there after 20 seconds without a sign of life from the other
// one wins). The full duel stays in pvp_matches; each player gets only their own view in pvp_views (live).
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import {
  PVP_ABSENT_SECONDS, PVP_DAILY_PAID_WINS, PVP_MIN_MOVES_FOR_COINS, PVP_TURN_SECONDS, PVP_WIN_COINS, inviteCode, isGameOver, loadContent,
  normalizeCode, otherSeat, preparePvp, pvpAction, pvpScore, pvpWinner, seatSide, startPvp, timeoutMove, viewState,
} from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@5d66f64cc3f81a93571417d3d0224ec1529d423b/public/server/engine-1dd0d72e15a3.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
/** Small allowance for slow connections before a time-out counts. */
const GRACE_SECONDS = 3;

type Seat = 'a' | 'b';
// deno-lint-ignore no-explicit-any
type Match = Record<string, any>;

function seed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function cryptoRandom(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 2 ** 32;
}
const ago = (iso: string | null, seconds: number) => !iso || Date.now() - new Date(iso).getTime() > seconds * 1000;

/** What one player may see of the match. */
function viewOf(m: Match, seat: Seat) {
  const opp = otherSeat(seat);
  const result = m.status === 'finished' && m.state
    ? {
      outcome: m.winner === 'draw' ? 'draw' : m.winner === seat ? 'win' : 'loss',
      reason: m.end_reason,
      score: pvpScore(m.state, seat),
      coins: m.winner === seat ? m.coins : 0,
    }
    : null;
  return {
    matchId: m.id, status: m.status, seat, kind: m.kind, code: m.code,
    opponentName: m[`name_${opp}`] ?? null,
    state: m.state ? viewState(m.state, seat) : null,
    arenaName: m.arena_name ?? null,
    turnDeadline: m.status === 'playing' && m.turn_started_at ? new Date(new Date(m.turn_started_at).getTime() + PVP_TURN_SECONDS * 1000).toISOString() : null,
    result,
    updatedAt: new Date().toISOString(),
  };
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

  async function writeViews(m: Match) {
    const rows = (['a', 'b'] as Seat[]).filter((s) => m[`player_${s}`]).map((s) => ({ match_id: m.id, player_id: m[`player_${s}`], view: viewOf(m, s), updated_at: new Date().toISOString() }));
    await db.from('pvp_views').upsert(rows);
  }
  const seatOf = (m: Match): Seat | null => (m.player_a === uid ? 'a' : m.player_b === uid ? 'b' : null);
  async function load(id: unknown): Promise<Match | null> {
    if (typeof id !== 'string') return null;
    const { data } = await db.from('pvp_matches').select('*').eq('id', id).maybeSingle();
    return data && seatOf(data) ? data : null;
  }

  /** Ends the match (once): coins for the winner unless the daily limit against this opponent is reached. */
  async function finish(m: Match, state: unknown, winner: Seat | 'draw', reason: 'normal' | 'absent' | 'left') {
    let coins = 0;
    let pay: string | null = null;
    const moves = (state as { moveCount?: number } | null)?.moveCount ?? 0;
    if (winner !== 'draw' && (reason === 'normal' || moves >= PVP_MIN_MOVES_FOR_COINS)) {
      const w = m[`player_${winner}`];
      const l = m[`player_${otherSeat(winner)}`];
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await db.from('pvp_matches').select('id', { count: 'exact', head: true })
        .eq('status', 'finished').gt('coins', 0).gte('finished_at', since)
        .or(`and(player_a.eq.${w},player_b.eq.${l},winner.eq.a),and(player_b.eq.${w},player_a.eq.${l},winner.eq.b)`);
      if ((count ?? 0) < PVP_DAILY_PAID_WINS) {
        coins = PVP_WIN_COINS;
        pay = w;
      }
    }
    const { data: done, error } = await db.rpc('pvp_finish', { p_match: m.id, p_state: state, p_winner: winner, p_reason: reason, p_pay: pay, p_coins: coins });
    if (error) throw error;
    const { data: fresh } = await db.from('pvp_matches').select('*').eq('id', m.id).single();
    if (done || fresh) await writeViews(fresh);
    return fresh as Match;
  }

  /** Saves a new duel state if nobody changed the match in between. */
  async function saveState(m: Match, state: { turn: string }, turnChanged: boolean): Promise<Match | null> {
    const patch: Match = { state, updated_at: new Date().toISOString() };
    if (turnChanged) patch.turn_started_at = new Date().toISOString();
    const { data } = await db.from('pvp_matches').update(patch).eq('id', m.id).eq('status', 'playing').eq('updated_at', m.updated_at).select('*').maybeSingle();
    if (data) await writeViews(data);
    return data;
  }

  async function myName(): Promise<string> {
    const { data } = await db.from('profiles').select('display_name').eq('id', uid).maybeSingle();
    return data?.display_name ?? 'Spieler';
  }

  async function needContent() {
    const [{ data: rows }, { data: adminRow }, { data: saveRow }] = await Promise.all([
      db.from('content_docs').select('collection, id, data'),
      db.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
      db.from('player_saves').select('save, campaign').eq('player_id', uid).maybeSingle(),
    ]);
    loadContent(rows ?? [], !!adminRow);
    return { isAdmin: !!adminRow, saveRow };
  }

  /** Second player takes a waiting match: the duel starts. */
  async function claim(m: Match, hand: string[], rune: string | null): Promise<Match | null> {
    const { state, arena } = startPvp(m.seed, m.hand_a, hand, m.rune_a, rune);
    const now = new Date().toISOString();
    const { data } = await db.from('pvp_matches').update({
      player_b: uid, name_b: await myName(), hand_b: hand, rune_b: rune, status: 'playing', state, arena_name: arena.name,
      turn_started_at: now, seen_b: now, seen_a: now, updated_at: now,
    }).eq('id', m.id).eq('status', 'waiting').is('player_b', null).select('*').maybeSingle();
    if (data) await writeViews(data);
    return data;
  }

  async function cancelWaiting() {
    const { data: old } = await db.from('pvp_matches').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('player_a', uid).eq('status', 'waiting').select('*');
    for (const m of old ?? []) await writeViews(m);
  }

  async function create(kind: 'invite' | 'random', hand: string[], rune: string | null): Promise<Match | null> {
    const name = await myName();
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db.from('pvp_matches').insert({
        kind, code: kind === 'invite' ? inviteCode(cryptoRandom) : null, player_a: uid, name_a: name, seed: seed(), hand_a: hand, rune_a: rune,
      }).select('*').single();
      if (!error) {
        await writeViews(data);
        return data;
      }
      if (error.code !== '23505') break; // code already taken: try another one
    }
    return null;
  }

  const action = body.action;

  if (action === 'invite' || action === 'join' || action === 'queue') {
    const { isAdmin, saveRow } = await needContent();
    if (!saveRow) return json({ error: 'no_save' }, 409);
    const prep = preparePvp(saveRow.save, saveRow.campaign, body.hand, body.rune ?? null, isAdmin);
    if (!prep.ok) return json({ error: prep.error }, 422);
    if (action === 'join') {
      // Check the code first: entering your own code must not cancel your own invitation.
      const code = normalizeCode(String(body.code ?? ''));
      const { data: m } = await db.from('pvp_matches').select('*').eq('code', code).eq('kind', 'invite').maybeSingle();
      if (!m || m.status !== 'waiting') return json({ error: 'unknown_code' }, 404);
      if (m.player_a === uid) return json({ error: 'own_code' }, 422);
      await cancelWaiting();
      const started = await claim(m, prep.hand, prep.rune);
      return started ? json({ view: viewOf(started, 'b') }) : json({ error: 'unknown_code' }, 404);
    }
    await cancelWaiting();
    if (action === 'invite') {
      const m = await create('invite', prep.hand, prep.rune);
      return m ? json({ view: viewOf(m, 'a') }) : json({ error: 'database' }, 500);
    }
    // Random opponent: take the oldest waiting player who is still there, else wait yourself.
    const fresh = new Date(Date.now() - PVP_ABSENT_SECONDS * 1000).toISOString();
    const { data: waiting } = await db.from('pvp_matches').select('*').eq('kind', 'random').eq('status', 'waiting')
      .neq('player_a', uid).gte('seen_a', fresh).order('created_at').limit(5);
    for (const m of waiting ?? []) {
      const started = await claim(m, prep.hand, prep.rune);
      if (started) return json({ view: viewOf(started, 'b') });
    }
    const m = await create('random', prep.hand, prep.rune);
    return m ? json({ view: viewOf(m, 'a') }) : json({ error: 'database' }, 500);
  }

  if (action === 'stats') {
    const { data } = await db.from('pvp_matches').select('player_a, winner').eq('status', 'finished').or(`player_a.eq.${uid},player_b.eq.${uid}`).limit(5000);
    const s = { wins: 0, draws: 0, losses: 0 };
    for (const m of data ?? []) {
      const seat = m.player_a === uid ? 'a' : 'b';
      if (m.winner === 'draw') s.draws++;
      else if (m.winner === seat) s.wins++;
      else s.losses++;
    }
    return json(s);
  }

  // Everything else acts on one match of this player.
  let m = await load(body.matchId);
  if (!m) return json({ error: 'unknown_match' }, 404);
  const seat = seatOf(m)!;
  const opp = otherSeat(seat);
  await db.from('pvp_matches').update({ [`seen_${seat}`]: new Date().toISOString() }).eq('id', m.id);
  m[`seen_${seat}`] = new Date().toISOString();

  if (action === 'leave') {
    if (m.status === 'waiting') {
      const { data } = await db.from('pvp_matches').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', m.id).eq('status', 'waiting').select('*').maybeSingle();
      if (data) await writeViews(data);
      m = data ?? (await load(m.id))!;
    } else if (m.status === 'playing') {
      m = await finish(m, m.state, opp, 'left');
    }
    return json({ view: viewOf(m, seat) });
  }

  if (m.status !== 'playing') return json({ view: viewOf(m, seat) });

  if (action === 'move') {
    if (typeof body.n === 'number' && body.n !== m.state.moveCount) return json({ error: 'stale', view: viewOf(m, seat) }, 409);
    const r = pvpAction(m.state, seat, body.move ?? null);
    if (!r.ok) return json({ error: r.error, view: viewOf(m, seat) }, 422);
    if (isGameOver(r.state)) m = await finish(m, r.state, pvpWinner(r.state), 'normal');
    else {
      const saved = await saveState(m, r.state, r.state.turn !== m.state.turn);
      if (!saved) return json({ error: 'stale', view: viewOf((await load(m.id))!, seat) }, 409);
      m = saved;
    }
    return json({ view: viewOf(m, seat) });
  }

  if (action === 'tick') {
    // The other player has been gone too long: whoever is still here wins.
    if (ago(m[`seen_${opp}`], PVP_ABSENT_SECONDS)) {
      m = await finish(m, m.state, seat, 'absent');
      return json({ view: viewOf(m, seat) });
    }
    // Time for the move is up: a random card is played for the side to move.
    if (ago(m.turn_started_at, PVP_TURN_SECONDS + GRACE_SECONDS)) {
      const mv = timeoutMove(m.state, m.seed);
      const toMove: Seat = m.state.turn === seatSide('a') ? 'a' : 'b';
      const r = mv ? pvpAction(m.state, toMove, mv) : null;
      if (r && r.ok) {
        if (isGameOver(r.state)) m = await finish(m, r.state, pvpWinner(r.state), 'normal');
        else m = (await saveState(m, r.state, true)) ?? (await load(m.id))!;
      }
    }
    return json({ view: viewOf(m, seat) });
  }
  return json({ error: 'bad_request' }, 400);
});
