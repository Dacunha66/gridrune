-- Bilder im Speicher, die nirgends mehr benutzt werden (in keiner Tabelle erwähnt), älter als 1 Stunde.
-- Am 17.11.2026 wurden damit 220 unbenutzte Bilder (69 MB) über die Server-Funktion "maintenance" entfernt.
create or replace function private.orphan_images()
returns table (name text, size bigint) language plpgsql security definer set search_path = '' as $$
declare r record; big text := ''; t text;
begin
  for r in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('content_backups', 'game_archive') loop
    execute format('select coalesce(string_agg(to_jsonb(x)::text, '' ''), '''') from public.%I x', r.table_name) into t;
    big := big || ' ' || t;
  end loop;
  return query select o.name, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
    where o.bucket_id = 'game-images' and o.created_at < now() - interval '1 hour' and position(o.name in big) = 0;
end;
$$;
revoke all on function private.orphan_images() from public, anon, authenticated;
grant execute on function private.orphan_images() to service_role;
create or replace function public.orphan_images()
returns table (name text, size bigint) language sql security invoker set search_path = '' as $$ select * from private.orphan_images(); $$;
revoke all on function public.orphan_images() from public, anon, authenticated;
grant execute on function public.orphan_images() to service_role;

-- Einmal-Schlüssel für Wartungsaufgaben (nur der Hash wird gespeichert).
create table private.maintenance_tokens (
  hash text primary key,
  purpose text not null,
  expires_at timestamptz not null
);
create or replace function private.maintenance_use(p_hash text, p_purpose text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from private.maintenance_tokens where hash = p_hash and purpose = p_purpose and expires_at > now();
  return found;
end;
$$;
revoke all on function private.maintenance_use(text, text) from public, anon, authenticated;
grant execute on function private.maintenance_use(text, text) to service_role;
create or replace function public.maintenance_use(p_hash text, p_purpose text)
returns boolean language sql security invoker set search_path = '' as $$ select private.maintenance_use(p_hash, p_purpose); $$;
revoke all on function public.maintenance_use(text, text) from public, anon, authenticated;
grant execute on function public.maintenance_use(text, text) to service_role;
