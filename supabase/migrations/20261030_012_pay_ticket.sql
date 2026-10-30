-- GridRune Phase 4: finishing a ticket and paying its reward happen together or not at all.
-- Returns 'paid', 'already' (the ticket was finished before – nothing is paid twice) or 'conflict' (the save
-- changed in between – the server function reads it again and retries). Only the server functions may call it.
create or replace function private.pay_ticket(p_ticket uuid, p_player uuid, p_result jsonb, p_save jsonb, p_campaign jsonb, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_tickets set finished_at = now(), result = p_result
    where id = p_ticket and player_id = p_player and finished_at is null;
  if not found then
    return 'already';
  end if;
  if p_save is not null then
    update public.player_saves
      set save = p_save, campaign = coalesce(p_campaign, campaign), version = p_version + 1, updated_at = now()
      where player_id = p_player and version = p_version;
    if not found then
      raise exception 'save_conflict';
    end if;
  end if;
  return 'paid';
exception
  when raise_exception then
    if sqlerrm = 'save_conflict' then
      return 'conflict';
    end if;
    raise;
end;
$$;
revoke all on function private.pay_ticket(uuid, uuid, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function private.pay_ticket(uuid, uuid, jsonb, jsonb, jsonb, integer) to service_role;
grant usage on schema private to service_role;

-- Reachable for the service role through the API as public.pay_ticket (a thin wrapper, also service-role only).
create or replace function public.pay_ticket(p_ticket uuid, p_player uuid, p_result jsonb, p_save jsonb, p_campaign jsonb, p_version integer)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.pay_ticket(p_ticket, p_player, p_result, p_save, p_campaign, p_version);
$$;
revoke all on function public.pay_ticket(uuid, uuid, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.pay_ticket(uuid, uuid, jsonb, jsonb, jsonb, integer) to service_role;
