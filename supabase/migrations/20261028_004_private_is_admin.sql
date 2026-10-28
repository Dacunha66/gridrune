-- Move the admin check out of the public API (Supabase security advisor 0028/0029).
-- Policies still use it; it is just no longer callable as /rest/v1/rpc/is_admin.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

drop policy "cards: everyone reads active cards, admins read all" on public.cards;
drop policy "cards: admins insert" on public.cards;
drop policy "cards: admins update" on public.cards;
drop policy "cards: admins delete" on public.cards;
create policy "cards: everyone reads active cards, admins read all" on public.cards
  for select to anon, authenticated using (status = 'active' or (select private.is_admin()));
create policy "cards: admins insert" on public.cards
  for insert to authenticated with check ((select private.is_admin()));
create policy "cards: admins update" on public.cards
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "cards: admins delete" on public.cards
  for delete to authenticated using ((select private.is_admin()));

drop policy "settings: admins insert" on public.game_settings;
drop policy "settings: admins update" on public.game_settings;
create policy "settings: admins insert" on public.game_settings
  for insert to authenticated with check ((select private.is_admin()));
create policy "settings: admins update" on public.game_settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy "card images: admins upload" on storage.objects;
drop policy "card images: admins change" on storage.objects;
drop policy "card images: admins delete" on storage.objects;
create policy "card images: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'card-images' and (select private.is_admin()));
create policy "card images: admins change" on storage.objects
  for update to authenticated using (bucket_id = 'card-images' and (select private.is_admin()));
create policy "card images: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'card-images' and (select private.is_admin()));

drop policy "arenas: everyone reads active arenas, admins read all" on public.arenas;
drop policy "arenas: admins insert" on public.arenas;
drop policy "arenas: admins update" on public.arenas;
drop policy "arenas: admins delete" on public.arenas;
create policy "arenas: everyone reads active arenas, admins read all" on public.arenas
  for select to anon, authenticated using (status = 'active' or (select private.is_admin()));
create policy "arenas: admins insert" on public.arenas
  for insert to authenticated with check ((select private.is_admin()));
create policy "arenas: admins update" on public.arenas
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "arenas: admins delete" on public.arenas
  for delete to authenticated using ((select private.is_admin()));

drop policy "designs: admins insert" on public.designs;
drop policy "designs: admins update" on public.designs;
create policy "designs: admins insert" on public.designs
  for insert to authenticated with check ((select private.is_admin()));
create policy "designs: admins update" on public.designs
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy "design state: admins insert" on public.design_state;
drop policy "design state: admins update" on public.design_state;
create policy "design state: admins insert" on public.design_state
  for insert to authenticated with check ((select private.is_admin()));
create policy "design state: admins update" on public.design_state
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy "design images: admins upload" on storage.objects;
drop policy "design images: admins change" on storage.objects;
create policy "design images: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'design-images' and (select private.is_admin()));
create policy "design images: admins change" on storage.objects
  for update to authenticated using (bucket_id = 'design-images' and (select private.is_admin()));

drop function public.is_admin();
