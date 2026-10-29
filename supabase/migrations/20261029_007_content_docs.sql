-- GridRune: admin content for the web version (gridrune.netlify.app).
-- One row per document, in the same shape the game already reads and validates (cards, settings, arenas,
-- designs, campaign worlds/missions/opponents, runes). Everyone reads published content; only admins write.
-- Drafts stay hidden from players. Pictures live in the public bucket "game-images" (admins upload).
create table public.content_docs (
  collection text not null check (collection in (
    'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes'
  )),
  id text not null check (id ~ '^[a-z0-9_-]{1,40}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  status text generated always as (data ->> 'status') stored,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
alter table public.content_docs enable row level security;
create trigger content_docs_touch before update on public.content_docs for each row execute function public.touch_updated_at();

create policy "content: everyone reads published, admins read all" on public.content_docs
  for select to anon, authenticated using (status is distinct from 'draft' or (select private.is_admin()));
create policy "content: admins insert" on public.content_docs
  for insert to authenticated with check ((select private.is_admin()));
create policy "content: admins update" on public.content_docs
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "content: admins delete" on public.content_docs
  for delete to authenticated using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-images', 'game-images', true, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "game images: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'game-images' and (select private.is_admin()));
create policy "game images: admins change" on storage.objects
  for update to authenticated using (bucket_id = 'game-images' and (select private.is_admin()));
create policy "game images: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'game-images' and (select private.is_admin()));
