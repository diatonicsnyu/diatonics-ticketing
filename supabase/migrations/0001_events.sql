-- =====================================================================
-- Step 1: events + ticket types
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Later steps add new numbered files (0002_..., 0003_...). Run them in order.
-- =====================================================================

-- ---------- events ----------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- URL-friendly id used in public links: /events/<slug>. Never changes after creation.
  slug            text not null unique,
  description     text not null default '',
  venue           text not null,
  starts_at       timestamptz not null,
  doors_at        timestamptz,
  -- NULL = unlimited tickets.
  capacity        integer check (capacity is null or capacity > 0),
  -- Online sales stop at this moment (default: starts_at + 30 min, set by the app).
  sales_close_at  timestamptz not null,
  -- Hash of the door PIN (never the PIN itself). NULL = no PIN set yet.
  door_pin_hash   text,
  -- Door price in cents, DISPLAY ONLY ("At the door $8, Venmo or cash").
  -- The site never sells, tracks or counts door sales. NULL = don't show.
  door_price_cents integer check (door_price_cents is null or door_price_cents >= 0),
  -- Path of the event image inside the "event-images" storage bucket.
  image_path      text,
  -- draft     = only the admin can see it
  -- on_sale   = public, buyable until sales_close_at
  -- closed    = public, but no more sales
  -- cancelled = set by the cancel flow (Step 8)
  status          text not null default 'draft'
                  check (status in ('draft', 'on_sale', 'closed', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);

-- ---------- ticket types ----------------------------------------------
-- e.g. "General" $5, later maybe "Student".
create table public.ticket_types (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  name            text not null,
  -- Face price in cents, WITHOUT the $0.50 service fee (500 = $5.00).
  price_cents     integer not null check (price_cents >= 0),
  -- Optional cap for this type alone. NULL = no per-type cap.
  quantity_limit  integer check (quantity_limit is null or quantity_limit > 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index ticket_types_event_idx on public.ticket_types (event_id);

-- ---------- keep updated_at fresh -------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------- security (Row Level Security) -----------------------------
-- The public site uses the "publishable" key, so it can ONLY see what these
-- policies allow. The admin pages use the secret key on the server, which
-- bypasses RLS, and every admin action checks the admin login first.
alter table public.events       enable row level security;
alter table public.ticket_types enable row level security;

grant select on public.events, public.ticket_types to anon, authenticated;
grant all    on public.events, public.ticket_types to service_role;

-- Drafts are invisible to the public. door_pin_hash is never selected by the
-- public pages, and it is only a hash anyway.
create policy "Public can read published events"
  on public.events for select
  to anon, authenticated
  using (status in ('on_sale', 'closed', 'cancelled'));

create policy "Public can read ticket types of published events"
  on public.ticket_types for select
  to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = ticket_types.event_id
      and e.status in ('on_sale', 'closed', 'cancelled')
  ));

-- ---------- storage bucket for event images ---------------------------
-- Public bucket: anyone can VIEW images by URL. Only the server (secret key)
-- can upload or delete.
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;
