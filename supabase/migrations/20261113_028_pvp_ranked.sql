-- Ranglisten-Ligen online: a ranked match ("ranked") pairs two players of similar steps; the step of each player when
-- the search started is kept for the display. The result moves both players on the ladder (server function "pvp").
alter table public.pvp_matches drop constraint if exists pvp_matches_kind_check;
alter table public.pvp_matches add constraint pvp_matches_kind_check check (kind in ('invite', 'random', 'ranked'));
alter table public.pvp_matches add column if not exists step_a integer check (step_a between 0 and 17);
alter table public.pvp_matches add column if not exists step_b integer check (step_b between 0 and 17);
