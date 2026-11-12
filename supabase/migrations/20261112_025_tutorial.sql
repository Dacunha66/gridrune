-- Tutorial: the reward (7 Abenteurer-Packs, 1 Helden-Pack) goes into the Postfach once per account, after the server
-- function "game" has replayed the finished tutorial duel.
create table public.tutorial_rewards (
  player_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.tutorial_rewards enable row level security;

/** 'paid' (two Postfach items added) or 'already' (this account got it before). */
create or replace function private.tutorial_reward(p_player uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tutorial_rewards (player_id) values (p_player) on conflict do nothing;
  if not found then return 'already'; end if;
  insert into public.inbox_items (player_id, sender, title, message, reward) values
    (p_player, 'admin', 'Tutorial geschafft', 'Willkommen bei GridRune! Viel Spaß mit deinen ersten Karten.', '{"type": "pack", "packId": "abenteurer", "amount": 7}'::jsonb),
    (p_player, 'admin', 'Tutorial geschafft', 'Und ein Helden-Pack obendrauf.', '{"type": "pack", "packId": "helden", "amount": 1}'::jsonb);
  return 'paid';
end;
$$;
revoke all on function private.tutorial_reward(uuid) from public, anon, authenticated;
grant execute on function private.tutorial_reward(uuid) to service_role;
create or replace function public.tutorial_reward(p_player uuid)
returns text language sql security invoker set search_path = '' as $$ select private.tutorial_reward(p_player); $$;
revoke all on function public.tutorial_reward(uuid) from public, anon, authenticated;
grant execute on function public.tutorial_reward(uuid) to service_role;
