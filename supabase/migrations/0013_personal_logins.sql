-- =====================================================================
-- Personal logins (2026-11-22): everyone signs in to admin AND the door
-- app with their own username (first initial + last name, e.g. "rchen")
-- and their own 6-digit PIN. Replaces the shared leadership PIN and the
-- per-show door PIN.
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Needs 0012_spenders.sql first.
--
-- PINs are NOT in this file (it's in git). Only salted PBKDF2 hashes are
-- stored, and they're set from the admin Settings page or the private
-- setup file (private/ is gitignored).
-- =====================================================================

-- Who can do what:
--   eboard    = admin + door app + expense log
--   spender   = expense log only (no login)
--   volunteer = door app only
alter table public.eboard_members drop constraint if exists eboard_members_role_check;
alter table public.eboard_members add constraint eboard_members_role_check
  check (role in ('eboard', 'spender', 'volunteer'));

alter table public.eboard_members add column if not exists username text;
alter table public.eboard_members add column if not exists pin_hash text;
create unique index if not exists eboard_members_username_key on public.eboard_members (lower(username));

-- Door logins now record who signed in (the name typed is kept for old rows).
alter table public.door_logins add column if not exists member_id uuid references public.eboard_members (id) on delete set null;
alter table public.door_logins add column if not exists username_typed text not null default '';
