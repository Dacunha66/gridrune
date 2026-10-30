-- GridRune Phase 4: every adventure run of a signed-in player starts with a ticket (seed, deck, runes) from the
-- server function "adventure"; the result is only paid out after the server replayed the run with this ticket.
-- Only the server function reads and writes this table (no policies for players).
create table public.game_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('adventure', 'campaign', 'shop')),
  ticket jsonb not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb
);
alter table public.game_tickets enable row level security;
create index game_tickets_player_idx on public.game_tickets (player_id, created_at desc);
