-- GridRune avatars as admin content (content_docs avatars/<id>): name, picture (uploaded image or emoji), colours,
-- frame and the achievement that unlocks it. Written by admins only (existing content_docs policies).
alter table public.content_docs drop constraint content_docs_collection_check;
alter table public.content_docs add constraint content_docs_collection_check check (collection in (
  'cards', 'settings', 'arenas', 'designs', 'campaign_worlds', 'campaign_missions', 'campaign_opponents', 'runes', 'raids', 'quests', 'avatars'
));
