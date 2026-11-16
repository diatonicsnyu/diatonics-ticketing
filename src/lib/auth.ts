import "server-only";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/clients";
import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo";

/**
 * Call at the top of EVERY admin page and EVERY admin Server Action.
 * (Layouts alone don't protect Server Actions, so each action checks too.)
 *
 * Lets the request continue only if the logged-in user's email is exactly
 * ADMIN_EMAIL. Anyone else is sent to the login page.
 */
export async function requireAdmin() {
  // Demo mode (no Supabase yet): there is no real data to protect, so the
  // admin pages open without login. This can never happen once Supabase
  // keys are set, because then isDemo() is false.
  if (isDemo()) return { email: "demo preview" } as { email: string };

  const supabase = await authClient();
  // getUser() asks Supabase to verify the login, so a forged cookie fails.
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();

  if (error || !email) redirect("/admin/login");
  if (email !== env.adminEmail) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not-admin");
  }
  return data.user! as { email: string };
}
