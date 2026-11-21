-- =====================================================================
-- Step 2: orders, tickets, and inventory holds (Stripe test mode)
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0001_events.sql first (and 0002/0003 if you use expenses / the admin login).
-- =====================================================================

-- ---------- orders ----------------------------------------------------
-- One row per checkout. It starts as "pending" (tickets held for 30 min
-- while the buyer is on Stripe), becomes "paid" when Stripe confirms the
-- payment, or "expired" if they leave / the card is declined / time runs out.
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  -- Short, human order number like "KM47" (spec §4). Not a secret.
  order_no                  text not null unique,
  kind                      text not null default 'tickets' check (kind in ('tickets', 'donation')),
  event_id                  uuid references public.events (id) on delete restrict,
  status                    text not null default 'pending'
                            check (status in ('pending', 'paid', 'expired', 'refunded', 'comp')),
  payment_method            text not null default 'stripe' check (payment_method in ('stripe', 'comp')),
  buyer_first_name          text not null,
  buyer_last_name           text not null,
  buyer_email               text not null,
  buyer_phone               text not null default '',
  -- Money, all in cents (spec D3: $0.50 fee per ticket, paid by the buyer).
  tickets_subtotal_cents    integer not null default 0 check (tickets_subtotal_cents >= 0),
  service_fee_cents         integer not null default 0 check (service_fee_cents >= 0),
  donation_cents            integer not null default 0 check (donation_cents >= 0),
  total_cents               integer not null default 0 check (total_cents >= 0),
  -- What Stripe kept, filled in after payment (for the dashboard, Step 6).
  stripe_fee_cents          integer,
  -- Donation name recognition (spec D12).
  recognize                 boolean not null default false,
  display_name              text not null default '',
  stripe_session_id         text unique,
  stripe_payment_intent_id  text,
  -- A pending order holds its tickets until this moment.
  hold_expires_at           timestamptz,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index orders_event_status_idx on public.orders (event_id, status);
create index orders_email_idx        on public.orders (lower(buyer_email));

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------- order lines (how many of each ticket type) ----------------
create table public.order_lines (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  -- "restrict": a ticket type that has been bought can't be deleted.
  ticket_type_id  uuid not null references public.ticket_types (id) on delete restrict,
  quantity        integer not null check (quantity between 1 and 10),
  -- Face price per ticket at the time of purchase, WITHOUT the service fee.
  price_cents     integer not null check (price_cents >= 0)
);

create index order_lines_order_idx on public.order_lines (order_id);
create index order_lines_type_idx  on public.order_lines (ticket_type_id);

-- ---------- tickets (one row per person; created once paid) -----------
create table public.tickets (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  event_id           uuid not null references public.events (id) on delete restrict,
  ticket_type_id     uuid not null references public.ticket_types (id) on delete restrict,
  -- Typed at the door if a QR won't scan, e.g. "DIA-7K3F-Q9".
  short_code         text not null unique,
  status             text not null default 'valid' check (status in ('valid', 'checked_in', 'void')),
  checked_in_at      timestamptz,
  checked_in_device  text,
  created_at         timestamptz not null default now()
);

create index tickets_order_idx on public.tickets (order_id);
create index tickets_event_idx on public.tickets (event_id);

-- ---------- security --------------------------------------------------
-- Private: buyer names and emails. RLS on with NO public policies, so the
-- public site's key can't read them. Only the server (secret key) can.
alter table public.orders      enable row level security;
alter table public.order_lines enable row level security;
alter table public.tickets     enable row level security;

revoke all on public.orders, public.order_lines, public.tickets from anon, authenticated;
grant  all on public.orders, public.order_lines, public.tickets to service_role;

-- ---------- inventory -------------------------------------------------
-- Tickets that use up capacity: paid and comp orders, plus pending orders
-- whose 30-minute hold hasn't run out. Expired holds free up by themselves.
create or replace function public.tickets_taken(p_event_id uuid, p_ticket_type_id uuid default null)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(l.quantity), 0)::int
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where o.event_id = p_event_id
    and (p_ticket_type_id is null or l.ticket_type_id = p_ticket_type_id)
    and (o.status in ('paid', 'comp') or (o.status = 'pending' and o.hold_expires_at > now()));
$$;

-- "Tickets left" for the public event page. Returns only a number (NULL =
-- unlimited), never any buyer data, so the public key may call it.
create or replace function public.tickets_left(p_event_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select case when e.capacity is null then null
              else greatest(0, e.capacity - public.tickets_taken(e.id)) end
  from public.events e
  where e.id = p_event_id and e.status in ('on_sale', 'closed', 'cancelled');
$$;

-- ---------- start a checkout (called by the server only) ---------------
-- Locks the event row so two buyers can't grab the last tickets at the
-- same moment, re-checks everything, then saves the pending order + lines.
-- Raises SALES_CLOSED / BAD_QUANTITY / SOLD_OUT / BAD_TYPE / TYPE_SOLD_OUT.
create or replace function public.create_pending_order(p_order jsonb, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_event     public.events%rowtype;
  v_type      public.ticket_types%rowtype;
  v_line      jsonb;
  v_count     integer;
  v_order_id  uuid;
begin
  select * into v_event from public.events where id = (p_order->>'event_id')::uuid for update;
  if not found or v_event.status <> 'on_sale' or now() >= v_event.sales_close_at then
    raise exception 'SALES_CLOSED';
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
    recognize, display_name, hold_expires_at
  ) values (
    p_order->>'order_no', 'tickets', v_event.id, 'pending', 'stripe',
    p_order->>'first_name', p_order->>'last_name', p_order->>'email', coalesce(p_order->>'phone', ''),
    (p_order->>'tickets_subtotal_cents')::int, (p_order->>'service_fee_cents')::int,
    (p_order->>'donation_cents')::int, (p_order->>'total_cents')::int,
    coalesce((p_order->>'recognize')::boolean, false), coalesce(p_order->>'display_name', ''),
    (p_order->>'hold_expires_at')::timestamptz
  )
  returning id into v_order_id;

  insert into public.order_lines (order_id, ticket_type_id, quantity, price_cents)
  select v_order_id, (l->>'ticket_type_id')::uuid, (l->>'quantity')::int, (l->>'price_cents')::int
  from jsonb_array_elements(p_lines) l
  where (l->>'quantity')::int > 0;

  return v_order_id;
end;
$$;

-- ---------- payment confirmed (called by the server only) ---------------
-- Safe to call more than once (Stripe's webhook AND the confirmation page
-- both call it): tickets are only created the first time.
create or replace function public.random_code(n integer)
returns text
language sql volatile
as $$
  -- No look-alike characters (no 0/O, 1/I/L). Short codes aren't secrets.
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, n);
$$;

create or replace function public.mark_order_paid(p_session_id text, p_payment_intent_id text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_line   public.order_lines%rowtype;
  v_code   text;
  i        integer;
begin
  select * into v_order from public.orders where stripe_session_id = p_session_id for update;
  if not found then
    return null;
  end if;
  -- Already handled, or not something a payment should change.
  if v_order.status not in ('pending', 'expired') then
    return v_order.id;
  end if;

  update public.orders
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent_id
   where id = v_order.id;

  for v_line in select * from public.order_lines where order_id = v_order.id loop
    for i in 1..v_line.quantity loop
      loop
        v_code := 'DIA-' || public.random_code(4) || '-' || public.random_code(2);
        begin
          insert into public.tickets (order_id, event_id, ticket_type_id, short_code)
          values (v_order.id, v_order.event_id, v_line.ticket_type_id, v_code);
          exit;
        exception when unique_violation then
          -- That short code is taken: loop and try another.
        end;
      end loop;
    end loop;
  end loop;

  return v_order.id;
end;
$$;

-- ---------- who may call these functions --------------------------------
revoke all on function public.tickets_taken(uuid, uuid)          from public, anon, authenticated;
revoke all on function public.tickets_left(uuid)                 from public;
revoke all on function public.create_pending_order(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.mark_order_paid(text, text)        from public, anon, authenticated;
revoke all on function public.random_code(integer)               from public, anon, authenticated;

grant execute on function public.tickets_left(uuid) to anon, authenticated, service_role;
grant execute on function public.tickets_taken(uuid, uuid), public.create_pending_order(jsonb, jsonb),
                          public.mark_order_paid(text, text), public.random_code(integer)
  to service_role;
