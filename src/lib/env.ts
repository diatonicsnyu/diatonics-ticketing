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
  /** Leadership PIN for /admin (4–8 digits). One shared PIN for now (SPEC D18). */
  get adminPin() {
    const pin = required("ADMIN_PIN", process.env.ADMIN_PIN).trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error("ADMIN_PIN must be 4–8 digits.");
    return pin;
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
};
