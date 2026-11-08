-- GridRune avatars: the avatar each player shows in an online duel (chosen with the titles, unlocked by
-- achievements; written only by the server function "pvp").
alter table public.pvp_matches add column avatar_a text check (char_length(avatar_a) <= 12);
alter table public.pvp_matches add column avatar_b text check (char_length(avatar_b) <= 12);
