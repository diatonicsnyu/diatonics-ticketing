import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

/**
 * Server-side Stripe client (secret key). The browser never talks to Stripe
 * directly: buyers are sent to Stripe's own hosted Checkout page.
 * Test keys (sk_test_...) until go-live, so no real money moves.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}
