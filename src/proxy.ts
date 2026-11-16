import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs before /admin and /auth requests. Its only job is to keep the admin's
 * login cookies fresh (Supabase logins expire and get silently renewed here).
 *
 * This is NOT the security check. The real check is requireAdmin() in
 * src/lib/auth.ts, which every admin page and action calls.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Demo mode (Supabase not set up yet): nothing to refresh.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Stops shared caches from storing a response that sets login cookies.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Triggers the refresh if the login token is about to expire.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
