-- Postfach: rewards wait here until the player collects them (30 days). Raid rewards (milestones, community goals,
-- boss defeated) and gifts from the admin. Collecting pays them into the save in one step (version-checked), once.
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  sender text not null check (sender in ('raid', 'admin')),
  title text not null check (char_length(title) between 1 and 80),
  message text not null default '' check (char_length(message) <= 200),
  reward jsonb not null check (jsonb_typeof(reward) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_at timestamptz,
  result jsonb
);
create index inbox_items_player on public.inbox_items (player_id, created_at desc);
alter table public.inbox_items enable row level security;
create policy "inbox: own read" on public.inbox_items for select to authenticated using (player_id = (select auth.uid()));

/** Raid rewards earned and not given yet go into the Postfach (each reward key once per player and raid). */
create or replace function private.raid_to_inbox(p_instance uuid, p_player uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  n integer := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.raid_reward_claims (instance, player_id, reward_key, granted)
      values (p_instance, p_player, it->>'key', '{"inbox": true}'::jsonb)
      on conflict do nothing;
    if found then
      insert into public.inbox_items (player_id, sender, title, reward) values (p_player, 'raid', left(it->>'title', 80), it->'reward');
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

/** Collects items: marks them collected and writes the new save (version-checked) together. 'paid' / 'already' / 'conflict'. */
create or replace function private.inbox_claim(p_player uuid, p_ids uuid[], p_results jsonb, p_save jsonb, p_version integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  open_count integer;
begin
  if cardinality(p_ids) = 0 then return 'already'; end if;
  select count(*) into open_count from (
    select id from public.inbox_items where id = any(p_ids) and player_id = p_player and claimed_at is null and expires_at > now() for update
  ) as locked;
  if open_count <> cardinality(p_ids) then return 'already'; end if;
  update public.inbox_items set claimed_at = now(), result = p_results -> id::text where id = any(p_ids);
  update public.player_saves set save = p_save, version = p_version + 1, updated_at = now() where player_id = p_player and version = p_version;
  if not found then raise exception 'save_conflict'; end if;
  return 'paid';
exception when raise_exception then
  if sqlerrm = 'save_conflict' then return 'conflict'; end if;
  raise;
end;
$$;

/** Admin gift: one item for every player (p_players null) or for the given players. Returns how many were sent. */
create or replace function private.inbox_send(p_players uuid[], p_title text, p_message text, p_reward jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.inbox_items (player_id, sender, title, message, reward)
    select s.player_id, 'admin', p_title, p_message, p_reward from public.player_saves s
    where p_players is null or s.player_id = any(p_players);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.raid_to_inbox(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.inbox_claim(uuid, uuid[], jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function private.inbox_send(uuid[], text, text, jsonb) from public, anon, authenticated;
grant execute on function private.raid_to_inbox(uuid, uuid, jsonb) to service_role;
grant execute on function private.inbox_claim(uuid, uuid[], jsonb, jsonb, integer) to service_role;
grant execute on function private.inbox_send(uuid[], text, text, jsonb) to service_role;

create or replace function public.raid_to_inbox(p_instance uuid, p_player uuid, p_items jsonb)
returns integer language sql security invoker set search_path = '' as $$ select private.raid_to_inbox(p_instance, p_player, p_items); $$;
create or replace function public.inbox_claim(p_player uuid, p_ids uuid[], p_results jsonb, p_save jsonb, p_version integer)
returns text language sql security invoker set search_path = '' as $$ select private.inbox_claim(p_player, p_ids, p_results, p_save, p_version); $$;
create or replace function public.inbox_send(p_players uuid[], p_title text, p_message text, p_reward jsonb)
returns integer language sql security invoker set search_path = '' as $$ select private.inbox_send(p_players, p_title, p_message, p_reward); $$;
revoke all on function public.raid_to_inbox(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.inbox_claim(uuid, uuid[], jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.inbox_send(uuid[], text, text, jsonb) from public, anon, authenticated;
grant execute on function public.raid_to_inbox(uuid, uuid, jsonb) to service_role;
grant execute on function public.inbox_claim(uuid, uuid[], jsonb, jsonb, integer) to service_role;
grant execute on function public.inbox_send(uuid[], text, text, jsonb) to service_role;
