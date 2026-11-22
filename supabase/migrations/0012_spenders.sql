-- =====================================================================
-- UI round 2: "spenders" in the expense log (SPEC §13)
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0002_expenses.sql first.
-- =====================================================================

-- eboard  = e-board member: in the expense log AND can log in to admin.
-- spender = club member who spends money for the group: in the expense
--           log only. Spenders can NEVER log in to admin.
alter table public.eboard_members
  add column if not exists role text not null default 'eboard'
  check (role in ('eboard', 'spender'));
