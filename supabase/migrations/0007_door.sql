-- =====================================================================
-- Step 4: door scanner (check-ins, door PIN logins, door-sale counter)
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0004_orders.sql first.
-- =====================================================================

-- ---------- check-in log ------------------------------------------------
-- Every check-in (spec §6 CheckInLog). The ticket row itself says whether
-- it's checked in; this keeps the history (who, which phone, when).
-- synced_at / conflict are for offline mode (step 5).
create table public.check_in_log (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  device_id    text not null,
  device_name  text not null default '',
  action       text not null default 'check_in' check (action in ('check_in', 'undo')),
  method       text not null default 'scan' check (method in ('scan', 'lookup')),
  synced_at    timestamptz,
  conflict     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index check_in_log_event_idx  on public.check_in_log (event_id, created_at);
create index check_in_log_ticket_idx on public.check_in_log (ticket_id);

-- ---------- door PIN login attempts ------------------------------------
-- Used for the wrong-PIN lockout (spec §8: rate-limited door PIN).
create table public.door_logins (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references public.events (id) on delete cascade,
  ip          text not null default '',
  name_typed  text not null default '',
  success     boolean not null,
  created_at  timestamptz not null default now()
);

create index door_logins_ip_idx      on public.door_logins (ip, created_at);
create index door_logins_created_idx on public.door_logins (created_at);

-- ---------- door-sale counter (D32) --------------------------------------
-- Count only: +1 / -1 taps per phone. No amounts, no names, no payment info.
-- The event's door sales = the sum of all deltas.
create table public.door_sale_counts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  device_id   text not null,
  delta       integer not null check (delta in (-1, 1)),
  created_at  timestamptz not null default now()
);

create index door_sale_counts_event_idx on public.door_sale_counts (event_id, device_id);

-- ---------- security --------------------------------------------------
alter table public.check_in_log     enable row level security;
alter table public.door_logins      enable row level security;
alter table public.door_sale_counts enable row level security;

revoke all on public.check_in_log, public.door_logins, public.door_sale_counts from anon, authenticated;
grant  all on public.check_in_log, public.door_logins, public.door_sale_counts to service_role;

-- ---------- check a ticket in (called by the server only) ----------------
-- Locks the ticket so two phones scanning it at the same moment can't both
-- get green: the FIRST scan wins (D15), the other sees "already used".
-- result: ok / used / wrong_event / void / not_found
create or replace function public.door_check_in(
  p_event_id uuid, p_ticket_id uuid, p_device_id text, p_device_name text, p_method text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t      public.tickets%rowtype;
  v_o      public.orders%rowtype;
  v_type   text;
  v_event  text;
  v_name   text;
begin
  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_t.event_id <> p_event_id then
    select name into v_event from public.events where id = v_t.event_id;
    return jsonb_build_object('result', 'wrong_event', 'event_name', v_event);
  end if;

  select * into v_o from public.orders where id = v_t.order_id;
  select name into v_type from public.ticket_types where id = v_t.ticket_type_id;
  v_name := trim(v_o.buyer_first_name || ' ' || v_o.buyer_last_name);

  if v_t.status = 'void' or v_o.status not in ('paid', 'comp') then
    return jsonb_build_object('result', 'void', 'name', v_name, 'type', v_type);
  end if;

  if v_t.status = 'checked_in' then
    return jsonb_build_object('result', 'used', 'name', v_name, 'type', v_type,
      'checked_in_at', v_t.checked_in_at, 'device_name', v_t.checked_in_device);
  end if;

  update public.tickets
     set status = 'checked_in', checked_in_at = now(), checked_in_device = p_device_name
   where id = p_ticket_id;

  insert into public.check_in_log (event_id, ticket_id, device_id, device_name, action, method, synced_at)
  values (p_event_id, p_ticket_id, p_device_id, p_device_name, 'check_in',
          case when p_method = 'lookup' then 'lookup' else 'scan' end, now());

  return jsonb_build_object('result', 'ok', 'name', v_name, 'type', v_type,
    'short_code', v_t.short_code, 'order_no', v_o.order_no);
end;
$$;

-- ---------- door counts for the scanner's top bar ------------------------
create or replace function public.door_stats(p_event_id uuid, p_device_id text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'sold',        (select count(*) from public.tickets t join public.orders o on o.id = t.order_id
                     where t.event_id = p_event_id and t.status <> 'void' and o.status in ('paid', 'comp')),
    'checked_in',  (select count(*) from public.tickets t
                     where t.event_id = p_event_id and t.status = 'checked_in'),
    'door_sales',  (select coalesce(sum(delta), 0) from public.door_sale_counts where event_id = p_event_id),
    'door_sales_mine', (select coalesce(sum(delta), 0) from public.door_sale_counts
                     where event_id = p_event_id and device_id = p_device_id)
  );
$$;

-- ---------- door-sale +1 / -1 ------------------------------------------
-- A phone can only take back its own taps, so its count never goes below 0
-- (and the event total never does either).
create or replace function public.door_sale_change(p_event_id uuid, p_device_id text, p_delta integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_mine integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'BAD_DELTA';
  end if;
  -- One change at a time per phone, so two fast taps can't both pass the check.
  perform pg_advisory_xact_lock(hashtext(p_event_id::text || '|' || p_device_id));
  select coalesce(sum(delta), 0) into v_mine from public.door_sale_counts
   where event_id = p_event_id and device_id = p_device_id;
  if p_delta = 1 or v_mine > 0 then
    insert into public.door_sale_counts (event_id, device_id, delta) values (p_event_id, p_device_id, p_delta);
  end if;
  return public.door_stats(p_event_id, p_device_id);
end;
$$;

revoke all on function public.door_check_in(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.door_stats(uuid, text)                     from public, anon, authenticated;
revoke all on function public.door_sale_change(uuid, text, integer)      from public, anon, authenticated;
grant execute on function public.door_check_in(uuid, uuid, text, text, text),
                          public.door_stats(uuid, text),
                          public.door_sale_change(uuid, text, integer)
  to service_role;
