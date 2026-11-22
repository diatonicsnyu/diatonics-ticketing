-- =====================================================================
-- Step 8: reminder emails + cancel / reschedule a show
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0004_orders.sql and 0006_email.sql first.
-- =====================================================================

-- ---------- events: what happened to the date --------------------------
alter table public.events add column if not exists cancelled_at       timestamptz;
alter table public.events add column if not exists rescheduled_at     timestamptz;
-- The date before the latest reschedule (shown to buyers: "moved from ...").
alter table public.events add column if not exists previous_starts_at timestamptz;

-- ---------- orders: refunds for a cancelled show (D20) -------------------
alter table public.orders add column if not exists refunded_at      timestamptz;
alter table public.orders add column if not exists stripe_refund_id text;

-- ---------- email log: reminders and show-change emails -------------------
-- event_id + buyer_email: who a reminder was for (in test mode to_email is
-- the group inbox, so it can't be used for this).
-- for_starts_at: the show time the email was about, so a rescheduled show
-- gets a fresh round of reminders, and each reschedule its own email.
alter table public.email_log add column if not exists event_id      uuid references public.events (id) on delete set null;
alter table public.email_log add column if not exists buyer_email   text;
alter table public.email_log add column if not exists for_starts_at timestamptz;

-- One reminder per buyer per show date, however often the daily job runs.
create unique index if not exists email_log_one_reminder
  on public.email_log (event_id, lower(buyer_email), for_starts_at)
  where type = 'reminder' and status <> 'failed';

-- One cancel / reschedule email per order per show date.
create unique index if not exists email_log_one_notice
  on public.email_log (order_id, type, for_starts_at)
  where type in ('cancel', 'reschedule') and status <> 'failed';

create index if not exists email_log_type_created_idx on public.email_log (type, created_at);
