-- GridRune Weltboss-Raid. The raid itself (boss, phases, damage values, rewards) is an admin document in
-- content_docs (collection "raids"). These tables hold only what happens live: the boss's life points per
-- instance, every attack (with its frozen fight setup), each player's totals for the leaderboard and the rewards
-- already paid. Players may read; nobody but the server function "raid" (service role) writes.
-- Later clan raids: one more raid_state row per clan instance (scope), everything else stays the same.

alter table public.content_docs drop constraint content_docs_collection_check;
alter table public.content_docs add constraint content_docs_collection_check check (collection in (
  'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes', 'raids'
));

create table public.raid_state (
  id uuid primary key default gen_random_uuid(),
  raid_id text not null check (raid_id ~ '^raid[0-9]{2,4}$'),
  scope text not null default 'global' check (scope ~ '^(global|clan:[0-9a-f-]{36})$'),
  status text not null default 'active' check (status in ('active', 'paused', 'defeated', 'ended', 'archived')),
  config_version integer not null default 1,
  max_hp integer not null check (max_hp > 0),
  current_hp integer not null check (current_hp >= 0),
  participants integer not null default 0,
  attacks integer not null default 0,
  defeated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (raid_id, scope)
);
alter table public.raid_state enable row level security;
create policy "raid state: everyone reads" on public.raid_state for select to anon, authenticated using (true);

create table public.raid_attempts (
  id uuid primary key default gen_random_uuid(),
  instance uuid not null references public.raid_state (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  -- Day the attack counts for (UTC) and its number that day: one row per slot, so the daily limit holds
  -- even with parallel requests.
  day date not null,
  slot integer not null check (slot between 1 and 50),
  status text not null default 'started' check (status in ('started', 'finished', 'expired')),
  -- Seed, the player's cards and rune, and the frozen setup (phase, arena, boss deck, AI, damage values).
  ticket jsonb not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  outcome text check (outcome in ('win', 'draw', 'loss', 'expired')),
  fields integer,
  damage integer,
  applied_damage integer,
  unique (instance, player_id, day, slot)
);
-- At most one open fight per player and raid (it can be continued instead of starting another).
create unique index raid_attempts_one_open on public.raid_attempts (instance, player_id) where status = 'started';
create index raid_attempts_expiry on public.raid_attempts (instance, expires_at) where status = 'started';
create index raid_attempts_player on public.raid_attempts (player_id, instance, day);
alter table public.raid_attempts enable row level security;
create policy "raid attempts: own" on public.raid_attempts for select to authenticated using (player_id = (select auth.uid()));

create table public.raid_player_stats (
  instance uuid not null references public.raid_state (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  attacks integer not null default 0,
  total_damage bigint not null default 0,
  -- What really came off the boss (can be less than total_damage for the last hit).
  applied_damage bigint not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  best_damage integer not null default 0,
  last_damage_at timestamptz not null default now(),
  primary key (instance, player_id)
);
create index raid_player_stats_rank on public.raid_player_stats (instance, total_damage desc, last_damage_at);
alter table public.raid_player_stats enable row level security;
create policy "raid stats: signed-in players read" on public.raid_player_stats for select to authenticated using (true);

create table public.raid_reward_claims (
  instance uuid not null references public.raid_state (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  reward_key text not null,
  granted jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  primary key (instance, player_id, reward_key)
);
alter table public.raid_reward_claims enable row level security;
create policy "raid claims: own" on public.raid_reward_claims for select to authenticated using (player_id = (select auth.uid()));

-- Reserves one attack: the next free slot of the day. Returns the attempt id, or 'limit' / 'open' / 'closed'.
create or replace function private.raid_reserve(p_instance uuid, p_player uuid, p_day date, p_limit integer, p_ticket jsonb, p_expires timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_id uuid;
begin
  perform 1 from public.raid_state where id = p_instance and status = 'active' and current_hp > 0;
  if not found then
    return 'closed';
  end if;
  if exists (select 1 from public.raid_attempts where instance = p_instance and player_id = p_player and status = 'started') then
    return 'open';
  end if;
  select count(*) into v_used from public.raid_attempts where instance = p_instance and player_id = p_player and day = p_day;
  if v_used >= p_limit then
    return 'limit';
  end if;
  insert into public.raid_attempts (instance, player_id, day, slot, ticket, expires_at)
    values (p_instance, p_player, p_day, v_used + 1, p_ticket, p_expires)
    returning id into v_id;
  return v_id::text;
exception
  -- A parallel request took the same slot (or opened a fight) a moment earlier.
  when unique_violation then
    return 'busy';
end;
$$;

-- Finishes an attack once: stores the result, takes the damage off the boss (never below 0) and updates the
-- player's totals – all in one step. A second call for the same attack changes nothing.
create or replace function private.raid_finish(p_attempt uuid, p_player uuid, p_outcome text, p_fields integer, p_damage integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instance uuid;
  v_old integer;
  v_new integer;
  v_applied integer;
  v_new_player boolean;
  v_stats public.raid_player_stats;
begin
  select instance into v_instance from public.raid_attempts where id = p_attempt and player_id = p_player and status = 'started' for update;
  if not found then
    return jsonb_build_object('already', true);
  end if;
  select current_hp into v_old from public.raid_state where id = v_instance for update;
  v_new := greatest(0, v_old - greatest(0, p_damage));
  v_applied := v_old - v_new;
  update public.raid_attempts
    set status = case when p_outcome = 'expired' then 'expired' else 'finished' end, outcome = p_outcome, fields = p_fields,
        damage = greatest(0, p_damage), applied_damage = v_applied, finished_at = now()
    where id = p_attempt;
  v_new_player := not exists (select 1 from public.raid_player_stats where instance = v_instance and player_id = p_player);
  insert into public.raid_player_stats as s (instance, player_id, attacks, total_damage, applied_damage, wins, draws, losses, best_damage, last_damage_at)
    values (v_instance, p_player, 1, greatest(0, p_damage), v_applied, (p_outcome = 'win')::int, (p_outcome = 'draw')::int,
            (p_outcome in ('loss', 'expired'))::int, greatest(0, p_damage), now())
    on conflict (instance, player_id) do update set
      attacks = s.attacks + 1, total_damage = s.total_damage + excluded.total_damage, applied_damage = s.applied_damage + excluded.applied_damage,
      wins = s.wins + excluded.wins, draws = s.draws + excluded.draws, losses = s.losses + excluded.losses,
      best_damage = greatest(s.best_damage, excluded.best_damage), last_damage_at = now()
    returning * into v_stats;
  update public.raid_state
    set current_hp = v_new, attacks = attacks + 1, participants = participants + v_new_player::int,
        status = case when v_new = 0 and status = 'active' then 'defeated' else status end,
        defeated_at = case when v_new = 0 and defeated_at is null then now() else defeated_at end, updated_at = now()
    where id = v_instance;
  return jsonb_build_object('already', false, 'damage', greatest(0, p_damage), 'applied', v_applied, 'current_hp', v_new,
    'total_damage', v_stats.total_damage, 'attacks', v_stats.attacks);
end;
$$;

-- Pays raid rewards once: the claim rows and the new save are written together. Returns 'paid', 'already'
-- (a reward was claimed before – nothing is paid twice) or 'conflict' (the save changed – read it again, retry).
create or replace function private.raid_claim(p_instance uuid, p_player uuid, p_keys text[], p_granted jsonb, p_save jsonb, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.raid_reward_claims (instance, player_id, reward_key, granted)
    select p_instance, p_player, k, coalesce(p_granted -> k, '{}'::jsonb) from unnest(p_keys) as k;
  update public.player_saves set save = p_save, version = p_version + 1, updated_at = now()
    where player_id = p_player and version = p_version;
  if not found then
    raise exception 'save_conflict';
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

revoke all on function private.raid_reserve(uuid, uuid, date, integer, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.raid_finish(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function private.raid_claim(uuid, uuid, text[], jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function private.raid_reserve(uuid, uuid, date, integer, jsonb, timestamptz) to service_role;
grant execute on function private.raid_finish(uuid, uuid, text, integer, integer) to service_role;
grant execute on function private.raid_claim(uuid, uuid, text[], jsonb, jsonb, integer) to service_role;

-- Reachable for the service role through the API (thin wrappers, service-role only).
create or replace function public.raid_reserve(p_instance uuid, p_player uuid, p_day date, p_limit integer, p_ticket jsonb, p_expires timestamptz)
returns text language sql security invoker set search_path = ''
as $$ select private.raid_reserve(p_instance, p_player, p_day, p_limit, p_ticket, p_expires); $$;
create or replace function public.raid_finish(p_attempt uuid, p_player uuid, p_outcome text, p_fields integer, p_damage integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.raid_finish(p_attempt, p_player, p_outcome, p_fields, p_damage); $$;
create or replace function public.raid_claim(p_instance uuid, p_player uuid, p_keys text[], p_granted jsonb, p_save jsonb, p_version integer)
returns text language sql security invoker set search_path = ''
as $$ select private.raid_claim(p_instance, p_player, p_keys, p_granted, p_save, p_version); $$;
revoke all on function public.raid_reserve(uuid, uuid, date, integer, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.raid_finish(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.raid_claim(uuid, uuid, text[], jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.raid_reserve(uuid, uuid, date, integer, jsonb, timestamptz) to service_role;
grant execute on function public.raid_finish(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.raid_claim(uuid, uuid, text[], jsonb, jsonb, integer) to service_role;
