-- =====================================================================
-- Admin login log (name + PIN login, SPEC D18)
-- Every admin login try is written here. The app uses it to lock out
-- PIN guessing, and you can read it to see who logged in and when.
-- Needs 0002_expenses.sql first (names are checked against eboard_members).
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- =====================================================================

create table public.admin_logins (
  id          uuid primary key default gen_random_uuid(),
  -- Who they said they were (the matched e-board member).
  member_id   uuid references public.eboard_members (id) on delete set null,
  name_typed  text not null,
  -- The visitor's IP address, used for the "too many wrong PINs" lockout.
  ip          text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);

create index admin_logins_created_idx on public.admin_logins (created_at desc);
create index admin_logins_ip_idx      on public.admin_logins (ip, created_at desc);

-- ---------- security --------------------------------------------------------
-- Private: RLS on with NO public policies. Only the server (secret key) can
-- read or write it.
alter table public.admin_logins enable row level security;

revoke all on public.admin_logins from anon, authenticated;
grant  all on public.admin_logins to service_role;
