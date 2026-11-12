-- Admin-Statistik: active players per day, card results, coins and Runensteine in circulation.
-- activity_days: one row per player and day the game was opened (marked when the menu loads the Login-Kalender);
-- kept 400 days. economy_days: once a day the total of coins and Runensteine of all saves (for the history).
-- Neither table is readable by players; only the server functions (service role) use them.
create table public.activity_days (
  player_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (player_id, day)
);
create index activity_days_day on public.activity_days (day);
alter table public.activity_days enable row level security;

create table public.economy_days (
  day date primary key,
  players integer not null,
  coins bigint not null,
  stones bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.economy_days enable row level security;

/** Marks today (Berlin) for a player; the first mark of the day also writes today's economy total. */
create or replace function private.activity_mark(p_player uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  insert into public.activity_days (player_id, day) values (p_player, today) on conflict do nothing;
  if found then
    insert into public.economy_days (day, players, coins, stones)
      select today, count(*), coalesce(sum(greatest(0, coalesce((save->>'coins')::numeric, 0))), 0)::bigint,
             coalesce(sum(greatest(0, coalesce((save->>'stones')::numeric, 0))), 0)::bigint
      from public.player_saves
      on conflict (day) do update set players = excluded.players, coins = excluded.coins, stones = excluded.stones, updated_at = now();
    delete from public.activity_days where day < today - 400;
  end if;
end;
$$;

/** Everything the admin statistics page shows, for the last p_days days (Berlin days). */
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
  ),
  -- Every checked game of a player: the cards brought into it (hand, else deck), the result, the mode.
  games as (
    select row_number() over () as gid, * from (
      select coalesce(ticket->'hand', ticket->'deck') as cards,
             case when kind = 'league' then case when (result->>'won')::boolean then 'win' else 'loss' end else result->>'outcome' end as outcome,
             case kind when 'adventure' then 'Einfaches Spiel' when 'campaign' then 'Kampagne' else 'Rangliste' end as mode,
             ticket->>'level' as level, (finished_at at time zone 'Europe/Berlin')::date as day
      from public.game_tickets
      where kind in ('adventure', 'campaign', 'league') and finished_at is not null and coalesce((result->>'ok')::boolean, false)
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

revoke all on function private.activity_mark(uuid) from public, anon, authenticated;
revoke all on function private.admin_stats(integer) from public, anon, authenticated;
grant execute on function private.activity_mark(uuid) to service_role;
grant execute on function private.admin_stats(integer) to service_role;

create or replace function public.activity_mark(p_player uuid)
returns void language sql security invoker set search_path = '' as $$ select private.activity_mark(p_player); $$;
create or replace function public.admin_stats(p_days integer)
returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_stats(p_days); $$;
revoke all on function public.activity_mark(uuid) from public, anon, authenticated;
revoke all on function public.admin_stats(integer) from public, anon, authenticated;
grant execute on function public.activity_mark(uuid) to service_role;
grant execute on function public.admin_stats(integer) to service_role;
