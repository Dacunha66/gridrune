-- Project Card Rush – Supabase foundation: admins, cards, game settings, player profiles, card images.
-- Security model: everybody may READ active cards and settings; only admins may WRITE them.
-- Players can only create/edit their own profile. Checked by the database (row level security).

-- Admins -----------------------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- True if the signed-in user is an admin. SECURITY DEFINER so policies can use it without
-- exposing the admin list; fixed search_path against hijacking.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create policy "admins: see own entry" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Cards ------------------------------------------------------------------------------------------
create table public.cards (
  id text primary key check (id ~ '^[a-z][0-9]{2,4}$'),
  name text not null check (char_length(name) between 1 and 40),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  top smallint not null check (top between 1 and 10),
  "right" smallint not null check ("right" between 1 and 10),
  bottom smallint not null check (bottom between 1 and 10),
  "left" smallint not null check ("left" between 1 and 10),
  art text not null default '🃏',
  hue smallint not null default 260 check (hue between 0 and 359),
  description text not null default '' check (char_length(description) <= 300),
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled')),
  in_runner boolean not null default true,
  reward_only boolean not null default false,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cards enable row level security;

create policy "cards: everyone reads active cards, admins read all" on public.cards
  for select to anon, authenticated using (status = 'active' or (select public.is_admin()));
create policy "cards: admins insert" on public.cards
  for insert to authenticated with check ((select public.is_admin()));
create policy "cards: admins update" on public.cards
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "cards: admins delete" on public.cards
  for delete to authenticated using ((select public.is_admin()));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();

-- Game settings (one row) --------------------------------------------------------------------------
create table public.game_settings (
  id text primary key default 'game' check (id = 'game'),
  discovery_shares jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_settings enable row level security;
create policy "settings: everyone reads" on public.game_settings
  for select to anon, authenticated using (true);
create policy "settings: admins insert" on public.game_settings
  for insert to authenticated with check ((select public.is_admin()));
create policy "settings: admins update" on public.game_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger settings_touch before update on public.game_settings
  for each row execute function public.touch_updated_at();

-- Player profiles -----------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: signed-in players read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: create own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: edit own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Card images (public to read, admins to write) -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "card images: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'card-images' and (select public.is_admin()));
create policy "card images: admins change" on storage.objects
  for update to authenticated using (bucket_id = 'card-images' and (select public.is_admin()));
create policy "card images: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'card-images' and (select public.is_admin()));
