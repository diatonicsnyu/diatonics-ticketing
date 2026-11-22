-- =====================================================================
-- Step 5: offline door scanning (sync + duplicate flags)
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0007_door.sql first.
-- =====================================================================

-- Each check-in / door-sale tap made offline gets a random id on the phone,
-- so sending it twice (bad signal, retries) never counts it twice.
alter table public.check_in_log     add column client_id text;
alter table public.door_sale_counts add column client_id text;
create unique index check_in_log_client_id_key     on public.check_in_log (client_id)     where client_id is not null;
create unique index door_sale_counts_client_id_key on public.door_sale_counts (client_id) where client_id is not null;

-- ---------- sync what a phone did while offline -------------------------
-- p_check_ins: [{ "cid", "ticket_id", "at", "method" }]
-- p_sales:     [{ "cid", "delta" }]
-- Returns one result per check-in:
--   ok        = checked in now (at the time the phone scanned it)
--   synced    = already received earlier (a retry)
--   duplicate = someone else had ALREADY let this ticket in: two people got
--               in on one ticket while phones were offline (spec §3.7).
--               Logged with conflict = true so admin can see it.
--   void / not_found / wrong_event = the phone let in something the server
--               wouldn't have; also logged as a conflict when possible.
create or replace function public.door_sync(
  p_event_id uuid, p_device_id text, p_device_name text, p_check_ins jsonb, p_sales jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item    jsonb;
  v_cid     text;
  v_tid     uuid;
  v_at      timestamptz;
  v_method  text;
  v_t       public.tickets%rowtype;
  v_o       public.orders%rowtype;
  v_name    text;
  v_mine    integer;
  v_results jsonb := '[]'::jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_check_ins, '[]'::jsonb)) loop
    v_cid    := v_item->>'cid';
    v_tid    := (v_item->>'ticket_id')::uuid;
    v_at     := least(coalesce((v_item->>'at')::timestamptz, now()), now());
    v_method := case when v_item->>'method' = 'lookup' then 'lookup' else 'scan' end;

    if exists (select 1 from public.check_in_log where client_id = v_cid) then
      v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'synced');
      continue;
    end if;

    select * into v_t from public.tickets where id = v_tid for update;
    if not found then
      v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'not_found');
      continue;
    end if;
    if v_t.event_id <> p_event_id then
      v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'wrong_event');
      continue;
    end if;

    select * into v_o from public.orders where id = v_t.order_id;
    v_name := trim(v_o.buyer_first_name || ' ' || v_o.buyer_last_name);

    if v_t.status = 'void' or v_o.status not in ('paid', 'comp') then
      insert into public.check_in_log (event_id, ticket_id, device_id, device_name, action, method, synced_at, conflict, client_id, created_at)
      values (p_event_id, v_tid, p_device_id, p_device_name, 'check_in', v_method, now(), true, v_cid, v_at);
      v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'void', 'name', v_name);
      continue;
    end if;

    if v_t.status = 'checked_in' then
      -- This same phone checked it in online a moment before losing signal:
      -- not a duplicate, just the same check-in twice.
      if exists (select 1 from public.check_in_log
                  where ticket_id = v_tid and device_id = p_device_id and action = 'check_in' and not conflict) then
        v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'synced');
        continue;
      end if;
      insert into public.check_in_log (event_id, ticket_id, device_id, device_name, action, method, synced_at, conflict, client_id, created_at)
      values (p_event_id, v_tid, p_device_id, p_device_name, 'check_in', v_method, now(), true, v_cid, v_at);
      v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'duplicate', 'name', v_name,
        'first_at', v_t.checked_in_at, 'first_by', v_t.checked_in_device);
      continue;
    end if;

    update public.tickets
       set status = 'checked_in', checked_in_at = v_at, checked_in_device = p_device_name
     where id = v_tid;
    insert into public.check_in_log (event_id, ticket_id, device_id, device_name, action, method, synced_at, client_id, created_at)
    values (p_event_id, v_tid, p_device_id, p_device_name, 'check_in', v_method, now(), v_cid, v_at);
    v_results := v_results || jsonb_build_object('cid', v_cid, 'result', 'ok');
  end loop;

  -- Door-sale taps. Same rule as online: a phone can't go below 0.
  perform pg_advisory_xact_lock(hashtext(p_event_id::text || '|' || p_device_id));
  for v_item in select * from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) loop
    v_cid := v_item->>'cid';
    continue when exists (select 1 from public.door_sale_counts where client_id = v_cid);
    continue when (v_item->>'delta')::int not in (-1, 1);
    select coalesce(sum(delta), 0) into v_mine from public.door_sale_counts
     where event_id = p_event_id and device_id = p_device_id;
    if (v_item->>'delta')::int = 1 or v_mine > 0 then
      insert into public.door_sale_counts (event_id, device_id, delta, client_id)
      values (p_event_id, p_device_id, (v_item->>'delta')::int, v_cid);
    end if;
  end loop;

  return jsonb_build_object('check_ins', v_results, 'stats', public.door_stats(p_event_id, p_device_id));
end;
$$;

revoke all on function public.door_sync(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.door_sync(uuid, text, text, jsonb, jsonb) to service_role;
