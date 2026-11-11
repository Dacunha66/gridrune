-- Community: clans (found for 500 coins, open / on request / closed, leader – officers – members, at most 30),
-- clan points from checked wins (10 per win, weekly and in total), a global chat and one chat per clan.
-- Players read with RLS (chat history and live updates through Realtime); every change goes through the server
-- function "community" (service role): word filter, rate limit, mutes, membership and roles are checked there and
-- in the functions below (one transaction each, rows locked).

-- ---------- Clans ----------
create table public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 20),
  tag text not null check (tag ~ '^[A-Z0-9ÄÖÜ]{2,4}$'),
  emblem text not null default 'av01' check (emblem ~ '^av\d{2,4}$'),
  description text not null default '' check (char_length(description) <= 160),
  join_mode text not null default 'open' check (join_mode in ('open', 'request', 'closed')),
  members integer not null default 1 check (members between 0 and 30),
  week text not null default '' check (week = '' or week ~ '^\d{4}-W\d{2}$'),
  week_points integer not null default 0 check (week_points >= 0),
  total_points bigint not null default 0 check (total_points >= 0),
  created_at timestamptz not null default now()
);
create unique index clans_name_key on public.clans (lower(name));
create unique index clans_tag_key on public.clans (upper(tag));
alter table public.clans enable row level security;
create policy "clans: signed-in players read" on public.clans for select to authenticated using (true);

create table public.clan_members (
  player_id uuid primary key references auth.users (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'officer', 'member')),
  week text not null default '' check (week = '' or week ~ '^\d{4}-W\d{2}$'),
  week_points integer not null default 0 check (week_points >= 0),
  total_points bigint not null default 0 check (total_points >= 0),
  joined_at timestamptz not null default now()
);
create index clan_members_clan on public.clan_members (clan_id);
alter table public.clan_members enable row level security;
create policy "clan members: signed-in players read" on public.clan_members for select to authenticated using (true);

create table public.clan_requests (
  clan_id uuid not null references public.clans (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clan_id, player_id)
);
alter table public.clan_requests enable row level security;
create policy "clan requests: own or officers read" on public.clan_requests for select to authenticated using (
  player_id = (select auth.uid())
  or exists (select 1 from public.clan_members m where m.player_id = (select auth.uid()) and m.clan_id = clan_requests.clan_id and m.role in ('leader', 'officer'))
);

-- ---------- Chat ----------
-- channel: 'global' or 'clan:<clan id>'. Name, avatar and clan tag are copied when the message is written.
create table public.chat_messages (
  id bigint generated always as identity primary key,
  channel text not null check (channel = 'global' or channel ~ '^clan:[0-9a-f-]{36}$'),
  player_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  avatar text not null default 'av01',
  clan_tag text not null default '',
  body text not null check (char_length(body) between 1 and 200),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_channel on public.chat_messages (channel, id desc);
create index chat_messages_created on public.chat_messages (created_at);
alter table public.chat_messages enable row level security;
create policy "chat: global for signed-in players, clan chat for members" on public.chat_messages for select to authenticated using (
  not deleted and (
    channel = 'global'
    or exists (select 1 from public.clan_members m where m.player_id = (select auth.uid()) and channel = 'clan:' || m.clan_id::text)
  )
);
alter publication supabase_realtime add table public.chat_messages;

create table public.chat_reports (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  reporter uuid not null references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 100),
  handled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, reporter)
);
alter table public.chat_reports enable row level security;

-- Players hide other players' messages (only their own list, managed by themselves).
create table public.chat_blocks (
  player_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, blocked_id),
  check (player_id <> blocked_id)
);
alter table public.chat_blocks enable row level security;
create policy "blocks: own read" on public.chat_blocks for select to authenticated using (player_id = (select auth.uid()));
create policy "blocks: own add" on public.chat_blocks for insert to authenticated with check (player_id = (select auth.uid()));
create policy "blocks: own remove" on public.chat_blocks for delete to authenticated using (player_id = (select auth.uid()));

-- Chat rules accepted, mutes (admin) and the time of the last message (rate limit).
create table public.community_players (
  player_id uuid primary key references auth.users (id) on delete cascade,
  rules_at timestamptz,
  muted_until timestamptz,
  mute_reason text not null default '' check (char_length(mute_reason) <= 100),
  last_message_at timestamptz
);
alter table public.community_players enable row level security;
create policy "community: own row read" on public.community_players for select to authenticated using (player_id = (select auth.uid()));

-- ---------- Functions (service role only) ----------

/** Founds a clan: takes the coins from the save (version-checked), creates the clan with the founder as leader. */
create or replace function private.clan_create(p_player uuid, p_name text, p_tag text, p_emblem text, p_description text, p_mode text, p_cost integer, p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  coins integer;
  new_id uuid;
begin
  if exists (select 1 from public.clan_members where player_id = p_player) then return jsonb_build_object('error', 'in_clan'); end if;
  select coalesce((save->>'coins')::integer, 0) into coins from public.player_saves where player_id = p_player and version = p_version for update;
  if not found then return jsonb_build_object('error', 'conflict'); end if;
  if coins < p_cost then return jsonb_build_object('error', 'coins'); end if;
  if exists (select 1 from public.clans where lower(name) = lower(p_name)) then return jsonb_build_object('error', 'name_taken'); end if;
  if exists (select 1 from public.clans where upper(tag) = upper(p_tag)) then return jsonb_build_object('error', 'tag_taken'); end if;
  insert into public.clans (name, tag, emblem, description, join_mode) values (p_name, upper(p_tag), p_emblem, p_description, p_mode) returning id into new_id;
  insert into public.clan_members (player_id, clan_id, role) values (p_player, new_id, 'leader');
  delete from public.clan_requests where player_id = p_player;
  update public.player_saves set save = jsonb_set(save, '{coins}', to_jsonb(coins - p_cost)), version = version + 1, updated_at = now()
    where player_id = p_player;
  return jsonb_build_object('ok', true, 'clan', new_id, 'version', p_version + 1);
exception when unique_violation then
  return jsonb_build_object('error', 'taken');
end;
$$;

/** Joins an open clan (or asks to join one "on request"). */
create or replace function private.clan_join(p_player uuid, p_clan uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c public.clans;
begin
  if exists (select 1 from public.clan_members where player_id = p_player) then return 'in_clan'; end if;
  select * into c from public.clans where id = p_clan for update;
  if not found then return 'unknown'; end if;
  if c.join_mode = 'closed' then return 'closed'; end if;
  if c.members >= 30 then return 'full'; end if;
  if c.join_mode = 'request' then
    insert into public.clan_requests (clan_id, player_id) values (p_clan, p_player) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.clan_members (player_id, clan_id) values (p_player, p_clan);
  update public.clans set members = members + 1 where id = p_clan;
  delete from public.clan_requests where player_id = p_player;
  return 'joined';
exception when unique_violation then
  return 'in_clan';
end;
$$;

/** An officer or the leader accepts a request (or declines it with p_accept = false). */
create or replace function private.clan_answer(p_actor uuid, p_player uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me public.clan_members;
  c public.clans;
begin
  select * into me from public.clan_members where player_id = p_actor;
  if not found or me.role not in ('leader', 'officer') then return 'forbidden'; end if;
  select * into c from public.clans where id = me.clan_id for update;
  if not exists (select 1 from public.clan_requests where clan_id = c.id and player_id = p_player) then return 'unknown'; end if;
  delete from public.clan_requests where clan_id = c.id and player_id = p_player;
  if not p_accept then return 'declined'; end if;
  if exists (select 1 from public.clan_members where player_id = p_player) then return 'in_clan'; end if;
  if c.members >= 30 then return 'full'; end if;
  insert into public.clan_members (player_id, clan_id) values (p_player, c.id);
  update public.clans set members = members + 1 where id = c.id;
  delete from public.clan_requests where player_id = p_player;
  return 'joined';
end;
$$;

/**
 * Leaves the clan (p_target = p_actor) or removes a member (leader: anyone; officer: members only). A leader who
 * leaves hands over to the longest officer, else the longest member; the last one out dissolves the clan.
 */
create or replace function private.clan_remove(p_actor uuid, p_target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me public.clan_members;
  them public.clan_members;
  next_leader uuid;
begin
  select * into me from public.clan_members where player_id = p_actor;
  if not found then return 'no_clan'; end if;
  perform 1 from public.clans where id = me.clan_id for update;
  select * into them from public.clan_members where player_id = p_target and clan_id = me.clan_id;
  if not found then return 'unknown'; end if;
  if p_actor <> p_target and not (me.role = 'leader' or (me.role = 'officer' and them.role = 'member')) then return 'forbidden'; end if;
  delete from public.clan_members where player_id = p_target;
  update public.clans set members = members - 1 where id = me.clan_id;
  if them.role = 'leader' then
    select player_id into next_leader from public.clan_members where clan_id = me.clan_id
      order by (role = 'officer') desc, joined_at limit 1;
    if next_leader is null then
      delete from public.clans where id = me.clan_id;
      return 'dissolved';
    end if;
    update public.clan_members set role = 'leader' where player_id = next_leader;
  end if;
  return 'removed';
end;
$$;

/** Leader only: makes a member officer / member, or hands the lead over (the old leader becomes officer). */
create or replace function private.clan_role(p_actor uuid, p_target uuid, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me public.clan_members;
begin
  if p_role not in ('leader', 'officer', 'member') or p_actor = p_target then return 'bad'; end if;
  select * into me from public.clan_members where player_id = p_actor;
  if not found or me.role <> 'leader' then return 'forbidden'; end if;
  perform 1 from public.clans where id = me.clan_id for update;
  if not exists (select 1 from public.clan_members where player_id = p_target and clan_id = me.clan_id) then return 'unknown'; end if;
  update public.clan_members set role = p_role where player_id = p_target;
  if p_role = 'leader' then update public.clan_members set role = 'officer' where player_id = p_actor; end if;
  return 'ok';
end;
$$;

/** Writes a chat message: rules accepted, not muted, at most one message every 3 seconds; clan chat for members. */
create or replace function private.chat_send(p_player uuid, p_channel text, p_body text, p_name text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cp public.community_players;
  tag text := '';
  new_id bigint;
begin
  select * into cp from public.community_players where player_id = p_player for update;
  if not found or cp.rules_at is null then return jsonb_build_object('error', 'rules'); end if;
  if cp.muted_until is not null and cp.muted_until > now() then return jsonb_build_object('error', 'muted', 'until', cp.muted_until); end if;
  if cp.last_message_at is not null and cp.last_message_at > now() - interval '3 seconds' then return jsonb_build_object('error', 'slow'); end if;
  select c.tag into tag from public.clan_members m join public.clans c on c.id = m.clan_id where m.player_id = p_player;
  if p_channel <> 'global' and not exists (select 1 from public.clan_members where player_id = p_player and 'clan:' || clan_id::text = p_channel) then
    return jsonb_build_object('error', 'not_member');
  end if;
  insert into public.chat_messages (channel, player_id, name, avatar, clan_tag, body) values (p_channel, p_player, p_name, p_avatar, coalesce(tag, ''), p_body)
    returning id into new_id;
  update public.community_players set last_message_at = now() where player_id = p_player;
  -- Messages are kept 30 days.
  delete from public.chat_messages where id in (select id from public.chat_messages where created_at < now() - interval '30 days' limit 200);
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

/** Clan points: every checked win counted by quest_add gives the member and the clan 10 points (this week and in total). */
create or replace function private.clan_points() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  delta integer := coalesce((new.total->>'wins')::integer, 0) - coalesce((case when tg_op = 'UPDATE' then old.total->>'wins' end)::integer, 0);
  pts integer;
  cid uuid;
begin
  if delta <= 0 then return new; end if;
  pts := delta * 10;
  update public.clan_members set
    week_points = case when week = new.week then week_points + pts else pts end, week = new.week, total_points = total_points + pts
    where player_id = new.player_id returning clan_id into cid;
  if cid is not null then
    update public.clans set
      week_points = case when week = new.week then week_points + pts else pts end, week = new.week, total_points = total_points + pts
      where id = cid;
  end if;
  return new;
end;
$$;
create trigger quest_progress_clan_points after insert or update of total on public.quest_progress
  for each row execute function private.clan_points();

revoke all on function private.clan_create(uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.clan_join(uuid, uuid) from public, anon, authenticated;
revoke all on function private.clan_answer(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.clan_remove(uuid, uuid) from public, anon, authenticated;
revoke all on function private.clan_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.chat_send(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.clan_points() from public, anon, authenticated;
grant execute on function private.clan_create(uuid, text, text, text, text, text, integer, integer) to service_role;
grant execute on function private.clan_join(uuid, uuid) to service_role;
grant execute on function private.clan_answer(uuid, uuid, boolean) to service_role;
grant execute on function private.clan_remove(uuid, uuid) to service_role;
grant execute on function private.clan_role(uuid, uuid, text) to service_role;
grant execute on function private.chat_send(uuid, text, text, text, text) to service_role;

-- Public wrappers for the server function (service role only).
create or replace function public.clan_create(p_player uuid, p_name text, p_tag text, p_emblem text, p_description text, p_mode text, p_cost integer, p_version integer)
returns jsonb language sql security invoker set search_path = '' as $$ select private.clan_create(p_player, p_name, p_tag, p_emblem, p_description, p_mode, p_cost, p_version); $$;
create or replace function public.clan_join(p_player uuid, p_clan uuid)
returns text language sql security invoker set search_path = '' as $$ select private.clan_join(p_player, p_clan); $$;
create or replace function public.clan_answer(p_actor uuid, p_player uuid, p_accept boolean)
returns text language sql security invoker set search_path = '' as $$ select private.clan_answer(p_actor, p_player, p_accept); $$;
create or replace function public.clan_remove(p_actor uuid, p_target uuid)
returns text language sql security invoker set search_path = '' as $$ select private.clan_remove(p_actor, p_target); $$;
create or replace function public.clan_role(p_actor uuid, p_target uuid, p_role text)
returns text language sql security invoker set search_path = '' as $$ select private.clan_role(p_actor, p_target, p_role); $$;
create or replace function public.chat_send(p_player uuid, p_channel text, p_body text, p_name text, p_avatar text)
returns jsonb language sql security invoker set search_path = '' as $$ select private.chat_send(p_player, p_channel, p_body, p_name, p_avatar); $$;
revoke all on function public.clan_create(uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.clan_join(uuid, uuid) from public, anon, authenticated;
revoke all on function public.clan_answer(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.clan_remove(uuid, uuid) from public, anon, authenticated;
revoke all on function public.clan_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.chat_send(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.clan_create(uuid, text, text, text, text, text, integer, integer) to service_role;
grant execute on function public.clan_join(uuid, uuid) to service_role;
grant execute on function public.clan_answer(uuid, uuid, boolean) to service_role;
grant execute on function public.clan_remove(uuid, uuid) to service_role;
grant execute on function public.clan_role(uuid, uuid, text) to service_role;
grant execute on function public.chat_send(uuid, text, text, text, text) to service_role;
