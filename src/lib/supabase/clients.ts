import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/*
 * There are two ways this app talks to Supabase. Both run on the server
 * only; the browser never talks to Supabase directly.
 *
 * 1. publicDb()  - publishable key, no login. Row Level Security limits it to
 *                  published events. Used by public pages, so a bug there can
 *                  never leak drafts or private data.
 * 2. adminDb()   - SECRET key, bypasses RLS. Only call it AFTER requireAdmin()
 *                  (see lib/auth.ts) has confirmed someone is logged in, or
 *                  from the admin login itself.
 */

export function publicDb() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminDb() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
