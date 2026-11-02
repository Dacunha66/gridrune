-- Collection League matches against the computer, checked by the server (card reward for a won match).
alter table public.game_tickets drop constraint game_tickets_kind_check;
alter table public.game_tickets add constraint game_tickets_kind_check check (kind in ('adventure', 'campaign', 'shop', 'league'));
