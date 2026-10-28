-- Board designer and page background (version 1.9).
-- Pictures are stored unchanged in the bucket `design-images` (original + a smaller copy for the game);
-- zoom, position and grid layout are stored separately. Only admins may change anything.

create table public.designs (
  id text primary key check (id ~ '^d[0-9]{3,5}$'),
  kind text not null check (kind in ('board', 'page')),
  name text not null check (char_length(name) between 1 and 30),
  image_path text,          -- original upload in storage (never changed)
  display_path text,        -- smaller copy used in the game
  image_w integer check (image_w is null or image_w > 0),
  image_h integer check (image_h is null or image_h > 0),
  fit jsonb not null default '{"zoom": 1, "px": 0.5, "py": 0.5}',
  layout jsonb not null default '{"size": 1, "offsetY": 0, "gap": 3, "frame": 3, "cellAlpha": 1, "cellBorders": false}',
  page jsonb not null default '{"dim": 0.35}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Safe ranges (the same limits as in the game): the board stays on screen and every cell stays tappable.
  constraint designs_fit_range check (
    (fit->>'zoom')::numeric between 1 and 4 and (fit->>'px')::numeric between 0 and 1 and (fit->>'py')::numeric between 0 and 1
  ),
  constraint designs_layout_range check (
    (layout->>'size')::numeric between 0.7 and 1 and (layout->>'offsetY')::numeric between 0 and 1
    and (layout->>'gap')::numeric between 0 and 12 and (layout->>'frame')::numeric between 0 and 24
    and (layout->>'cellAlpha')::numeric between 0 and 1
  ),
  constraint designs_page_range check ((page->>'dim')::numeric between 0 and 0.8)
);
alter table public.designs enable row level security;
create policy "designs: everyone reads" on public.designs
  for select to anon, authenticated using (true);
create policy "designs: admins insert" on public.designs
  for insert to authenticated with check ((select public.is_admin()));
create policy "designs: admins update" on public.designs
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger designs_touch before update on public.designs
  for each row execute function public.touch_updated_at();

-- Which designs are published, and the previous ones (for "back to the previous design"). null = standard design.
create table public.design_state (
  id text primary key default 'current' check (id = 'current'),
  board_design_id text references public.designs (id),
  board_prev_id text references public.designs (id),
  page_design_id text references public.designs (id),
  page_prev_id text references public.designs (id),
  updated_at timestamptz not null default now()
);
alter table public.design_state enable row level security;
create policy "design state: everyone reads" on public.design_state
  for select to anon, authenticated using (true);
create policy "design state: admins insert" on public.design_state
  for insert to authenticated with check ((select public.is_admin()));
create policy "design state: admins update" on public.design_state
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger design_state_touch before update on public.design_state
  for each row execute function public.touch_updated_at();
insert into public.design_state (id) values ('current') on conflict (id) do nothing;

-- Picture storage: public read (the game shows the pictures), only admins upload or replace. No delete policy:
-- uploaded pictures are kept.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-images', 'design-images', true, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "design images: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'design-images' and (select public.is_admin()));
create policy "design images: admins change" on storage.objects
  for update to authenticated using (bucket_id = 'design-images' and (select public.is_admin()));
