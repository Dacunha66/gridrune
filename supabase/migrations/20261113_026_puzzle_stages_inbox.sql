-- Puzzle-Events: every further stage starts its tasks again (starting point of the counters per player: stage_base),
-- and the card of a completed stage comes into the Postfach (sender 'event', once per player and stage) instead of
-- straight into the save – so the player sees it and collects it with the big reveal.
alter table public.puzzle_progress add column if not exists stage_base jsonb;

alter table public.inbox_items drop constraint if exists inbox_items_sender_check;
alter table public.inbox_items add constraint inbox_items_sender_check check (sender in ('raid', 'admin', 'event'));

/** Stores where the tasks of a further stage start counting (the counters when the stage began). */
create or replace function private.puzzle_set_base(p_player uuid, p_puzzle text, p_base jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.puzzle_progress (player_id, puzzle_id, stage_base) values (p_player, p_puzzle, p_base)
    on conflict (player_id, puzzle_id) do update set stage_base = excluded.stage_base, updated_at = now();
end;
$$;

/** The card of a completed stage into the Postfach – once per player, puzzle and stage. True = sent now. */
create or replace function private.puzzle_stage_reward(p_player uuid, p_puzzle text, p_key text, p_title text, p_message text, p_reward jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.puzzle_claims (player_id, puzzle_id, key) values (p_player, p_puzzle, p_key) on conflict do nothing;
  if not found then return false; end if;
  insert into public.inbox_items (player_id, sender, title, message, reward) values (p_player, 'event', left(p_title, 80), left(p_message, 200), p_reward);
  return true;
end;
$$;

-- Fragments: as before, but a complete puzzle no longer needs a save (its cards come through the Postfach).
create or replace function private.puzzle_claim(p_player uuid, p_puzzle text, p_keys text[], p_pieces smallint[], p_total smallint,
  p_save jsonb, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur smallint[];
  done timestamptz;
  next smallint[];
begin
  if cardinality(p_keys) = 0 or cardinality(p_pieces) = 0 or p_total < 1 or p_total > 64 then
    raise exception 'bad_claim';
  end if;
  if exists (select 1 from unnest(p_pieces) as x where x < 0 or x >= p_total)
     or (select count(distinct x) from unnest(p_pieces) as x) <> cardinality(p_pieces) then
    raise exception 'bad_claim';
  end if;
  insert into public.puzzle_progress (player_id, puzzle_id) values (p_player, p_puzzle) on conflict do nothing;
  select pieces, completed_at into cur, done from public.puzzle_progress where player_id = p_player and puzzle_id = p_puzzle for update;
  if done is not null then
    return 'already';
  end if;
  if cur && p_pieces then
    raise exception 'piece_conflict';
  end if;
  insert into public.puzzle_claims (player_id, puzzle_id, key, pieces)
    select p_player, p_puzzle, k, p_pieces from unnest(p_keys) as k;
  next := cur || p_pieces;
  update public.puzzle_progress
    set pieces = next, updated_at = now(), completed_at = case when cardinality(next) >= p_total then now() else null end
    where player_id = p_player and puzzle_id = p_puzzle;
  if p_save is not null then
    update public.player_saves set save = p_save, version = p_version + 1, updated_at = now()
      where player_id = p_player and version = p_version;
    if not found then
      raise exception 'save_conflict';
    end if;
  end if;
  return 'paid';
exception
  when unique_violation then
    return 'already';
  when raise_exception then
    if sqlerrm in ('save_conflict', 'piece_conflict') then
      return 'conflict';
    end if;
    raise;
end;
$$;

revoke all on function private.puzzle_set_base(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.puzzle_stage_reward(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.puzzle_set_base(uuid, text, jsonb) to service_role;
grant execute on function private.puzzle_stage_reward(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.puzzle_set_base(p_player uuid, p_puzzle text, p_base jsonb)
returns void language sql security invoker set search_path = '' as $$ select private.puzzle_set_base(p_player, p_puzzle, p_base); $$;
create or replace function public.puzzle_stage_reward(p_player uuid, p_puzzle text, p_key text, p_title text, p_message text, p_reward jsonb)
returns boolean language sql security invoker set search_path = '' as $$ select private.puzzle_stage_reward(p_player, p_puzzle, p_key, p_title, p_message, p_reward); $$;
revoke all on function public.puzzle_set_base(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.puzzle_stage_reward(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.puzzle_set_base(uuid, text, jsonb) to service_role;
grant execute on function public.puzzle_stage_reward(uuid, text, text, text, text, jsonb) to service_role;
