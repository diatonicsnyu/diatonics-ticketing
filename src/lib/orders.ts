import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/supabase/clients";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { newOrderNumber } from "@/lib/shortcode";
import { allInCents, formatCents, SERVICE_FEE_CENTS } from "@/lib/money";
import { formatShort } from "@/lib/time";
import type { EventRow } from "@/lib/events";
import type { PricedOrder } from "@/lib/order";

/*
 * Real ticket orders (Step 2). How a purchase flows:
 *  1. startStripeTicketCheckout(): saves a "pending" order that HOLDS the
 *     tickets, then sends the buyer to Stripe's hosted Checkout page.
 *  2. Buyer pays -> Stripe calls our webhook AND sends the buyer to the
 *     confirmation page. Both call finalizeCheckoutSession(), which marks the
 *     order paid and creates the tickets (only once, however many calls).
 *  3. Buyer leaves / card declined / 30 min pass -> the order is "expired"
 *     and its tickets are free again.
 * The server re-checks everything; the browser's numbers are never trusted.
 */

/**
 * Tickets are held while the buyer is on Stripe. Stripe's Checkout pages
 * must stay open at least 30 minutes, so the hold is a minute longer and
 * the Stripe page expires at the same moment as the hold (spec §3.2).
 */
const HOLD_MINUTES = 31;

export type Buyer = { firstName: string; lastName: string; name: string; email: string; phone: string };

/** Errors raised by create_pending_order (supabase/migrations/0004_orders.sql). */
const DB_ERRORS: Record<string, string> = {
  SALES_CLOSED: "Online sales for this show are closed.",
  SOLD_OUT: "Sorry, there aren't that many tickets left. Try a smaller number.",
  TYPE_SOLD_OUT: "Sorry, there aren't enough of that ticket type left. Try a smaller number.",
  BAD_QUANTITY: "You can buy between 1 and 10 tickets per order.",
  BAD_TYPE: "That ticket type isn't available anymore. Please refresh the page.",
};

/**
 * Saves the pending order (holding the tickets) and creates the Stripe
 * Checkout page. Returns the Stripe URL to send the buyer to, or an error
 * message to show on the event page.
 */
export async function startStripeTicketCheckout(
  event: EventRow,
  order: PricedOrder,
  buyer: Buyer,
  recognize: boolean,
  displayName: string,
): Promise<{ url: string } | { error: string }> {
  const db = adminDb();
  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const lines = order.lines.map((l) => ({ ticket_type_id: l.ticketTypeId, quantity: l.quantity, price_cents: l.priceCents }));

  // 1. Save the pending order. The database locks the event while it checks
  //    capacity, so two buyers can't both get the last ticket.
  let orderId: string | null = null;
  let orderNo = "";
  for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
    orderNo = newOrderNumber();
    const { data, error } = await db.rpc("create_pending_order", {
      p_order: {
        event_id: event.id,
        order_no: orderNo,
        first_name: buyer.firstName,
        last_name: buyer.lastName,
        email: buyer.email,
        phone: buyer.phone,
        tickets_subtotal_cents: order.ticketsSubtotalCents,
        service_fee_cents: order.serviceFeeCents,
        donation_cents: order.donationCents,
        total_cents: order.totalCents,
        recognize,
        display_name: displayName,
        hold_expires_at: holdUntil.toISOString(),
      },
      p_lines: lines,
    });
    if (!error) {
      orderId = data as string;
      break;
    }
    const known = Object.keys(DB_ERRORS).find((k) => error.message.includes(k));
    if (known) return { error: DB_ERRORS[known] };
    if (error.code === "23505") continue; // that order number is taken: pick another
    console.error("create_pending_order failed:", error);
    return { error: "Something went wrong starting checkout. Please try again." };
  }
  if (!orderId) return { error: "Something went wrong starting checkout. Please try again." };

  // 2. Create Stripe's checkout page. Prices are shown all-in (spec D4).
  const when = formatShort(event.starts_at);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency: "usd",
      unit_amount: allInCents(l.priceCents),
      product_data: {
        name: `${l.name} ticket · ${event.name}`,
        description: `${when} · General admission · ${formatCents(allInCents(l.priceCents))} each, includes ${formatCents(SERVICE_FEE_CENTS)} service fee`,
      },
    },
  }));
  if (order.donationCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: order.donationCents,
        // Never say "tax-deductible": the group isn't a 501(c)(3).
        product_data: { name: "Donation to the Diatonics", description: "Thank you for supporting the group!" },
      },
    });
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      // Stripe "Managed Payments" (Stripe as merchant of record, for digital
      // products) is on by default for new accounts. It adds fees and blocks
      // custom_text below, so it's always off for ticket sales.
      managed_payments: { enabled: false },
      line_items: lineItems,
      customer_email: buyer.email,
      client_reference_id: orderId,
      metadata: { order_id: orderId, order_no: orderNo },
      payment_intent_data: {
        description: `Diatonics · ${event.name} · Order ${orderNo}`,
        metadata: { order_id: orderId, order_no: orderNo },
      },
      // Payment methods (cards, Apple Pay, Google Pay, Cash App Pay) come from
      // the Stripe Dashboard settings, so none are listed here.
      custom_text: { submit: { message: "No refunds. All sales final." } },
      expires_at: Math.floor(holdUntil.getTime() / 1000),
      success_url: `${env.siteUrl}/orders/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/checkout/cancel?order=${orderId}`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    const { error } = await db.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
    if (error) throw error;
    return { url: session.url };
  } catch (err) {
    // Couldn't start payment: release the held tickets right away.
    await db.from("orders").update({ status: "expired" }).eq("id", orderId);
    console.error("Stripe checkout session failed:", err);
    return { error: "We couldn't open the payment page. Please try again in a moment." };
  }
}

/** Stripe's fee for a payment, if Stripe has worked it out yet. */
function stripeFeeCents(pi: Stripe.PaymentIntent | string | null): number | null {
  if (!pi || typeof pi === "string") return null;
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  return bt.fee;
}

/**
 * Asks Stripe about a checkout and updates our order to match. If it's paid,
 * the order becomes "paid" and its tickets are created. Safe to call any
 * number of times (webhook + confirmation page both call it).
 */
export async function finalizeCheckoutSession(sessionId: string): Promise<"paid" | "pending" | "expired"> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.latest_charge.balance_transaction"],
  });
  const db = adminDb();

  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
    const pi = session.payment_intent as Stripe.PaymentIntent | string | null;
    const { error } = await db.rpc("mark_order_paid", {
      p_session_id: session.id,
      p_payment_intent_id: typeof pi === "string" ? pi : (pi?.id ?? null),
    });
    if (error) throw error;
    const fee = stripeFeeCents(pi);
    if (fee != null) {
      await db.from("orders").update({ stripe_fee_cents: fee }).eq("stripe_session_id", session.id).is("stripe_fee_cents", null);
    }
    return "paid";
  }

  if (session.status === "expired") {
    await markSessionExpired(session.id);
    return "expired";
  }
  return "pending";
}

/** Releases the held tickets of a checkout that ended without payment. */
export async function markSessionExpired(sessionId: string) {
  const { error } = await adminDb()
    .from("orders")
    .update({ status: "expired" })
    .eq("stripe_session_id", sessionId)
    .eq("status", "pending");
  if (error) throw error;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The buyer clicked "back" on Stripe's page. Closes that Stripe page and
 * frees the tickets right away (instead of waiting 30 minutes). Returns the
 * event's slug so we can send them back to it.
 */
export async function cancelPendingOrder(orderId: string): Promise<string | null> {
  if (!UUID.test(orderId)) return null;
  const { data } = await adminDb()
    .from("orders")
    .select("status, stripe_session_id, events(slug)")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  const slug = (data.events as unknown as { slug: string } | null)?.slug ?? null;

  if (data.status === "pending" && data.stripe_session_id) {
    try {
      await stripe().checkout.sessions.expire(data.stripe_session_id);
      await markSessionExpired(data.stripe_session_id);
    } catch {
      // Stripe says it can't be closed (e.g. it was actually paid a moment
      // ago): sync with Stripe instead, so a real payment is never lost.
      await finalizeCheckoutSession(data.stripe_session_id).catch(() => {});
    }
  }
  return slug;
}

// ---------- confirmation page -------------------------------------------

export type ConfirmedOrder = {
  orderNo: string;
  status: "pending" | "paid" | "expired" | "refunded" | "comp";
  buyerName: string;
  buyerEmail: string;
  donationCents: number;
  recognize: boolean;
  displayName: string;
  event: { name: string; slug: string; starts_at: string; venue: string };
  tickets: { id: string; shortCode: string; typeName: string }[];
};

type OrderQueryRow = {
  order_no: string;
  status: ConfirmedOrder["status"];
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_email: string;
  donation_cents: number;
  recognize: boolean;
  display_name: string;
  events: { name: string; slug: string; starts_at: string; venue: string } | null;
  tickets: { id: string; short_code: string; created_at: string; ticket_types: { name: string; sort_order: number } | null }[];
};

/**
 * Loads an order by its Stripe checkout id (only the buyer has it: Stripe
 * puts it in the link back to our site).
 */
export async function getOrderBySession(sessionId: string): Promise<ConfirmedOrder | null> {
  const { data, error } = await adminDb()
    .from("orders")
    .select(
      "order_no, status, buyer_first_name, buyer_last_name, buyer_email, donation_cents, recognize, display_name, events(name, slug, starts_at, venue), tickets(id, short_code, created_at, ticket_types(name, sort_order))",
    )
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as OrderQueryRow;
  if (!row.events) return null;

  const tickets = [...row.tickets]
    .sort((a, b) => (a.ticket_types?.sort_order ?? 0) - (b.ticket_types?.sort_order ?? 0) || a.created_at.localeCompare(b.created_at))
    .map((t) => ({ id: t.id, shortCode: t.short_code, typeName: t.ticket_types?.name ?? "Ticket" }));

  return {
    orderNo: row.order_no,
    status: row.status,
    buyerName: `${row.buyer_first_name} ${row.buyer_last_name}`.trim(),
    buyerEmail: row.buyer_email,
    donationCents: row.donation_cents,
    recognize: row.recognize,
    displayName: row.display_name,
    event: row.events,
    tickets,
  };
}
