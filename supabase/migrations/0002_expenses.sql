-- =====================================================================
-- E-board expense tracker (admin only)
-- Who on the e-board paid for what out of pocket, and whether the group
-- has paid them back yet.
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- =====================================================================

-- ---------- e-board members --------------------------------------------
-- "active = false" hides someone from the "Who paid?" list (e.g. after
-- they leave the e-board) but keeps their past expenses.
create table public.eboard_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- expenses ------------------------------------------------------
create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  -- "restrict": a member who has expenses can't be deleted, only hidden.
  member_id      uuid not null references public.eboard_members (id) on delete restrict,
  -- The day they paid (a date, no time).
  spent_on       date not null,
  description    text not null,
  -- Allowed values are checked by the app (src/lib/expense-categories.ts).
  category       text not null default 'Other',
  amount_cents   integer not null check (amount_cents > 0),
  -- NULL = still owed. Set = the group paid them back at this time.
  reimbursed_at  timestamptz,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index expenses_member_idx   on public.expenses (member_id);
create index expenses_spent_on_idx on public.expenses (spent_on desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------- security --------------------------------------------------------
-- Private: RLS on with NO public policies, so the public site's key can't
-- read anything. Only the admin pages (secret key, after the admin login
-- check) can read or write.
alter table public.eboard_members enable row level security;
alter table public.expenses       enable row level security;

revoke all on public.eboard_members, public.expenses from anon, authenticated;
grant  all on public.eboard_members, public.expenses to service_role;

-- ---------- current e-board ------------------------------------------------
insert into public.eboard_members (name, sort_order) values
  ('Rachel Chen', 1),
  ('Lila Erol', 2),
  ('Callum Robechek', 3),
  ('Sophia Shahrooz', 4),
  ('Isaac Kan', 5),
  ('Victoria Zou', 6)
on conflict (name) do nothing;
