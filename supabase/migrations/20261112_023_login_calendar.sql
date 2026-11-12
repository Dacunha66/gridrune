-- Login-Kalender: how many days a player has collected (all time) and the last day (Berlin). The day's field is
-- claimed % 7. Collecting writes the new count and the new save (version-checked) in one step, at most once a day.
create table public.login_calendar (
  player_id uuid primary key references auth.users (id) on delete cascade,
  claimed integer not null default 0 check (claimed >= 0),
  last_day date,
  updated_at timestamptz not null default now()
);
alter table public.login_calendar enable row level security;
create policy "login calendar: own read" on public.login_calendar for select to authenticated using (player_id = (select auth.uid()));

/** 'paid' / 'already' (collected today or counted meanwhile) / 'conflict' (the save changed). */
create or replace function private.login_claim(p_player uuid, p_day date, p_before integer, p_save jsonb, p_version integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  cur public.login_calendar%rowtype;
begin
  insert into public.login_calendar (player_id) values (p_player) on conflict do nothing;
  select * into cur from public.login_calendar where player_id = p_player for update;
  if cur.last_day is not distinct from p_day or cur.claimed <> p_before then return 'already'; end if;
  update public.player_saves set save = p_save, version = p_version + 1, updated_at = now() where player_id = p_player and version = p_version;
  if not found then return 'conflict'; end if;
  update public.login_calendar set claimed = p_before + 1, last_day = p_day, updated_at = now() where player_id = p_player;
  return 'paid';
end;
$$;

revoke all on function private.login_claim(uuid, date, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function private.login_claim(uuid, date, integer, jsonb, integer) to service_role;

create or replace function public.login_claim(p_player uuid, p_day date, p_before integer, p_save jsonb, p_version integer)
returns text language sql security invoker set search_path = '' as $$ select private.login_claim(p_player, p_day, p_before, p_save, p_version); $$;
revoke all on function public.login_claim(uuid, date, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.login_claim(uuid, date, integer, jsonb, integer) to service_role;
