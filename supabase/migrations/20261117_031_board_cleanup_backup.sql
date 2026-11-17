-- Stufe 3: Bestenliste der Saison, Ranglisten-Limit gegen denselben Gegner, nächtliches Aufräumen, wöchentliche Sicherung.
--
-- game_archive: a compact line per finished game (day, player, mode, level, result, cards) – written before old
-- tickets and online matches are removed, so the admin statistics and the players' online statistics stay complete.
-- nightly_cleanup (every night): removes finished tickets, online matches, Liga-Belege, collected or expired Postfach
-- items, old daily/weekly quest keys and card-limit days older than 30 days. Saves, cards, accounts, the ladder, raids,
-- puzzle events and Postfach gifts not collected yet are never touched.
-- content_backup (every week): a copy of all game content (cards, arenas, campaign, events …); the last 8 are kept.

-- ---------- Archive of finished games ----------
create table public.game_archive (
  id bigserial primary key,
  day date not null,
  player_id uuid references auth.users (id) on delete cascade,
  mode text not null,
  level text,
  outcome text not null check (outcome in ('win', 'draw', 'loss')),
  cards jsonb
);
create index game_archive_day on public.game_archive (day);
create index game_archive_player on public.game_archive (player_id, mode);
alter table public.game_archive enable row level security;

-- ---------- Online-Rangliste: did this match count for the ladder? (false: limit against this opponent reached) ----------
alter table public.pvp_matches add column if not exists ladder_counted boolean;
create index if not exists pvp_matches_ranked_pair on public.pvp_matches (player_a, player_b, finished_at) where kind = 'ranked';

-- ---------- Weekly content backup ----------
create table public.content_backups (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  docs integer not null,
  data jsonb not null
);
alter table public.content_backups enable row level security;
create policy "content backups: admins read" on public.content_backups for select to authenticated using ((select private.is_admin()));

create or replace function private.content_backup()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.content_backups (docs, data)
    select count(*), coalesce(jsonb_agg(jsonb_build_object('collection', collection, 'id', id, 'status', status, 'data', data) order by collection, id), '[]'::jsonb)
    from public.content_docs
    returning docs into n;
  delete from public.content_backups where id not in (select id from public.content_backups order by created_at desc limit 8);
  return n;
end;
$$;
revoke all on function private.content_backup() from public, anon, authenticated;

-- ---------- Nightly cleanup ----------
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
           case kind when 'adventure' then 'Einfaches Spiel' when 'campaign' then 'Kampagne' else 'Rangliste' end,
           ticket->>'level',
           case when kind = 'league' then case when (result->>'won')::boolean then 'win' else 'loss' end else result->>'outcome' end,
           coalesce(ticket->'hand', ticket->'deck')
    from public.game_tickets
    where finished_at < cutoff and kind in ('adventure', 'campaign', 'league') and coalesce((result->>'ok')::boolean, false)
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
revoke all on function private.nightly_cleanup() from public, anon, authenticated;

-- ---------- Online statistics of a player (live matches + archive) ----------
create or replace function private.pvp_stats(p_player uuid, p_mode text)
returns jsonb language sql security definer set search_path = '' stable as $$
  with live as (
    select case when winner = 'draw' then 'draw' when (winner = 'a' and player_a = p_player) or (winner = 'b' and player_b = p_player) then 'win' else 'loss' end as outcome
    from public.pvp_matches
    where status = 'finished' and mode = p_mode and (player_a = p_player or player_b = p_player)
  ), old as (
    select outcome from public.game_archive
    where player_id = p_player and mode = case p_mode when 'draft' then 'Draft online' else 'Online-Duell' end
  ), allg as (select outcome from live union all select outcome from old)
  select jsonb_build_object('wins', count(*) filter (where outcome = 'win'), 'draws', count(*) filter (where outcome = 'draw'),
                            'losses', count(*) filter (where outcome = 'loss'))
  from allg;
$$;
revoke all on function private.pvp_stats(uuid, text) from public, anon, authenticated;
grant execute on function private.pvp_stats(uuid, text) to service_role;
create or replace function public.pvp_stats(p_player uuid, p_mode text)
returns jsonb language sql security invoker set search_path = '' as $$ select private.pvp_stats(p_player, p_mode); $$;
revoke all on function public.pvp_stats(uuid, text) from public, anon, authenticated;
grant execute on function public.pvp_stats(uuid, text) to service_role;

-- ---------- Bestenliste of a season ----------
-- Order: step, then win points on the step, then wins, then fewer games (the more efficient climb first).
-- Only players with at least one game this season. Names from profiles; titles for the avatar (mapped by the server).
create or replace function private.ladder_board(p_season text, p_player uuid, p_limit integer)
returns jsonb language sql security definer set search_path = '' stable as $$
  with s as (
    select l.player_id,
           coalesce((l.state->>'step')::int, 0) as step,
           coalesce((l.state->>'points')::int, 0) as points,
           coalesce((l.state->>'wins')::int, 0) as wins,
           coalesce((l.state->>'games')::int, 0) as games
    from public.ladder l
    where l.state->>'season' = p_season and coalesce((l.state->>'games')::int, 0) > 0
  ), r as (
    select s.*, row_number() over (order by step desc, points desc, wins desc, games asc, player_id) as rank from s
  )
  select jsonb_build_object(
    'total', (select count(*) from r),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                'rank', r.rank, 'name', coalesce(p.display_name, 'Spieler'), 'titles', q.titles, 'me', r.player_id = p_player,
                'step', r.step, 'points', r.points, 'wins', r.wins, 'games', r.games) order by r.rank), '[]'::jsonb)
             from r left join public.profiles p on p.id = r.player_id left join public.quest_progress q on q.player_id = r.player_id
             where r.rank <= least(200, greatest(1, p_limit))),
    'me', (select jsonb_build_object('rank', r.rank, 'step', r.step, 'points', r.points, 'wins', r.wins, 'games', r.games)
           from r where r.player_id = p_player)
  );
$$;
revoke all on function private.ladder_board(text, uuid, integer) from public, anon, authenticated;
grant execute on function private.ladder_board(text, uuid, integer) to service_role;
create or replace function public.ladder_board(p_season text, p_player uuid, p_limit integer)
returns jsonb language sql security invoker set search_path = '' as $$ select private.ladder_board(p_season, p_player, p_limit); $$;
revoke all on function public.ladder_board(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.ladder_board(text, uuid, integer) to service_role;

-- ---------- Admin statistics: include the archive ----------
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
revoke all on function private.admin_stats(integer) from public, anon, authenticated;
grant execute on function private.admin_stats(integer) to service_role;

-- ---------- Schedule (pg_cron, times in UTC) ----------
create extension if not exists pg_cron;
select cron.schedule('gridrune-nightly-cleanup', '17 2 * * *', 'select private.nightly_cleanup()');
select cron.schedule('gridrune-weekly-backup', '43 2 * * 1', 'select private.content_backup()');
