-- =====================================================================
-- Step 7: donations
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0006_email.sql first.
-- =====================================================================

-- A donation receipt is emailed once per donation, however many times
-- Stripe's webhook and the thank-you page both try (same idea as the
-- ticket email's index in 0006_email.sql).
create unique index if not exists email_log_one_donation_receipt
  on public.email_log (order_id) where type = 'donation_receipt' and status <> 'failed';

-- The supporters list on the Donate page reads opt-in names only.
create index if not exists orders_recognize_idx
  on public.orders (paid_at desc) where recognize and status = 'paid';
