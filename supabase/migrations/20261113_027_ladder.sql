-- Ranglisten-Ligen: the state of every player in the current season (step, win points, safepoints – see
-- src/game/ladder.ts), written only by the server functions. Every checked result is applied exactly once (ladder_refs:
-- one row per league ticket / online match / season change), and every Postfach gift (promotion, season end) is sent
-- once per key (ladder_gifts).
create table public.ladder (
  player_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ladder enable row level security;
create policy "ladder: own read" on public.ladder for select to authenticated using (player_id = (select auth.uid()));

create table public.ladder_refs (
  player_id uuid not null references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) between 1 and 80),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, ref)
);
alter table public.ladder_refs enable row level security;

create table public.ladder_gifts (
  player_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);
alter table public.ladder_gifts enable row level security;

alter table public.inbox_items drop constraint if exists inbox_items_sender_check;
alter table public.inbox_items add constraint inbox_items_sender_check check (sender in ('raid', 'admin', 'event', 'ladder'));

/**
 * Writes the new state for one result. 'ok' / 'already' (this ref was applied before) / 'conflict' (the state changed
 * meanwhile – read again and retry). p_gifts: [{key, title, message, reward}], each sent to the Postfach only once.
 */
create or replace function private.ladder_write(p_player uuid, p_ref text, p_version integer, p_state jsonb, p_gifts jsonb, p_result jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  cur public.ladder%rowtype;
  g jsonb;
begin
  insert into public.ladder (player_id) values (p_player) on conflict do nothing;
  select * into cur from public.ladder where player_id = p_player for update;
  if exists (select 1 from public.ladder_refs where player_id = p_player and ref = p_ref) then return 'already'; end if;
  if cur.version <> p_version then return 'conflict'; end if;
  update public.ladder set state = p_state, version = cur.version + 1, updated_at = now() where player_id = p_player;
  insert into public.ladder_refs (player_id, ref, result) values (p_player, p_ref, p_result);
  for g in select * from jsonb_array_elements(coalesce(p_gifts, '[]'::jsonb)) loop
    if jsonb_typeof(g->'reward') = 'object' and coalesce(g->>'key', '') <> '' then
      insert into public.ladder_gifts (player_id, key) values (p_player, left(g->>'key', 80)) on conflict do nothing;
      if found then
        insert into public.inbox_items (player_id, sender, title, message, reward)
          values (p_player, 'ladder', left(coalesce(g->>'title', 'Rangliste'), 80), left(coalesce(g->>'message', ''), 200), g->'reward');
      end if;
    end if;
  end loop;
  return 'ok';
end;
$$;
revoke all on function private.ladder_write(uuid, text, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.ladder_write(uuid, text, integer, jsonb, jsonb, jsonb) to service_role;

create or replace function public.ladder_write(p_player uuid, p_ref text, p_version integer, p_state jsonb, p_gifts jsonb, p_result jsonb)
returns text language sql security invoker set search_path = '' as $$ select private.ladder_write(p_player, p_ref, p_version, p_state, p_gifts, p_result); $$;
revoke all on function public.ladder_write(uuid, text, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ladder_write(uuid, text, integer, jsonb, jsonb, jsonb) to service_role;
