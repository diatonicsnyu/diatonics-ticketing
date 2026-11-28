import "server-only";

/**
 * Reads settings from .env.local (locally) or the host's environment
 * variables (when deployed). Throws a clear message if one is missing,
 * instead of failing somewhere confusing later.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

// Note: each variable is written out literally (process.env.X) on purpose;
// Next.js only picks up env vars it can see written that way.
export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
  },
  get siteUrl() {
    return required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, "");
  },
  /** Signs ticket QR codes and "view my tickets" links. Changing it breaks every ticket already sent. */
  get ticketSecret() {
    const s = required("TICKET_SECRET", process.env.TICKET_SECRET);
    if (s.length < 32) throw new Error("TICKET_SECRET must be at least 32 characters.");
    return s;
  },
  /** Vercel Cron sends this with each daily run (api/cron/daily), so only Vercel can trigger it. */
  get cronSecret() {
    const s = required("CRON_SECRET", process.env.CRON_SECRET);
    if (s.length < 32) throw new Error("CRON_SECRET must be at least 32 characters.");
    return s;
  },
  get resendApiKey() {
    return required("RESEND_API_KEY", process.env.RESEND_API_KEY);
  },
  /** Sender. Until a domain is verified in Resend, only Resend's test address works. */
  get emailFrom() {
    return process.env.EMAIL_FROM?.trim() || "Diatonics Tickets <onboarding@resend.dev>";
  },
  /** Where replies to our emails go (the group Gmail), since the sending address has no inbox of its own. Optional. */
  get emailReplyTo() {
    return process.env.EMAIL_REPLY_TO?.trim() || null;
  },
  /**
   * Test mode: if set, EVERY email goes to this address instead of the buyer
   * (Resend can only deliver to the account's own inbox until a domain is
   * verified). Remove it at go-live.
   */
  get emailTestTo() {
    return process.env.EMAIL_TEST_TO?.trim() || null;
  },
};
