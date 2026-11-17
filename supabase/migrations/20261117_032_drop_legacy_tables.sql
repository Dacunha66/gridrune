-- Alte Tabellen aus der Anfangszeit, die das Spiel nicht mehr benutzt (die Inhalte liegen in content_docs).
-- Vorher wird jede Tabelle vollständig als Kopie in legacy_tables_backup gesichert (nur für Admins lesbar).
create table public.legacy_tables_backup (
  table_name text primary key,
  row_count integer not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.legacy_tables_backup enable row level security;
create policy "legacy backup: admins read" on public.legacy_tables_backup for select to authenticated using ((select private.is_admin()));

insert into public.legacy_tables_backup (table_name, row_count, rows)
select 'cards', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.cards x
union all select 'arenas', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.arenas x
union all select 'runes', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.runes x
union all select 'player_runes', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.player_runes x
union all select 'designs', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.designs x
union all select 'design_state', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.design_state x
union all select 'game_settings', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.game_settings x;

drop table public.design_state;
drop table public.designs;
drop table public.player_runes;
drop table public.runes;
drop table public.cards;
drop table public.arenas;
drop table public.game_settings;
