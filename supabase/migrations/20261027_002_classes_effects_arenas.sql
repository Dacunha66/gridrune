-- Classes and special effects for cards, arena templates (version 1.7).
-- Every card has exactly one class and at most one effect, which must belong to that class.
-- Behaviour lives in the game code (src/game/effects.ts, battle.ts); the database only stores ids.

alter table public.cards
  add column if not exists cls text not null default 'krieger'
    check (cls in ('krieger', 'magier', 'natur', 'feuer', 'frost', 'schatten')),
  add column if not exists effect text,
  add constraint cards_effect_fits_class
    check (effect is null or (cls, effect) in (('krieger', 'kampfgeist'), ('krieger', 'schildwall'), ('magier', 'arkane_kraft'), ('magier', 'magische_barriere'), ('natur', 'wurzelkraft'), ('natur', 'naturbund'), ('feuer', 'flammenherz'), ('frost', 'frostpanzer'), ('schatten', 'schattenmantel'), ('schatten', 'schwaechender_blick')));

-- Suggested classes for the existing cards (by name and picture; changeable in the admin dashboard).
update public.cards set cls = 'krieger' where id in ('c03', 'c05', 'c16', 'c24', 'c30', 'u01', 'u02', 'u05', 'u15', 'u16', 'u20', 'u21', 'u22', 'r01', 'r04', 'r13', 'r19', 'r20', 'e03', 'e08', 'e14', 'l08', 'm03');
update public.cards set cls = 'magier' where id in ('c18', 'c22', 'u03', 'u04', 'u11', 'u13', 'u19', 'r02', 'r05', 'r17', 'e04', 'e07', 'e10', 'e11', 'e12', 'l02', 'l07', 'm01', 'm02', 'k001');
update public.cards set cls = 'natur' where id in ('c01', 'c06', 'c08', 'c09', 'c11', 'c12', 'c14', 'c17', 'c19', 'c20', 'c21', 'c28', 'u06', 'u07', 'u08', 'u09', 'u10', 'u12', 'u14', 'r06', 'r15', 'e05', 'l03');
update public.cards set cls = 'feuer' where id in ('c02', 'c07', 'c26', 'u23', 'r07', 'e01', 'e13', 'l05', 'm04');
update public.cards set cls = 'frost' where id in ('c10', 'c15', 'c25', 'c29', 'u17', 'u18', 'r08', 'r11', 'r14', 'r16', 'e02', 'l01', 'l06');
update public.cards set cls = 'schatten' where id in ('c04', 'c13', 'c23', 'c27', 'u24', 'r03', 'r09', 'r10', 'r12', 'r18', 'e06', 'e09', 'l04');

-- Fair for ranked play: point-symmetric (cell i = cell 15 - i), no terrain exactly once, at most 8 terrain cells.
create or replace function public.arena_is_fair(cells text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (select bool_and(cells[i] = cells[17 - i]) from generate_series(1, 16) as i)
    and (select count(*) from unnest(cells) as c where c <> 'normal') <= 8
    and not exists (select 1 from unnest(cells) as c where c <> 'normal' group by c having count(*) = 1);
$$;

create table public.arenas (
  id text primary key check (id ~ '^a[0-9]{2,4}$'),
  name text not null check (char_length(name) between 1 and 30),
  cells text[] not null check (
    array_length(cells, 1) = 16
    and cells <@ array['normal', 'wald', 'lava', 'eis', 'schatten']
    and 'normal' = any (cells)
  ),
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled')),
  ranked boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint arenas_ranked_fair check (not ranked or public.arena_is_fair(cells))
);
alter table public.arenas enable row level security;
create policy "arenas: everyone reads active arenas, admins read all" on public.arenas
  for select to anon, authenticated using (status = 'active' or (select public.is_admin()));
create policy "arenas: admins insert" on public.arenas
  for insert to authenticated with check ((select public.is_admin()));
create policy "arenas: admins update" on public.arenas
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "arenas: admins delete" on public.arenas
  for delete to authenticated using ((select public.is_admin()));
create trigger arenas_touch before update on public.arenas
  for each row execute function public.touch_updated_at();

insert into public.arenas (id, name, cells, status, ranked) values
  ('a01', 'Klassische Arena', array['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal'], 'active', true),
  ('a02', 'Waldlichtung', array['wald', 'normal', 'normal', 'wald', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'wald', 'normal', 'normal', 'wald'], 'active', true),
  ('a03', 'Vulkankrater', array['normal', 'lava', 'normal', 'normal', 'normal', 'lava', 'normal', 'normal', 'normal', 'normal', 'lava', 'normal', 'normal', 'normal', 'lava', 'normal'], 'active', true),
  ('a04', 'Frostsee', array['normal', 'normal', 'normal', 'normal', 'eis', 'normal', 'eis', 'normal', 'normal', 'eis', 'normal', 'eis', 'normal', 'normal', 'normal', 'normal'], 'active', true),
  ('a05', 'Schattenhain', array['normal', 'normal', 'schatten', 'normal', 'normal', 'normal', 'normal', 'schatten', 'schatten', 'normal', 'normal', 'normal', 'normal', 'schatten', 'normal', 'normal'], 'active', true),
  ('a06', 'Grenzland', array['wald', 'normal', 'normal', 'eis', 'normal', 'lava', 'schatten', 'normal', 'normal', 'schatten', 'lava', 'normal', 'eis', 'normal', 'normal', 'wald'], 'active', true)
on conflict (id) do nothing;
