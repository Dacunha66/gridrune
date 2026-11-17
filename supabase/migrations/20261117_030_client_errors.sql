-- Fehlersammlung: errors in the players' game (crashes, failed scripts) are reported here, so the admin sees them in the
-- admin area (Statistik). Only through report_client_error (texts cut to length, the same error of the same player
-- within 10 minutes only counted up, at most 300 new reports an hour in total, older than 30 days removed). Players
-- cannot read anything; the admin can read and delete.
create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  player_id uuid references auth.users (id) on delete set null,
  kind text not null check (char_length(kind) <= 20),
  message text not null check (char_length(message) <= 300),
  stack text not null default '' check (char_length(stack) <= 2000),
  place text not null default '' check (char_length(place) <= 200),
  version text not null default '' check (char_length(version) <= 60),
  device text not null default '' check (char_length(device) <= 200),
  count integer not null default 1
);
create index client_errors_last on public.client_errors (last_at desc);
alter table public.client_errors enable row level security;
create policy "client errors: admin read" on public.client_errors for select to authenticated using ((select private.is_admin()));
create policy "client errors: admin delete" on public.client_errors for delete to authenticated using ((select private.is_admin()));

-- Callable by every visitor (also guests) on purpose: a crash before signing in should be seen too.
create or replace function public.report_client_error(p_kind text, p_message text, p_stack text, p_place text, p_version text, p_device text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  msg text := left(coalesce(p_message, ''), 300);
begin
  if msg = '' then return; end if;
  update public.client_errors set count = count + 1, last_at = now()
    where message = msg and player_id is not distinct from me and last_at > now() - interval '10 minutes';
  if found then return; end if;
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 300 then return; end if;
  insert into public.client_errors (player_id, kind, message, stack, place, version, device)
    values (me, left(coalesce(p_kind, 'error'), 20), msg, left(coalesce(p_stack, ''), 2000), left(coalesce(p_place, ''), 200),
            left(coalesce(p_version, ''), 60), left(coalesce(p_device, ''), 200));
  delete from public.client_errors where id in (select id from public.client_errors where last_at < now() - interval '30 days' limit 100);
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
