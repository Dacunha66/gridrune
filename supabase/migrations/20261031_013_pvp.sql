-- GridRune online duels (PvP). The server function "pvp" is the referee: it creates matches (invite code or
-- random opponent), applies every move with the game's rules and decides time-outs and absences.
-- pvp_matches holds the whole duel including both hands – only the server reads it (no policies).
-- pvp_views holds what each player may see (own side, opponent's hand hidden); every player reads only their
-- own rows, live through Realtime.
create table public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invite', 'random')),
  code text unique,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  player_a uuid not null references auth.users (id) on delete cascade,
  player_b uuid references auth.users (id) on delete cascade,
  name_a text,
  name_b text,
  seed text not null,
  hand_a jsonb not null,
  hand_b jsonb,
  rune_a text,
  rune_b text,
  arena_name text,
  state jsonb,
  turn_started_at timestamptz,
  seen_a timestamptz not null default now(),
  seen_b timestamptz,
  winner text check (winner in ('a', 'b', 'draw')),
  end_reason text check (end_reason in ('normal', 'absent', 'left')),
  coins integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.pvp_matches enable row level security;
create index pvp_matches_waiting_idx on public.pvp_matches (kind, created_at) where status = 'waiting';
create index pvp_matches_player_a_idx on public.pvp_matches (player_a, created_at desc);
create index pvp_matches_player_b_idx on public.pvp_matches (player_b, created_at desc);

create table public.pvp_views (
  match_id uuid not null references public.pvp_matches (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  view jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
alter table public.pvp_views enable row level security;
create policy "pvp_views: own rows" on public.pvp_views for select to authenticated using (player_id = (select auth.uid()));
create index pvp_views_player_idx on public.pvp_views (player_id, updated_at desc);
alter publication supabase_realtime add table public.pvp_views;

-- Sign of life while waiting or playing (every few seconds). Only marks the caller in their own match.
create or replace function public.pvp_ping(p_match uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pvp_matches set
    seen_a = case when player_a = (select auth.uid()) then now() else seen_a end,
    seen_b = case when player_b = (select auth.uid()) then now() else seen_b end
  where id = p_match and status in ('waiting', 'playing') and (select auth.uid()) in (player_a, player_b);
$$;
revoke all on function public.pvp_ping(uuid) from public, anon;
grant execute on function public.pvp_ping(uuid) to authenticated;

-- Ends a match exactly once and pays the winner's coins in the same step (server function only).
-- Returns false if the match was already over.
create or replace function private.pvp_finish(p_match uuid, p_state jsonb, p_winner text, p_reason text, p_pay uuid, p_coins integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pvp_matches
    set status = 'finished', state = coalesce(p_state, state), winner = p_winner, end_reason = p_reason, coins = p_coins,
        finished_at = now(), updated_at = now()
    where id = p_match and status = 'playing';
  if not found then
    return false;
  end if;
  if p_pay is not null and p_coins > 0 then
    update public.player_saves
      set save = jsonb_set(save, '{coins}', to_jsonb(coalesce((save ->> 'coins')::integer, 0) + p_coins)),
          version = version + 1, updated_at = now()
      where player_id = p_pay;
  end if;
  return true;
end;
$$;
revoke all on function private.pvp_finish(uuid, jsonb, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function private.pvp_finish(uuid, jsonb, text, text, uuid, integer) to service_role;

create or replace function public.pvp_finish(p_match uuid, p_state jsonb, p_winner text, p_reason text, p_pay uuid, p_coins integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.pvp_finish(p_match, p_state, p_winner, p_reason, p_pay, p_coins);
$$;
revoke all on function public.pvp_finish(uuid, jsonb, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.pvp_finish(uuid, jsonb, text, text, uuid, integer) to service_role;
