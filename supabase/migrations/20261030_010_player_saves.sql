-- GridRune Phase 3: the player's progress is stored in the account (coins, collection, deck, skins, runes,
-- statistics, campaign). Players can only READ their own save; every change goes through the server function
-- "save-sync", which rejects implausible jumps (exact duel checks follow in phase 4).
create table public.player_saves (
  player_id uuid primary key references auth.users (id) on delete cascade,
  save jsonb not null check (jsonb_typeof(save) = 'object' and pg_column_size(save) <= 100000),
  campaign jsonb not null check (jsonb_typeof(campaign) = 'object' and pg_column_size(campaign) <= 200000),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_saves enable row level security;
create policy "player saves: read own" on public.player_saves
  for select to authenticated using (player_id = (select auth.uid()));
-- No insert/update/delete policies: only the server function (service role) writes.
