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
import { ticketQrToken } from "@/lib/ticket-token";
import { sendDonationReceipt, sendTicketEmail } from "@/lib/ticket-mail";

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

/**
 * Donate page (spec §3.3): saves a pending donation and opens Stripe's
 * checkout. The donor pays exactly `amountCents`; the group absorbs Stripe's
 * fee (D11). No event, no tickets, nothing to hold.
 */
export async function startStripeDonationCheckout(
  amountCents: number,
  buyer: Buyer,
  recognize: boolean,
  displayName: string,
): Promise<{ url: string } | { error: string }> {
  const db = adminDb();
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

  let orderId: string | null = null;
  let orderNo = "";
  for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
    orderNo = newOrderNumber();
    const { data, error } = await db
      .from("orders")
      .insert({
        order_no: orderNo,
        kind: "donation",
        event_id: null,
        status: "pending",
        payment_method: "stripe",
        buyer_first_name: buyer.firstName,
        buyer_last_name: buyer.lastName,
        buyer_email: buyer.email,
        buyer_phone: buyer.phone,
        donation_cents: amountCents,
        total_cents: amountCents,
        recognize,
        display_name: recognize ? displayName : "",
        hold_expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();
    if (!error) {
      orderId = data.id as string;
      break;
    }
    if (error.code === "23505") continue; // that reference number is taken: pick another
    console.error("donation order insert failed:", error);
    return { error: "Something went wrong. Please try again." };
  }
  if (!orderId) return { error: "Something went wrong. Please try again." };

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      managed_payments: { enabled: false }, // see startStripeTicketCheckout
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            // Never say "tax-deductible": the group isn't a 501(c)(3).
            product_data: { name: "Donation to the Diatonics", description: "Thank you for supporting the group!" },
          },
        },
      ],
      customer_email: buyer.email,
      client_reference_id: orderId,
      metadata: { order_id: orderId, order_no: orderNo, kind: "donation" },
      payment_intent_data: {
        description: `Diatonics · Donation · Ref ${orderNo}`,
        metadata: { order_id: orderId, order_no: orderNo, kind: "donation" },
      },
      submit_type: "donate",
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      success_url: `${env.siteUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/donate`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    const { error } = await db.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
    if (error) throw error;
    return { url: session.url };
  } catch (err) {
    await db.from("orders").update({ status: "expired" }).eq("id", orderId);
    console.error("Stripe donation checkout failed:", err);
    return { error: "We couldn't open the payment page. Please try again in a moment." };
  }
}

export type DonationOrder = {
  id: string;
  orderNo: string;
  status: "pending" | "paid" | "expired" | "refunded" | "comp";
  firstName: string;
  email: string;
  amountCents: number;
  paidAt: string | null;
  createdAt: string;
  recognize: boolean;
  displayName: string;
};

const DONATION_FIELDS = "id, order_no, kind, status, buyer_first_name, buyer_email, donation_cents, paid_at, created_at, recognize, display_name";

function toDonationOrder(row: Record<string, unknown> | null): DonationOrder | null {
  if (!row || row.kind !== "donation") return null;
  return {
    id: row.id as string,
    orderNo: row.order_no as string,
    status: row.status as DonationOrder["status"],
    firstName: row.buyer_first_name as string,
    email: row.buyer_email as string,
    amountCents: row.donation_cents as number,
    paidAt: row.paid_at as string | null,
    createdAt: row.created_at as string,
    recognize: row.recognize as boolean,
    displayName: row.display_name as string,
  };
}

/** A Donate-page donation by its Stripe checkout id (only the donor has it). */
export async function getDonationBySession(sessionId: string): Promise<DonationOrder | null> {
  const { data, error } = await adminDb().from("orders").select(DONATION_FIELDS).eq("stripe_session_id", sessionId).maybeSingle();
  if (error) throw error;
  return toDonationOrder(data);
}

/** A Donate-page donation by id. Only call with an id from the server itself. */
export async function getDonationById(orderId: string): Promise<DonationOrder | null> {
  if (!UUID.test(orderId)) return null;
  const { data, error } = await adminDb().from("orders").select(DONATION_FIELDS).eq("id", orderId).maybeSingle();
  if (error) throw error;
  return toDonationOrder(data);
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
    const { data: orderId, error } = await db.rpc("mark_order_paid", {
      p_session_id: session.id,
      p_payment_intent_id: typeof pi === "string" ? pi : (pi?.id ?? null),
    });
    if (error) throw error;
    const fee = stripeFeeCents(pi);
    if (fee != null) {
      await db.from("orders").update({ stripe_fee_cents: fee }).eq("stripe_session_id", session.id).is("stripe_fee_cents", null);
    }
    // Email the tickets (only the first call actually sends). A failed email
    // never undoes the payment: it's logged, the next call (webhook retry or
    // confirmation page refresh) tries again, and "Lost your ticket?" works.
    // Donate-page donations get a receipt instead (same once-only rule).
    if (typeof orderId === "string") {
      if (session.metadata?.kind === "donation") {
        await sendDonationReceipt(orderId).catch((err) => console.error("Donation receipt failed:", err));
      } else {
        await sendTicketEmail(orderId).catch((err) => console.error("Ticket email failed:", err));
      }
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

// ---------- loading an order (confirmation page, tickets page, emails) ----

export type ConfirmedOrder = {
  id: string;
  orderNo: string;
  status: "pending" | "paid" | "expired" | "refunded" | "comp";
  buyerFirstName: string;
  buyerName: string;
  buyerEmail: string;
  donationCents: number;
  recognize: boolean;
  displayName: string;
  event: { id: string; name: string; slug: string; starts_at: string; doors_at: string | null; venue: string };
  /** qrToken is the signed code inside the QR (lib/ticket-token.ts). */
  tickets: { id: string; shortCode: string; typeName: string; status: string; qrToken: string }[];
};

type OrderQueryRow = {
  id: string;
  order_no: string;
  status: ConfirmedOrder["status"];
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_email: string;
  donation_cents: number;
  recognize: boolean;
  display_name: string;
  events: ConfirmedOrder["event"] | null;
  tickets: { id: string; short_code: string; status: string; created_at: string; ticket_types: { name: string; sort_order: number } | null }[];
};

const ORDER_FIELDS =
  "id, order_no, status, buyer_first_name, buyer_last_name, buyer_email, donation_cents, recognize, display_name, tickets(id, short_code, status, created_at, ticket_types(name, sort_order))";
const EVENT_FIELDS = "(id, name, slug, starts_at, doors_at, venue)";

function toConfirmedOrder(row: OrderQueryRow): ConfirmedOrder | null {
  if (!row.events) return null;
  const ev = row.events;
  const tickets = [...row.tickets]
    .filter((t) => t.status !== "void")
    .sort((a, b) => (a.ticket_types?.sort_order ?? 0) - (b.ticket_types?.sort_order ?? 0) || a.created_at.localeCompare(b.created_at))
    .map((t) => ({
      id: t.id,
      shortCode: t.short_code,
      typeName: t.ticket_types?.name ?? "Ticket",
      status: t.status,
      qrToken: ticketQrToken(ev.id, t.id),
    }));

  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    buyerFirstName: row.buyer_first_name,
    buyerName: `${row.buyer_first_name} ${row.buyer_last_name}`.trim(),
    buyerEmail: row.buyer_email,
    donationCents: row.donation_cents,
    recognize: row.recognize,
    displayName: row.display_name,
    event: ev,
    tickets,
  };
}

/**
 * Loads an order by its Stripe checkout id (only the buyer has it: Stripe
 * puts it in the link back to our site).
 */
export async function getOrderBySession(sessionId: string): Promise<ConfirmedOrder | null> {
  const { data, error } = await adminDb()
    .from("orders")
    .select(`${ORDER_FIELDS}, events${EVENT_FIELDS}`)
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toConfirmedOrder(data as unknown as OrderQueryRow) : null;
}

/** Loads an order by id. Only call with an id from a signed link or from the server itself. */
export async function getOrderById(orderId: string): Promise<ConfirmedOrder | null> {
  if (!UUID.test(orderId)) return null;
  const { data, error } = await adminDb()
    .from("orders")
    .select(`${ORDER_FIELDS}, events${EVENT_FIELDS}`)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data ? toConfirmedOrder(data as unknown as OrderQueryRow) : null;
}

/**
 * A buyer's paid tickets for shows that haven't ended yet ("Lost your
 * ticket?"), soonest show first. A show counts as over 12 hours after it
 * starts [assumed].
 */
export async function getUpcomingOrdersByEmail(email: string): Promise<ConfirmedOrder[]> {
  const since = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
  const { data, error } = await adminDb()
    .from("orders")
    .select(`${ORDER_FIELDS}, events!inner${EVENT_FIELDS}`)
    .eq("kind", "tickets")
    .in("status", ["paid", "comp"])
    // Case-insensitive exact match: escape ilike's wildcards.
    .ilike("buyer_email", email.replace(/[\\%_]/g, (c) => "\\" + c))
    .gt("events.starts_at", since);
  if (error) throw error;
  return (data as unknown as OrderQueryRow[])
    .map(toConfirmedOrder)
    .filter((o): o is ConfirmedOrder => !!o && o.tickets.length > 0)
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
}
