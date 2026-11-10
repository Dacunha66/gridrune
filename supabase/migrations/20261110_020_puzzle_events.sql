-- GridRune Puzzle-Events: players collect fragments of a card picture with event tasks; a complete puzzle unlocks a
-- card edition (same card, own picture). The events and editions are admin documents (content_docs puzzles/<id>,
-- editions/<id>). These tables keep each player's pieces (for ever – a repeated event continues), the task counters of
-- each event run and the tasks already rewarded (one row per task and period: nothing is paid twice). Players may read
-- their own rows; only the server (service role) writes, through the functions below.

alter table public.content_docs drop constraint content_docs_collection_check;
alter table public.content_docs add constraint content_docs_collection_check check (collection in (
  'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes', 'raids', 'quests', 'avatars',
  'puzzles', 'editions'
));

create table public.puzzle_progress (
  player_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null check (puzzle_id ~ '^pz[0-9]{2,4}$'),
  -- Pieces collected (0-based); never twice (checked in puzzle_claim).
  pieces smallint[] not null default '{}' check (cardinality(pieces) <= 64),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, puzzle_id)
);
alter table public.puzzle_progress enable row level security;
create policy "puzzle progress: own rows" on public.puzzle_progress for select to authenticated using ((select auth.uid()) = player_id);

create table public.puzzle_counters (
  player_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null check (puzzle_id ~ '^pz[0-9]{2,4}$'),
  run_id text not null check (run_id ~ '^r[0-9]{1,4}$'),
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  daily jsonb not null default '{}'::jsonb check (jsonb_typeof(daily) = 'object'),
  weekly jsonb not null default '{}'::jsonb check (jsonb_typeof(weekly) = 'object'),
  total jsonb not null default '{}'::jsonb check (jsonb_typeof(total) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (player_id, puzzle_id, run_id)
);
alter table public.puzzle_counters enable row level security;
create policy "puzzle counters: own rows" on public.puzzle_counters for select to authenticated using ((select auth.uid()) = player_id);

create table public.puzzle_claims (
  player_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null check (puzzle_id ~ '^pz[0-9]{2,4}$'),
  -- <run>:d:<day>:<task>, <run>:w:<week>:<task>, <run>:o:<task>
  key text not null check (char_length(key) between 3 and 80),
  pieces smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (player_id, puzzle_id, key)
);
alter table public.puzzle_claims enable row level security;
create policy "puzzle claims: own rows" on public.puzzle_claims for select to authenticated using ((select auth.uid()) = player_id);

-- Adds checked results to the counters of every puzzle run that is published and running right now (start ≤ now < end).
-- Called by quest_add, i.e. only by the server functions after a result they checked themselves.
create or replace function private.puzzle_add(p_player uuid, p_day text, p_week text, p_delta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
  c public.puzzle_counters%rowtype;
  d jsonb;
  w jsonb;
  t jsonb;
  k text;
  v jsonb;
  n numeric;
begin
  for ev in
    select id, data -> 'run' ->> 'id' as run_id from public.content_docs
    where collection = 'puzzles' and data ->> 'status' = 'published'
      and (data -> 'run' ->> 'id') ~ '^r[0-9]{1,4}$'
      and (data -> 'run' ->> 'startsAt') ~ '^\d{4}-\d{2}-\d{2}T' and (data -> 'run' ->> 'endsAt') ~ '^\d{4}-\d{2}-\d{2}T'
      and (data -> 'run' ->> 'startsAt')::timestamptz <= now() and now() < (data -> 'run' ->> 'endsAt')::timestamptz
  loop
    insert into public.puzzle_counters (player_id, puzzle_id, run_id, day, week) values (p_player, ev.id, ev.run_id, p_day, p_week)
      on conflict do nothing;
    select * into c from public.puzzle_counters where player_id = p_player and puzzle_id = ev.id and run_id = ev.run_id for update;
    d := case when c.day = p_day then c.daily else '{}'::jsonb end;
    w := case when c.week = p_week then c.weekly else '{}'::jsonb end;
    t := c.total;
    for k, v in select key, value from jsonb_each(p_delta) loop
      if jsonb_typeof(v) <> 'number' or char_length(k) > 40 then
        continue;
      end if;
      n := floor((v #>> '{}')::numeric);
      if n <= 0 or n > 1000 then
        continue;
      end if;
      d := jsonb_set(d, array[k], to_jsonb(coalesce((d ->> k)::numeric, 0) + n));
      w := jsonb_set(w, array[k], to_jsonb(coalesce((w ->> k)::numeric, 0) + n));
      t := jsonb_set(t, array[k], to_jsonb(coalesce((t ->> k)::numeric, 0) + n));
    end loop;
    update public.puzzle_counters set day = p_day, week = p_week, daily = d, weekly = w, total = t, updated_at = now()
      where player_id = p_player and puzzle_id = ev.id and run_id = ev.run_id;
  end loop;
end;
$$;

-- The quest counters as before, then the puzzle counters (a problem there never breaks the quests or a game).
create or replace function private.quest_add(p_player uuid, p_day text, p_week text, p_delta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.quest_progress%rowtype;
  d jsonb;
  w jsonb;
  t jsonb;
  k text;
  v jsonb;
  n numeric;
begin
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return;
  end if;
  insert into public.quest_progress (player_id, day, week) values (p_player, p_day, p_week) on conflict (player_id) do nothing;
  select * into r from public.quest_progress where player_id = p_player for update;
  d := case when r.day = p_day then r.daily else '{}'::jsonb end;
  w := case when r.week = p_week then r.weekly else '{}'::jsonb end;
  t := r.total;
  for k, v in select key, value from jsonb_each(p_delta) loop
    if jsonb_typeof(v) <> 'number' or char_length(k) > 40 then
      continue;
    end if;
    n := floor((v #>> '{}')::numeric);
    if n <= 0 or n > 1000 then
      continue;
    end if;
    d := jsonb_set(d, array[k], to_jsonb(coalesce((d ->> k)::numeric, 0) + n));
    w := jsonb_set(w, array[k], to_jsonb(coalesce((w ->> k)::numeric, 0) + n));
    t := jsonb_set(t, array[k], to_jsonb(coalesce((t ->> k)::numeric, 0) + n));
  end loop;
  update public.quest_progress set day = p_day, week = p_week, daily = d, weekly = w, total = t, updated_at = now()
    where player_id = p_player;
  begin
    perform private.puzzle_add(p_player, p_day, p_week, p_delta);
  exception when others then
    null;
  end;
end;
$$;

-- Gives earned fragments in one step: the claim rows (unique per task and period), the new pieces (never one the
-- player has) and – when the puzzle becomes complete – the save with the reward (only if nobody saved in between).
-- 'paid', 'already' (a task was rewarded before) or 'conflict' (pieces or save changed meanwhile: compute again).
create or replace function private.puzzle_claim(p_player uuid, p_puzzle text, p_keys text[], p_pieces smallint[], p_total smallint,
  p_save jsonb, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur smallint[];
  done timestamptz;
  next smallint[];
begin
  if cardinality(p_keys) = 0 or cardinality(p_pieces) = 0 or p_total < 1 or p_total > 64 then
    raise exception 'bad_claim';
  end if;
  if exists (select 1 from unnest(p_pieces) as x where x < 0 or x >= p_total)
     or (select count(distinct x) from unnest(p_pieces) as x) <> cardinality(p_pieces) then
    raise exception 'bad_claim';
  end if;
  insert into public.puzzle_progress (player_id, puzzle_id) values (p_player, p_puzzle) on conflict do nothing;
  select pieces, completed_at into cur, done from public.puzzle_progress where player_id = p_player and puzzle_id = p_puzzle for update;
  if done is not null then
    return 'already';
  end if;
  if cur && p_pieces then
    raise exception 'piece_conflict';
  end if;
  insert into public.puzzle_claims (player_id, puzzle_id, key, pieces)
    select p_player, p_puzzle, k, p_pieces from unnest(p_keys) as k;
  next := cur || p_pieces;
  if cardinality(next) >= p_total and p_save is null then
    raise exception 'bad_claim';
  end if;
  update public.puzzle_progress
    set pieces = next, updated_at = now(), completed_at = case when cardinality(next) >= p_total then now() else null end
    where player_id = p_player and puzzle_id = p_puzzle;
  if p_save is not null then
    update public.player_saves set save = p_save, version = p_version + 1, updated_at = now()
      where player_id = p_player and version = p_version;
    if not found then
      raise exception 'save_conflict';
    end if;
  end if;
  return 'paid';
exception
  when unique_violation then
    return 'already';
  when raise_exception then
    if sqlerrm in ('save_conflict', 'piece_conflict') then
      return 'conflict';
    end if;
    raise;
end;
$$;

revoke all on function private.puzzle_add(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.puzzle_claim(uuid, text, text[], smallint[], smallint, jsonb, integer) from public, anon, authenticated;
grant execute on function private.puzzle_add(uuid, text, text, jsonb) to service_role;
grant execute on function private.puzzle_claim(uuid, text, text[], smallint[], smallint, jsonb, integer) to service_role;

create or replace function public.puzzle_claim(p_player uuid, p_puzzle text, p_keys text[], p_pieces smallint[], p_total smallint,
  p_save jsonb, p_version integer)
returns text language sql security invoker set search_path = ''
as $$ select private.puzzle_claim(p_player, p_puzzle, p_keys, p_pieces, p_total, p_save, p_version); $$;
revoke all on function public.puzzle_claim(uuid, text, text[], smallint[], smallint, jsonb, integer) from public, anon, authenticated;
grant execute on function public.puzzle_claim(uuid, text, text[], smallint[], smallint, jsonb, integer) to service_role;
