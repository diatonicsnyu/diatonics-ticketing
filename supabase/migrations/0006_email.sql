-- =====================================================================
-- Step 3: ticket emails + "Lost your ticket?" re-sends
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0004_orders.sql first.
-- =====================================================================

-- ---------- email log ---------------------------------------------------
-- One row per email we send (spec §6 EmailLog). Used to:
--  * send each order's ticket email only ONCE, even though Stripe's webhook
--    and the confirmation page both try (see the unique index below);
--  * stay under Resend's free limit of 100 emails a day.
create table public.email_log (
  id          uuid primary key default gen_random_uuid(),
  -- The order it's about. Empty for a re-send that covers several orders.
  order_id    uuid references public.orders (id) on delete cascade,
  type        text not null
              check (type in ('ticket', 'resend', 'reminder', 'cancel', 'reschedule', 'donation_receipt')),
  -- Where it actually went (in test mode: the group inbox, see EMAIL_TEST_TO).
  to_email    text not null,
  status      text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- At most one ticket email per order that's sending or sent. A failed one
-- doesn't count, so the next try (webhook retry / page refresh) sends again.
create unique index email_log_one_ticket_email
  on public.email_log (order_id) where type = 'ticket' and status <> 'failed';
create index email_log_created_idx on public.email_log (created_at);

-- ---------- "Lost your ticket?" requests -----------------------------------
-- Every request is logged, whether or not the email has tickets, so the
-- limit (3 per email per hour) can't be used to find out who bought tickets.
create table public.ticket_resend_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,            -- lowercased
  ip          text not null default '',
  matched     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index ticket_resend_requests_email_idx on public.ticket_resend_requests (email, created_at);
create index ticket_resend_requests_ip_idx    on public.ticket_resend_requests (ip, created_at);

-- ---------- security --------------------------------------------------
-- Private (emails). Only the server (secret key) can read or write.
alter table public.email_log              enable row level security;
alter table public.ticket_resend_requests enable row level security;

revoke all on public.email_log, public.ticket_resend_requests from anon, authenticated;
grant  all on public.email_log, public.ticket_resend_requests to service_role;
