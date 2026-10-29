-- GridRune accounts: every new account gets its player profile automatically (name from the sign-up form).
-- Names: 2–20 characters, letters (umlauts too), digits, space, - and _ (same rule as the game).
alter table public.profiles add constraint profiles_display_name_chars
  check (display_name ~ '^[[:alnum:]][[:alnum:] _-]*$');

create or replace function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  -- An invalid or missing name never blocks the sign-up: the player gets "Spieler" and can rename later.
  if char_length(wanted) not between 2 and 20 or wanted !~ '^[[:alnum:]][[:alnum:] _-]*$' then
    wanted := 'Spieler';
  end if;
  insert into public.profiles (id, display_name) values (new.id, wanted) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile();

-- Players only read their own profile for now (names of others become visible with the online league).
drop policy "profiles: signed-in players read" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
