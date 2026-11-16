"use server";

import { authClient } from "@/lib/supabase/clients";
import { env } from "@/lib/env";

export type LoginState = { sent: boolean; error?: string };

/**
 * Emails a one-time login link ("magic link") to the admin.
 *
 * Only ADMIN_EMAIL ever gets a link. For any other address we show the same
 * "check your email" message, so this form can't be used to discover who
 * the admin is.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { sent: false, error: "Enter your email address." };

  if (email === env.adminEmail) {
    const supabase = await authClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Never create new accounts from this form; the admin user already exists.
        shouldCreateUser: false,
        emailRedirectTo: `${env.siteUrl}/auth/callback`,
      },
    });
    if (error) {
      console.error("Magic link failed:", error.message);
      // Most common cause: Supabase's built-in email rate limit (a few per hour).
      return { sent: false, error: "Couldn't send the link. Wait a few minutes and try again." };
    }
  }
  return { sent: true };
}
