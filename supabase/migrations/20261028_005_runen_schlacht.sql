-- GridRune v1.15: two new terrain types (Runenfeld for Magier, Schlachtfeld for Krieger)
-- and the arena status "campaign" (only used by campaign missions, never picked at random).
-- Not applied yet – runs together with the move of the game to Supabase.
alter table public.arenas drop constraint if exists arenas_cells_check;
alter table public.arenas add constraint arenas_cells_check check (
  array_length(cells, 1) = 16
  and cells <@ array['normal', 'wald', 'lava', 'eis', 'schatten', 'runen', 'schlacht']
  and 'normal' = any (cells)
);
alter table public.arenas drop constraint if exists arenas_status_check;
alter table public.arenas add constraint arenas_status_check check (status in ('draft', 'active', 'campaign', 'disabled'));
