-- GridRune Draft League online: a match can be a normal online duel ("duel") or a draft ("draft"). A draft has a
-- shared pool of 30 cards, each player's secret deck of 20, and a preparation phase ("drafting": deck building and
-- the run) before the duel. Only the server function reads these columns (no policies on pvp_matches).
alter table public.pvp_matches add column mode text not null default 'duel' check (mode in ('duel', 'draft'));
alter table public.pvp_matches add column pool jsonb;
alter table public.pvp_matches add column deck_a jsonb;
alter table public.pvp_matches add column deck_b jsonb;
alter table public.pvp_matches add column prepare_deadline timestamptz;
alter table public.pvp_matches alter column hand_a drop not null;
alter table public.pvp_matches drop constraint pvp_matches_status_check;
alter table public.pvp_matches add constraint pvp_matches_status_check check (status in ('waiting', 'drafting', 'playing', 'finished', 'cancelled'));
drop index public.pvp_matches_waiting_idx;
create index pvp_matches_waiting_idx on public.pvp_matches (kind, mode, created_at) where status = 'waiting';

-- Sign of life: also while drafting.
create or replace function public.pvp_ping(p_match uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pvp_matches set
    seen_a = case when player_a = (select auth.uid()) then now() else seen_a end,
    seen_b = case when player_b = (select auth.uid()) then now() else seen_b end
  where id = p_match and status in ('waiting', 'drafting', 'playing') and (select auth.uid()) in (player_a, player_b);
$$;

-- A draft can also end while drafting (a player left or is gone).
create or replace function private.pvp_finish(p_match uuid, p_state jsonb, p_winner text, p_reason text, p_pay uuid, p_coins integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pvp_matches
    set status = 'finished', state = coalesce(p_state, state), winner = p_winner, end_reason = p_reason, coins = p_coins,
        finished_at = now(), updated_at = now()
    where id = p_match and status in ('drafting', 'playing');
  if not found then
    return false;
  end if;
  if p_pay is not null and p_coins > 0 then
    update public.player_saves
      set save = jsonb_set(save, '{coins}', to_jsonb(coalesce((save ->> 'coins')::integer, 0) + p_coins)),
          version = version + 1, updated_at = now()
      where player_id = p_pay;
  end if;
  return true;
end;
$$;
