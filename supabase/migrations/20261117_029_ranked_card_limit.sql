-- Rangliste: at most LEAGUE_DAILY_CARDS new cards per player and (Berlin) day – wins against the computer and online
-- ranked wins together. card_quota_take counts one card if the limit allows it (atomic); card_quota_give_back undoes
-- it when the payment did not happen. An online ranked win can bring a card too (pvp_matches.reward_card).
create table public.reward_days (
  player_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  cards integer not null default 0 check (cards >= 0),
  primary key (player_id, day)
);
alter table public.reward_days enable row level security;

create or replace function private.card_quota_take(p_player uuid, p_day date, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reward_days (player_id, day) values (p_player, p_day) on conflict do nothing;
  update public.reward_days set cards = cards + 1 where player_id = p_player and day = p_day and cards < p_limit;
  return found;
end;
$$;
revoke all on function private.card_quota_take(uuid, date, integer) from public, anon, authenticated;
grant execute on function private.card_quota_take(uuid, date, integer) to service_role;
create or replace function public.card_quota_take(p_player uuid, p_day date, p_limit integer)
returns boolean language sql security invoker set search_path = '' as $$ select private.card_quota_take(p_player, p_day, p_limit); $$;
revoke all on function public.card_quota_take(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.card_quota_take(uuid, date, integer) to service_role;

create or replace function private.card_quota_give_back(p_player uuid, p_day date)
returns void language sql security definer set search_path = '' as $$
  update public.reward_days set cards = cards - 1 where player_id = p_player and day = p_day and cards > 0;
$$;
revoke all on function private.card_quota_give_back(uuid, date) from public, anon, authenticated;
grant execute on function private.card_quota_give_back(uuid, date) to service_role;
create or replace function public.card_quota_give_back(p_player uuid, p_day date)
returns void language sql security invoker set search_path = '' as $$ select private.card_quota_give_back(p_player, p_day); $$;
revoke all on function public.card_quota_give_back(uuid, date) from public, anon, authenticated;
grant execute on function public.card_quota_give_back(uuid, date) to service_role;

alter table public.pvp_matches add column if not exists reward_card text check (reward_card ~ '^[a-z][0-9]{2,4}$');
