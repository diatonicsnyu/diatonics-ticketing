import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/*
 * There are three ways this app talks to Supabase. All of them run on the
 * server only; the browser never talks to Supabase directly.
 *
 * 1. publicDb()  - publishable key, no login. Row Level Security limits it to
 *                  published events. Used by public pages, so a bug there can
 *                  never leak drafts or private data.
 * 2. authClient() - publishable key + the visitor's login cookies. Only used to
 *                  sign the admin in/out and to ask "who is logged in?".
 * 3. adminDb()   - SECRET key, bypasses RLS. Only call it AFTER requireAdmin()
 *                  (see lib/auth.ts) has confirmed the admin is logged in.
 */

export function publicDb() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies. That's fine: src/proxy.ts
          // refreshes the login cookies on every admin request.
        }
      },
    },
  });
}

export function adminDb() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
