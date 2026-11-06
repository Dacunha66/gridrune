-- GridRune Erfolge: daily quests, weekly quests and lasting achievements. Which quests exist is an admin document
-- (content_docs quests/config). These tables hold each player's counters (only ever raised by the server functions
-- after a result they checked themselves), the rewards already collected (one row per reward, so nothing is paid
-- twice) and the player's titles. Players may read their own rows; nobody but the server (service role) writes.

alter table public.content_docs drop constraint content_docs_collection_check;
alter table public.content_docs add constraint content_docs_collection_check check (collection in (
  'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes', 'raids', 'quests'
));

create table public.quest_progress (
  player_id uuid primary key references auth.users (id) on delete cascade,
  -- Day (Berlin, YYYY-MM-DD) and ISO week the daily / weekly counters belong to.
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  daily jsonb not null default '{}'::jsonb check (jsonb_typeof(daily) = 'object'),
  weekly jsonb not null default '{}'::jsonb check (jsonb_typeof(weekly) = 'object'),
  total jsonb not null default '{}'::jsonb check (jsonb_typeof(total) = 'object'),
  titles jsonb not null default '{"owned": [], "equipped": null}'::jsonb check (jsonb_typeof(titles) = 'object' and pg_column_size(titles) <= 8000),
  updated_at timestamptz not null default now()
);
alter table public.quest_progress enable row level security;
create policy "quest progress: own row" on public.quest_progress for select to authenticated using ((select auth.uid()) = player_id);

create table public.quest_claims (
  player_id uuid not null references auth.users (id) on delete cascade,
  -- d:<day>:<quest>, w:<week>:<quest>, a:<achievement>, d:<day>:bonus, w:<week>:bonus
  key text not null check (char_length(key) between 3 and 80),
  granted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);
alter table public.quest_claims enable row level security;
create policy "quest claims: own rows" on public.quest_claims for select to authenticated using ((select auth.uid()) = player_id);

-- Titles shown in online duels.
alter table public.pvp_matches add column title_a text check (char_length(title_a) <= 24);
alter table public.pvp_matches add column title_b text check (char_length(title_b) <= 24);

-- Adds counters (numbers > 0 only) for the given day and week; counters of an older day/week start again at 0.
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
end;
$$;

-- Pays collected rewards: the claim rows (unique per key), the new save (only if nobody saved in between) and the
-- titles, all in one step. 'paid', 'already' (a key was collected before) or 'conflict' (the save changed).
create or replace function private.quest_claim(p_player uuid, p_keys text[], p_granted jsonb, p_save jsonb, p_version integer, p_titles jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.quest_claims (player_id, key, granted)
    select p_player, k, coalesce(p_granted -> k, '{}'::jsonb) from unnest(p_keys) as k;
  update public.player_saves set save = p_save, version = p_version + 1, updated_at = now()
    where player_id = p_player and version = p_version;
  if not found then
    raise exception 'save_conflict';
  end if;
  if p_titles is not null then
    insert into public.quest_progress (player_id, day, week, titles) values (p_player, '2000-01-01', '2000-W01', p_titles)
      on conflict (player_id) do update set titles = excluded.titles, updated_at = now();
  end if;
  return 'paid';
exception
  when unique_violation then
    return 'already';
  when raise_exception then
    if sqlerrm = 'save_conflict' then
      return 'conflict';
    end if;
    raise;
end;
$$;

revoke all on function private.quest_add(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.quest_claim(uuid, text[], jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function private.quest_add(uuid, text, text, jsonb) to service_role;
grant execute on function private.quest_claim(uuid, text[], jsonb, jsonb, integer, jsonb) to service_role;

create or replace function public.quest_add(p_player uuid, p_day text, p_week text, p_delta jsonb)
returns void language sql security invoker set search_path = ''
as $$ select private.quest_add(p_player, p_day, p_week, p_delta); $$;
create or replace function public.quest_claim(p_player uuid, p_keys text[], p_granted jsonb, p_save jsonb, p_version integer, p_titles jsonb)
returns text language sql security invoker set search_path = ''
as $$ select private.quest_claim(p_player, p_keys, p_granted, p_save, p_version, p_titles); $$;
revoke all on function public.quest_add(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.quest_claim(uuid, text[], jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.quest_add(uuid, text, text, jsonb) to service_role;
grant execute on function public.quest_claim(uuid, text[], jsonb, jsonb, integer, jsonb) to service_role;
