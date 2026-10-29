-- GridRune v1.20: runes and the cross-class abilities Wirbelwind / Kettenübernahme.
-- v1.24: rune rarities start at "rare", the mid-duel threshold min_placed, runes unlocked in the campaign.

-- 1. Cards: the two new abilities fit every class (still at most one ability per card).
alter table public.cards drop constraint if exists cards_effect_fits_class;
alter table public.cards add constraint cards_effect_fits_class check (
  effect is null
  or effect in ('wirbelwind', 'kettenuebernahme')
  or (cls, effect) in (('krieger', 'kampfgeist'), ('krieger', 'schildwall'), ('magier', 'arkane_kraft'), ('magier', 'magische_barriere'),
    ('natur', 'wurzelkraft'), ('natur', 'naturbund'), ('feuer', 'flammenherz'), ('frost', 'frostpanzer'),
    ('schatten', 'schattenmantel'), ('schatten', 'schwaechender_blick'))
);

-- 2. Rune definitions (admin data). Variants copy their base rune's effect in the game.
create table if not exists public.runes (
  id text primary key check (id ~ '^rn[0-9]{2,4}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  rarity text not null default 'rare' check (rarity in ('rare', 'epic', 'legendary', 'mythic')),
  effect text not null check (effect in ('twist', 'echo', 'empower', 'curse')),
  amount int not null default 1 check (amount between 1 and 2),
  max_targets int not null default 1 check (max_targets between 1 and 3),
  min_placed int not null default 0 check (min_placed between 0 and 15),
  cls text check (cls is null or cls in ('krieger', 'magier', 'natur', 'feuer', 'frost', 'schatten')),
  modes jsonb not null default '{"adventure": true, "campaign": true, "league": true}',
  unlock jsonb not null default '{"kind": "start"}',
  variant_of text references public.runes (id),
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled')),
  glyph text not null default 'ᚱ',
  image jsonb,
  icon jsonb,
  updated_at timestamptz not null default now()
);
alter table public.runes enable row level security;
create trigger runes_touch before update on public.runes for each row execute function public.touch_updated_at();
create policy "runes: everyone reads active runes, admins read all" on public.runes
  for select to anon, authenticated using (status = 'active' or (select private.is_admin()));
create policy "runes: admins insert" on public.runes for insert to authenticated with check ((select private.is_admin()));
create policy "runes: admins update" on public.runes for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- 3. Player runes (with accounts): unlocked runes and the equipped one; written only by server functions.
create table if not exists public.player_runes (
  player_id uuid not null references auth.users (id) on delete cascade,
  rune_id text not null references public.runes (id),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, rune_id)
);
alter table public.player_runes enable row level security;
create policy "player runes: read own" on public.player_runes for select to authenticated using ((select auth.uid()) = player_id);
create index if not exists runes_variant_of_idx on public.runes (variant_of);
create index if not exists player_runes_rune_id_idx on public.player_runes (rune_id);
