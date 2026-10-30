// Online duels between two signed-in players. This function is the referee: it creates matches (invite code or
// random opponent), checks every move with the game's own rules (engine.js) and decides time-outs (a random card
// after 30 seconds) and absences (whoever is still there after 20 seconds without a sign of life from the other
// one wins). The full duel stays in pvp_matches; each player gets only their own view in pvp_views (live).
// Draft League ("draft"): both get the same pool of 30 cards, build a secret deck of 20, run their own fair track
// (replayed here) and duel with the 8 collected cards.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// The game's rules, bundled by scripts/build-engine.mjs (public/server/engine-<hash>.js), loaded from this exact commit.
import {
  DRAFT_PREPARE_SECONDS, DRAFT_WIN_COINS, PVP_ABSENT_SECONDS, PVP_DAILY_PAID_WINS, PVP_MIN_MOVES_FOR_COINS, PVP_TURN_SECONDS, PVP_WIN_COINS,
  completeDraftDeck, draftLayout, draftPool, inviteCode, isGameOver, loadContent, normalizeCode, otherSeat, picksToHand, preparePvp, pvpAction,
  pvpScore, pvpWinner, replayDraftRun, seatSide, startPvp, timeoutMove, validDraftDeck, viewState,
} from 'https://cdn.jsdelivr.net/gh/Dacunha66/gridrune@6aa5e3a61970db5a3dd79ba5a81a4120b76bd80a/public/server/engine-b9ea8ed365f4.js';

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
  const result = m.status === 'finished'
    ? {
      outcome: m.winner === 'draw' ? 'draw' : m.winner === seat ? 'win' : 'loss',
      reason: m.end_reason,
      score: m.state ? pvpScore(m.state, seat) : { me: 0, opponent: 0 },
      coins: m.winner === seat ? m.coins : 0,
    }
    : null;
  const myDeck = m[`deck_${seat}`] ?? null;
  const draft = m.mode === 'draft' && m.pool
    ? {
      pool: m.pool,
      deck: myDeck,
      // The own track (only while it is still to be run).
      layout: m.status === 'drafting' && myDeck && !m[`hand_${seat}`] ? draftLayout(m.seed, seat, myDeck) : null,
      runDone: !!m[`hand_${seat}`],
      opponentDeckDone: !!m[`deck_${opp}`],
      opponentRunDone: !!m[`hand_${opp}`],
      deadline: m.prepare_deadline,
    }
    : null;
  return {
    matchId: m.id, status: m.status, seat, kind: m.kind, code: m.code, mode: m.mode ?? 'duel', draft,
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
        .eq('status', 'finished').eq('mode', m.mode).gt('coins', 0).gte('finished_at', since)
        .or(`and(player_a.eq.${w},player_b.eq.${l},winner.eq.a),and(player_b.eq.${w},player_a.eq.${l},winner.eq.b)`);
      if ((count ?? 0) < PVP_DAILY_PAID_WINS) {
        coins = m.mode === 'draft' ? DRAFT_WIN_COINS : PVP_WIN_COINS;
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

  // Card values, arenas and runes as players see them (the same for both players – no admin previews in duels).
  const { data: contentRows } = await db.from('content_docs').select('collection, id, data');
  loadContent(contentRows ?? [], false);

  async function needSave() {
    const { data: saveRow } = await db.from('player_saves').select('save, campaign').eq('player_id', uid).maybeSingle();
    return { isAdmin: false, saveRow };
  }

  /** Second player takes a waiting match: the duel starts (a draft starts with the preparation). */
  async function claim(m: Match, hand: string[] | null, rune: string | null): Promise<Match | null> {
    const now = new Date().toISOString();
    const common = { player_b: uid, name_b: await myName(), rune_b: rune, seen_b: now, seen_a: now, updated_at: now };
    const patch = m.mode === 'draft'
      ? { ...common, status: 'drafting', pool: draftPool(m.seed), prepare_deadline: new Date(Date.now() + DRAFT_PREPARE_SECONDS * 1000).toISOString() }
      : (() => {
        const { state, arena } = startPvp(m.seed, m.hand_a, hand!, m.rune_a, rune);
        return { ...common, hand_b: hand, status: 'playing', state, arena_name: arena.name, turn_started_at: now };
      })();
    const { data } = await db.from('pvp_matches').update(patch).eq('id', m.id).eq('status', 'waiting').is('player_b', null).select('*').maybeSingle();
    if (data) await writeViews(data);
    return data;
  }

  /** Draft: both hands are ready (or the time ran out) – the duel starts. */
  async function startDraftDuel(m: Match): Promise<Match> {
    const { state, arena } = startPvp(m.seed, m.hand_a, m.hand_b, m.rune_a, m.rune_b);
    const now = new Date().toISOString();
    const { data } = await db.from('pvp_matches').update({ status: 'playing', state, arena_name: arena.name, turn_started_at: now, updated_at: now })
      .eq('id', m.id).eq('status', 'drafting').select('*').maybeSingle();
    if (data) await writeViews(data);
    return data ?? (await load(m.id))!;
  }

  /** Draft: saves a change of the preparation if nobody changed the match in between. */
  async function saveDraft(m: Match, patch: Match): Promise<Match | null> {
    const { data } = await db.from('pvp_matches').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', m.id).eq('status', 'drafting').eq('updated_at', m.updated_at).select('*').maybeSingle();
    if (data) await writeViews(data);
    return data;
  }

  async function cancelWaiting() {
    const { data: old } = await db.from('pvp_matches').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('player_a', uid).eq('status', 'waiting').select('*');
    for (const m of old ?? []) await writeViews(m);
  }

  async function create(kind: 'invite' | 'random', mode: 'duel' | 'draft', hand: string[] | null, rune: string | null): Promise<Match | null> {
    const name = await myName();
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db.from('pvp_matches').insert({
        kind, mode, code: kind === 'invite' ? inviteCode(cryptoRandom) : null, player_a: uid, name_a: name, seed: seed(), hand_a: hand, rune_a: rune,
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
    const { isAdmin, saveRow } = await needSave();
    if (!saveRow) return json({ error: 'no_save' }, 409);
    let mode: 'duel' | 'draft' = body.mode === 'draft' ? 'draft' : 'duel';
    let invited: Match | null = null;
    if (action === 'join') {
      // Check the code first: entering your own code must not cancel your own invitation. The code decides the mode.
      const code = normalizeCode(String(body.code ?? ''));
      const { data } = await db.from('pvp_matches').select('*').eq('code', code).eq('kind', 'invite').maybeSingle();
      if (!data || data.status !== 'waiting') return json({ error: 'unknown_code' }, 404);
      if (data.player_a === uid) return json({ error: 'own_code' }, 422);
      invited = data;
      mode = data.mode === 'draft' ? 'draft' : 'duel';
    }
    const prep = preparePvp(saveRow.save, saveRow.campaign, body.hand, body.rune ?? null, isAdmin, mode === 'duel');
    if (!prep.ok) return json({ error: prep.error }, 422);
    if (invited) {
      const m = invited;
      await cancelWaiting();
      const started = await claim(m, prep.hand, prep.rune);
      return started ? json({ view: viewOf(started, 'b') }) : json({ error: 'unknown_code' }, 404);
    }
    await cancelWaiting();
    if (action === 'invite') {
      const m = await create('invite', mode, prep.hand, prep.rune);
      return m ? json({ view: viewOf(m, 'a') }) : json({ error: 'database' }, 500);
    }
    // Random opponent: take the oldest waiting player who is still there, else wait yourself.
    const fresh = new Date(Date.now() - PVP_ABSENT_SECONDS * 1000).toISOString();
    const { data: waiting } = await db.from('pvp_matches').select('*').eq('kind', 'random').eq('mode', mode).eq('status', 'waiting')
      .neq('player_a', uid).gte('seen_a', fresh).order('created_at').limit(5);
    for (const m of waiting ?? []) {
      const started = await claim(m, prep.hand, prep.rune);
      if (started) return json({ view: viewOf(started, 'b') });
    }
    const m = await create('random', mode, prep.hand, prep.rune);
    return m ? json({ view: viewOf(m, 'a') }) : json({ error: 'database' }, 500);
  }

  if (action === 'stats') {
    const { data } = await db.from('pvp_matches').select('player_a, winner').eq('status', 'finished').eq('mode', body.mode === 'draft' ? 'draft' : 'duel')
      .or(`player_a.eq.${uid},player_b.eq.${uid}`).limit(5000);
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
    } else if (m.status === 'playing' || m.status === 'drafting') {
      m = await finish(m, m.state, opp, 'left');
    }
    return json({ view: viewOf(m, seat) });
  }

  if (m.status === 'drafting') {
    if (action === 'deck') {
      if (m[`deck_${seat}`]) return json({ view: viewOf(m, seat) });
      if (!validDraftDeck(body.deck, m.pool)) return json({ error: 'deck', view: viewOf(m, seat) }, 422);
      const saved = await saveDraft(m, { [`deck_${seat}`]: body.deck });
      return saved ? json({ view: viewOf(saved, seat) }) : json({ error: 'stale', view: viewOf((await load(m.id))!, seat) }, 409);
    }
    if (action === 'run') {
      const deck = m[`deck_${seat}`];
      if (!deck || m[`hand_${seat}`]) return json({ view: viewOf(m, seat) });
      const run = replayDraftRun(draftLayout(m.seed, seat, deck), body.run as never);
      if (run.error) return json({ error: 'run', detail: run.error, view: viewOf(m, seat) }, 422);
      let saved = await saveDraft(m, { [`hand_${seat}`]: picksToHand(run.picks) });
      if (!saved) return json({ error: 'stale', view: viewOf((await load(m.id))!, seat) }, 409);
      if (saved.hand_a && saved.hand_b) saved = await startDraftDuel(saved);
      return json({ view: viewOf(saved, seat) });
    }
    if (action === 'tick') {
      if (ago(m[`seen_${opp}`], PVP_ABSENT_SECONDS)) {
        m = await finish(m, null, seat, 'absent');
        return json({ view: viewOf(m, seat) });
      }
      // Time is up: missing decks are completed with the strongest cards, missing runs taken automatically.
      if (m.prepare_deadline && Date.now() > new Date(m.prepare_deadline).getTime() + GRACE_SECONDS * 1000) {
        const patch: Match = {};
        for (const s of ['a', 'b'] as Seat[]) {
          const deck = m[`deck_${s}`] ?? completeDraftDeck(m.pool, []);
          if (!m[`deck_${s}`]) patch[`deck_${s}`] = deck;
          if (!m[`hand_${s}`]) patch[`hand_${s}`] = picksToHand(replayDraftRun(draftLayout(m.seed, s, deck), { inputs: [], skippedAt: 0 }).picks);
        }
        const saved = await saveDraft(m, patch);
        if (saved) m = await startDraftDuel(saved);
        else m = (await load(m.id))!;
      }
      return json({ view: viewOf(m, seat) });
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
