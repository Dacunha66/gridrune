-- GridRune: every player name exists only once (upper/lower case counts as the same name), so players can
-- sign in with their name. The e-mail behind a name is only looked up by the server function "sign-in".
create unique index profiles_display_name_unique on public.profiles (lower(display_name));

-- Is this name still free? (For the sign-up form; reveals nothing but yes/no.)
create or replace function public.name_available(wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles p where lower(p.display_name) = lower(btrim(wanted)));
$$;
revoke all on function public.name_available(text) from public;
grant execute on function public.name_available(text) to anon, authenticated;

-- New accounts: a taken name stops the sign-up (the game checks before, this is the safety net);
-- a missing or invalid name becomes a unique "Spieler-xxxxxx".
create or replace function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(wanted) not between 2 and 20 or wanted !~ '^[[:alnum:]][[:alnum:] _-]*$' then
    wanted := 'Spieler-' || left(replace(new.id::text, '-', ''), 8);
  elsif exists (select 1 from public.profiles p where lower(p.display_name) = lower(wanted)) then
    raise exception 'display_name_taken' using errcode = '23505';
  end if;
  insert into public.profiles (id, display_name) values (new.id, wanted);
  return new;
end;
$$;
