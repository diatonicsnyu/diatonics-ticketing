import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase/clients";

/**
 * The magic link in the login email lands here with a one-time ?code=.
 * We trade it for a login session (stored in cookies), then go to /admin.
 * /admin itself re-checks that this user is really the admin.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  if (code) {
    const supabase = await authClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/admin`);
    console.error("Login link exchange failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/admin/login?error=link-failed`);
}
