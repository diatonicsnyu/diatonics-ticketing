-- =====================================================================
-- Venmo-style expense log (SPEC D33, §6 LedgerEntry), 2026-11-21
-- One shared log of EXPENSES (someone spent their own money on the group)
-- and REIMBURSEMENTS (money sent back to someone).
-- Per-person balance = expenses - reimbursements = still owed.
-- Needs 0002_expenses.sql first (uses eboard_members).
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- The old "expenses" table is copied over and then left alone (not deleted).
-- =====================================================================

create table public.ledger_entries (
  id                     uuid primary key default gen_random_uuid(),
  kind                   text not null check (kind in ('expense', 'reimbursement')),
  -- expense: who spent the money. reimbursement: who was paid back.
  member_id              uuid not null references public.eboard_members (id) on delete restrict,
  -- Who typed it in (comes from the admin login, never chosen by hand).
  entered_by_member_id   uuid references public.eboard_members (id) on delete set null,
  amount_cents           integer not null check (amount_cents > 0),
  -- What it was for, e.g. "posters".
  description            text not null default '',
  -- Expenses only (allowed values are checked by the app).
  category               text,
  -- e.g. "from ticket sale funds" (reimbursements), or a receipt link.
  note                   text not null default '',
  -- The optional "I got it" from the person who was paid back.
  received_confirmed_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index ledger_entries_created_idx on public.ledger_entries (created_at desc);
create index ledger_entries_member_idx  on public.ledger_entries (member_id);

create trigger ledger_entries_set_updated_at
  before update on public.ledger_entries
  for each row execute function public.set_updated_at();

-- Private: only the server (secret key, after the admin login) can use it.
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;
grant  all on public.ledger_entries to service_role;

-- ---------- copy anything already in the old tracker -----------------------
-- Each old expense becomes an expense entry. If it was marked "paid back",
-- a matching reimbursement entry is added too, so balances stay the same.
insert into public.ledger_entries (kind, member_id, entered_by_member_id, amount_cents, description, category, note, created_at)
select 'expense', e.member_id, e.member_id, e.amount_cents, e.description, e.category, e.notes,
       (e.spent_on::timestamp at time zone 'America/New_York')
from public.expenses e;

insert into public.ledger_entries (kind, member_id, entered_by_member_id, amount_cents, description, note, created_at)
select 'reimbursement', e.member_id, null, e.amount_cents, e.description, 'from ticket sale funds', e.reimbursed_at
from public.expenses e
where e.reimbursed_at is not null;
