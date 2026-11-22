-- Turm der Prüfungen (Phase 1): the progress of every player (highest cleared floor) and the floor rewards already
-- paid. Both are written only by the server function "game" after it replayed the duel (private.tower_finish):
-- ticket finished, floor unlocked and reward paid together or not at all; floors are never skipped and a reward is
-- paid once per account and floor. The floors themselves are content (content_docs "tower_floors").

alter table public.game_tickets drop constraint game_tickets_kind_check;
alter table public.game_tickets add constraint game_tickets_kind_check check (kind in ('adventure', 'campaign', 'shop', 'league', 'tower'));


-- Floors are admin documents (content_docs tower_floors/<id>).
alter table public.content_docs drop constraint content_docs_collection_check;
alter table public.content_docs add constraint content_docs_collection_check check (collection in (
  'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes', 'raids', 'quests', 'avatars',
  'puzzles', 'editions', 'tower_floors'
));

create table public.tower_progress (
  player_id uuid primary key references auth.users (id) on delete cascade,
  cleared integer not null default 0 check (cleared >= 0),
  updated_at timestamptz not null default now()
);
alter table public.tower_progress enable row level security;
create policy "tower progress: own read" on public.tower_progress for select to authenticated using (player_id = (select auth.uid()));

create table public.tower_rewards (
  player_id uuid not null references auth.users (id) on delete cascade,
  floor_id text not null check (floor_id ~ '^t[0-9]{3,5}$'),
  floor_number integer not null,
  reward jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, floor_id)
);
alter table public.tower_rewards enable row level security;
create policy "tower rewards: own read" on public.tower_rewards for select to authenticated using (player_id = (select auth.uid()));

/**
 * Finishes a tower ticket. p_won: the server's replay was a win. p_save: the save with the floor reward added (null =
 * the floor has no reward). Returns {status: 'paid' | 'already' | 'conflict', cleared, rewarded}.
 * - 'already': this ticket was finished before (repeated sending changes nothing).
 * - 'conflict': the save changed in between – nothing is stored, the function reads again and retries.
 */
create or replace function private.tower_finish(p_ticket uuid, p_player uuid, p_floor text, p_number integer, p_won boolean,
  p_result jsonb, p_save jsonb, p_reward jsonb, p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c integer;
  rewarded boolean := false;
begin
  update public.game_tickets set finished_at = now(), result = p_result
    where id = p_ticket and player_id = p_player and kind = 'tower' and finished_at is null;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  insert into public.tower_progress (player_id) values (p_player) on conflict do nothing;
  select cleared into c from public.tower_progress where player_id = p_player for update;
  -- Only the next floor (or one cleared before) counts: floors are never skipped.
  if p_won and p_number <= c + 1 then
    if p_number = c + 1 then
      update public.tower_progress set cleared = p_number, updated_at = now() where player_id = p_player;
      c := p_number;
    end if;
    if p_save is not null then
      insert into public.tower_rewards (player_id, floor_id, floor_number, reward) values (p_player, p_floor, p_number, p_reward) on conflict do nothing;
      if found then
        update public.player_saves set save = p_save, version = p_version + 1, updated_at = now() where player_id = p_player and version = p_version;
        if not found then
          raise exception 'save_conflict';
        end if;
        rewarded := true;
      end if;
    end if;
  end if;
  return jsonb_build_object('status', 'paid', 'cleared', c, 'rewarded', rewarded);
exception
  when raise_exception then
    if sqlerrm = 'save_conflict' then
      return jsonb_build_object('status', 'conflict');
    end if;
    raise;
end;
$$;
revoke all on function private.tower_finish(uuid, uuid, text, integer, boolean, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function private.tower_finish(uuid, uuid, text, integer, boolean, jsonb, jsonb, jsonb, integer) to service_role;
create or replace function public.tower_finish(p_ticket uuid, p_player uuid, p_floor text, p_number integer, p_won boolean,
  p_result jsonb, p_save jsonb, p_reward jsonb, p_version integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.tower_finish(p_ticket, p_player, p_floor, p_number, p_won, p_result, p_save, p_reward, p_version);
$$;
revoke all on function public.tower_finish(uuid, uuid, text, integer, boolean, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.tower_finish(uuid, uuid, text, integer, boolean, jsonb, jsonb, jsonb, integer) to service_role;

/** Admin test: resets the tower of one account (the server function allows it only for the admin's own account). */
create or replace function private.tower_reset(p_player uuid, p_rewards boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.tower_progress where player_id = p_player;
  if p_rewards then
    delete from public.tower_rewards where player_id = p_player;
  end if;
end;
$$;
revoke all on function private.tower_reset(uuid, boolean) from public, anon, authenticated;
grant execute on function private.tower_reset(uuid, boolean) to service_role;
create or replace function public.tower_reset(p_player uuid, p_rewards boolean)
returns void language sql security invoker set search_path = '' as $$ select private.tower_reset(p_player, p_rewards); $$;
revoke all on function public.tower_reset(uuid, boolean) from public, anon, authenticated;
grant execute on function public.tower_reset(uuid, boolean) to service_role;

-- Admin statistics and the nightly archive count tower duels as "Turm".
create or replace function private.nightly_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  n_tickets integer;
  n_matches integer;
  n_refs integer;
  n_inbox integer;
  n_quests integer;
  n_days integer;
  n_errors integer;
begin
  -- Finished games → archive (same rules as the admin statistics), then remove.
  insert into public.game_archive (day, player_id, mode, level, outcome, cards)
    select (finished_at at time zone 'Europe/Berlin')::date, player_id,
           case kind when 'adventure' then 'Einfaches Spiel' when 'campaign' then 'Kampagne' when 'tower' then 'Turm' else 'Rangliste' end,
           ticket->>'level',
           case when kind = 'league' then case when (result->>'won')::boolean then 'win' else 'loss' end else result->>'outcome' end,
           coalesce(ticket->'hand', ticket->'deck')
    from public.game_tickets
    where finished_at < cutoff and kind in ('adventure', 'campaign', 'league', 'tower') and coalesce((result->>'ok')::boolean, false)
      and (case when kind = 'league' then 'win' else result->>'outcome' end) in ('win', 'draw', 'loss');
  -- Unfinished tickets expired long ago go too – except open ranked matches, which still count as lost when the player returns.
  delete from public.game_tickets
    where finished_at < cutoff or (finished_at is null and created_at < cutoff and ticket->'step' is null);
  get diagnostics n_tickets = row_count;

  insert into public.game_archive (day, player_id, mode, level, outcome, cards)
    select (finished_at at time zone 'Europe/Berlin')::date, s.player, case mode when 'draft' then 'Draft online' else 'Online-Duell' end, null,
           case when winner = 'draw' then 'draw' when winner = s.seat then 'win' else 'loss' end, s.cards
    from public.pvp_matches m
    cross join lateral (values (m.player_a, 'a', coalesce(m.hand_a, m.deck_a)), (m.player_b, 'b', coalesce(m.hand_b, m.deck_b))) as s(player, seat, cards)
    where m.status = 'finished' and m.finished_at < cutoff and s.player is not null and m.winner in ('a', 'b', 'draw');
  delete from public.pvp_matches
    where (status = 'finished' and finished_at < cutoff) or (status in ('cancelled', 'waiting') and updated_at < cutoff);
  get diagnostics n_matches = row_count;

  -- Liga-Belege of single matches (season changes stay: they guard the season rewards).
  delete from public.ladder_refs where created_at < cutoff and ref not like 'season:%';
  get diagnostics n_refs = row_count;
  delete from public.inbox_items where claimed_at < cutoff or (claimed_at is null and expires_at < cutoff);
  get diagnostics n_inbox = row_count;
  -- Daily and weekly quest keys (achievements "a:…" stay forever).
  delete from public.quest_claims where created_at < cutoff and (key like 'd:%' or key like 'w:%');
  get diagnostics n_quests = row_count;
  delete from public.reward_days where day < (now() at time zone 'Europe/Berlin')::date - 30;
  get diagnostics n_days = row_count;
  delete from public.client_errors where last_at < cutoff;
  get diagnostics n_errors = row_count;
  -- Archive lines are kept 400 days (like the activity days).
  delete from public.game_archive where day < (now() at time zone 'Europe/Berlin')::date - 400;
  return jsonb_build_object('tickets', n_tickets, 'matches', n_matches, 'ladderRefs', n_refs, 'inbox', n_inbox, 'quests', n_quests, 'cardDays', n_days, 'errors', n_errors);
end;
$$;

create or replace function private.admin_stats(p_days integer)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  days integer := least(365, greatest(1, coalesce(p_days, 30)));
  today date := (now() at time zone 'Europe/Berlin')::date;
  since date := today - (least(365, greatest(1, coalesce(p_days, 30))) - 1);
  out jsonb;
begin
  with act as (
    select player_id, day from public.activity_days
    union select player_id, (created_at at time zone 'Europe/Berlin')::date from public.game_tickets
    union select player_id, (started_at at time zone 'Europe/Berlin')::date from public.raid_attempts
    union select player_a, (created_at at time zone 'Europe/Berlin')::date from public.pvp_matches where player_a is not null
    union select player_b, (created_at at time zone 'Europe/Berlin')::date from public.pvp_matches where player_b is not null
    union select player_id, (created_at at time zone 'Europe/Berlin')::date from public.quest_claims
    union select player_id, (created_at at time zone 'Europe/Berlin')::date from public.chat_messages
    union select player_id, day from public.game_archive where player_id is not null
  ),
  -- Every checked game of a player: the cards brought into it (hand, else deck), the result, the mode.
  games as (
    select row_number() over () as gid, * from (
      select coalesce(ticket->'hand', ticket->'deck') as cards,
             case when kind = 'league' then case when (result->>'won')::boolean then 'win' else 'loss' end else result->>'outcome' end as outcome,
             case kind when 'adventure' then 'Einfaches Spiel' when 'campaign' then 'Kampagne' when 'tower' then 'Turm' else 'Rangliste' end as mode,
             ticket->>'level' as level, (finished_at at time zone 'Europe/Berlin')::date as day
      from public.game_tickets
      where kind in ('adventure', 'campaign', 'league', 'tower') and finished_at is not null and coalesce((result->>'ok')::boolean, false)
      union all
      select ticket->'hand', outcome, 'Raid', null, (finished_at at time zone 'Europe/Berlin')::date
      from public.raid_attempts where finished_at is not null and outcome in ('win', 'draw', 'loss')
      union all
      select coalesce(hand_a, deck_a), case winner when 'a' then 'win' when 'b' then 'loss' else 'draw' end,
             case mode when 'draft' then 'Draft online' else 'Online-Duell' end, null, (finished_at at time zone 'Europe/Berlin')::date
      from public.pvp_matches where status = 'finished' and finished_at is not null
      union all
      select coalesce(hand_b, deck_b), case winner when 'b' then 'win' when 'a' then 'loss' else 'draw' end,
             case mode when 'draft' then 'Draft online' else 'Online-Duell' end, null, (finished_at at time zone 'Europe/Berlin')::date
      from public.pvp_matches where status = 'finished' and finished_at is not null and player_b is not null
      union all
      select cards, outcome, mode, level, day from public.game_archive
    ) g
    where outcome in ('win', 'draw', 'loss')
  ),
  period as (select * from games where day >= since),
  card_rows as (
    select distinct p.gid, c.card, p.outcome
    from period p, jsonb_array_elements_text(case when jsonb_typeof(p.cards) = 'array' then p.cards else '[]'::jsonb end) as c(card)
  ),
  saves as (
    select greatest(0, coalesce((save->>'coins')::numeric, 0)) as coins, greatest(0, coalesce((save->>'stones')::numeric, 0)) as stones from public.player_saves
  )
  select jsonb_build_object(
    'days', days,
    'today', today,
    'players', jsonb_build_object(
      'total', (select count(*) from public.player_saves),
      'today', (select count(distinct player_id) from act where day = today),
      'week', (select count(distinct player_id) from act where day > today - 7),
      'month', (select count(distinct player_id) from act where day > today - 30),
      'period', (select count(distinct player_id) from act where day >= since)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'active', (select count(distinct player_id) from act where act.day = d.day),
        'new', (select count(*) from public.player_saves s where (s.created_at at time zone 'Europe/Berlin')::date = d.day),
        'games', (select count(*) from games g where g.day = d.day)
      ) order by d.day), '[]'::jsonb)
      from (select generate_series(since, today, interval '1 day')::date as day) d),
    'modes', (select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'level', level, 'games', n, 'wins', w, 'draws', dr, 'losses', l) order by n desc), '[]'::jsonb) from (
        select mode, level, count(*) n, count(*) filter (where outcome = 'win') w, count(*) filter (where outcome = 'draw') dr, count(*) filter (where outcome = 'loss') l
        from period group by mode, level) m),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('id', card, 'games', n, 'wins', w, 'draws', dr, 'losses', l)), '[]'::jsonb) from (
        select card, count(*) n, count(*) filter (where outcome = 'win') w, count(*) filter (where outcome = 'draw') dr, count(*) filter (where outcome = 'loss') l
        from card_rows group by card) c),
    'games', (select count(*) from period),
    'economy', jsonb_build_object(
      'players', (select count(*) from saves),
      'coins', (select coalesce(sum(coins), 0) from saves),
      'stones', (select coalesce(sum(stones), 0) from saves),
      'coinsMedian', (select coalesce(percentile_cont(0.5) within group (order by coins), 0) from saves),
      'coinsMax', (select coalesce(max(coins), 0) from saves),
      'stonesMedian', (select coalesce(percentile_cont(0.5) within group (order by stones), 0) from saves),
      'buckets', (select jsonb_build_array(
          count(*) filter (where coins < 500), count(*) filter (where coins >= 500 and coins < 2000),
          count(*) filter (where coins >= 2000 and coins < 5000), count(*) filter (where coins >= 5000)) from saves),
      'history', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'players', players, 'coins', coins, 'stones', stones) order by day), '[]'::jsonb)
                  from public.economy_days where day >= since)
    )
  ) into out;
  return out;
end;
$$;
