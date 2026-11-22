-- =====================================================================
-- Step 6: admin tools (comp tickets, undo a check-in)
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0004_orders.sql, 0007_door.sql and 0008_offline.sql first.
-- =====================================================================

-- ---------- who issued a comp, and why ----------------------------------
alter table public.orders add column if not exists comp_by   text not null default '';
alter table public.orders add column if not exists comp_note text not null default '';

-- Undoing a check-in is logged as method 'admin'.
alter table public.check_in_log drop constraint if exists check_in_log_method_check;
alter table public.check_in_log add constraint check_in_log_method_check
  check (method in ('scan', 'lookup', 'admin'));

-- ---------- comp (free) tickets (called by the server only) -------------
-- Same checks as a purchase: locks the event, then makes sure there's room
-- (comps count against capacity, spec §3.8). Comps can still be issued
-- after online sales close (e.g. the night of the show), but not for a
-- draft or cancelled show.
-- Raises EVENT_NOT_OPEN / BAD_QUANTITY / SOLD_OUT / BAD_TYPE / TYPE_SOLD_OUT.
create or replace function public.create_comp_order(p_order jsonb, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_event     public.events%rowtype;
  v_type      public.ticket_types%rowtype;
  v_line      jsonb;
  v_count     integer;
  v_order_id  uuid;
  v_ol        public.order_lines%rowtype;
  v_code      text;
  i           integer;
begin
  select * into v_event from public.events where id = (p_order->>'event_id')::uuid for update;
  if not found or v_event.status not in ('on_sale', 'closed') then
    raise exception 'EVENT_NOT_OPEN';
  end if;

  select coalesce(sum((l->>'quantity')::int), 0) into v_count from jsonb_array_elements(p_lines) l;
  if v_count < 1 or v_count > 10 then
    raise exception 'BAD_QUANTITY';
  end if;

  if v_event.capacity is not null and public.tickets_taken(v_event.id) + v_count > v_event.capacity then
    raise exception 'SOLD_OUT';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_type from public.ticket_types
      where id = (v_line->>'ticket_type_id')::uuid and event_id = v_event.id;
    if not found then
      raise exception 'BAD_TYPE';
    end if;
    if v_type.quantity_limit is not null
       and public.tickets_taken(v_event.id, v_type.id) + (v_line->>'quantity')::int > v_type.quantity_limit then
      raise exception 'TYPE_SOLD_OUT';
    end if;
  end loop;

  insert into public.orders (
    order_no, kind, event_id, status, payment_method,
    buyer_first_name, buyer_last_name, buyer_email, buyer_phone,
    tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents,
    paid_at, comp_by, comp_note
  ) values (
    p_order->>'order_no', 'tickets', v_event.id, 'comp', 'comp',
    p_order->>'first_name', p_order->>'last_name', p_order->>'email', coalesce(p_order->>'phone', ''),
    0, 0, 0, 0,
    now(), coalesce(p_order->>'comp_by', ''), coalesce(p_order->>'comp_note', '')
  )
  returning id into v_order_id;

  insert into public.order_lines (order_id, ticket_type_id, quantity, price_cents)
  select v_order_id, (l->>'ticket_type_id')::uuid, (l->>'quantity')::int, 0
  from jsonb_array_elements(p_lines) l
  where (l->>'quantity')::int > 0;

  -- Tickets right away (a comp has nothing to wait for).
  for v_ol in select * from public.order_lines where order_id = v_order_id loop
    for i in 1..v_ol.quantity loop
      loop
        v_code := 'DIA-' || public.random_code(4) || '-' || public.random_code(2);
        begin
          insert into public.tickets (order_id, event_id, ticket_type_id, short_code)
          values (v_order_id, v_event.id, v_ol.ticket_type_id, v_code);
          exit;
        exception when unique_violation then
          -- That short code is taken: try another.
        end;
      end loop;
    end loop;
  end loop;

  return v_order_id;
end;
$$;

-- ---------- undo a check-in (admin only, spec §3.7 "Rules") --------------
-- Puts the ticket back to "not scanned yet" so it scans green again, and
-- keeps the history (the original check-in stays in check_in_log, plus an
-- 'undo' line saying who undid it).
-- result: ok / not_checked_in / not_found
create or replace function public.admin_undo_check_in(p_ticket_id uuid, p_admin_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t public.tickets%rowtype;
begin
  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_t.status <> 'checked_in' then
    return jsonb_build_object('result', 'not_checked_in');
  end if;

  update public.tickets
     set status = 'valid', checked_in_at = null, checked_in_device = null
   where id = p_ticket_id;

  insert into public.check_in_log (event_id, ticket_id, device_id, device_name, action, method, synced_at)
  values (v_t.event_id, p_ticket_id, 'admin', coalesce(p_admin_name, ''), 'undo', 'admin', now());

  return jsonb_build_object('result', 'ok');
end;
$$;

revoke all on function public.create_comp_order(jsonb, jsonb)      from public, anon, authenticated;
revoke all on function public.admin_undo_check_in(uuid, text)      from public, anon, authenticated;
grant execute on function public.create_comp_order(jsonb, jsonb),
                          public.admin_undo_check_in(uuid, text)
  to service_role;
