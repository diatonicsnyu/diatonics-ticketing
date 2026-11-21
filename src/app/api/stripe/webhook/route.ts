import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { finalizeCheckoutSession, markSessionExpired } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Stripe calls this URL when a checkout is paid or expires. This is what
 * creates the tickets even if the buyer closes the tab before getting back
 * to our confirmation page.
 *
 * Stripe signs every call with the webhook secret (STRIPE_WEBHOOK_SECRET),
 * so fake calls from anyone else are rejected.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text(); // must be the raw text for the signature check

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing signature");
    event = stripe().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("Stripe webhook rejected:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await finalizeCheckoutSession(event.data.object.id);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await markSessionExpired(event.data.object.id);
        break;
      default:
        // Other events aren't used.
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry later, so a temporary database hiccup
    // doesn't lose a paid order.
    console.error(`Stripe webhook ${event.type} failed:`, err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}
