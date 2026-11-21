"use server";

import { redirect } from "next/navigation";
import { getPublicEventBySlug, salesOpen, getTicketsRemaining } from "@/lib/events";
import { startStripeTicketCheckout } from "@/lib/orders";
import { priceOrder, parseDonation, isValidEmail, MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { newOrderNumber, newShortCode } from "@/lib/shortcode";
import { isDemo } from "@/lib/demo";
import { encodeDemoOrder, type DemoOrder } from "@/lib/demo-order";

export type CheckoutState = { error?: string };

function readBuyer(formData: FormData) {
  const firstName = String(formData.get("first_name") ?? "").trim().slice(0, 50);
  const lastName = String(formData.get("last_name") ?? "").trim().slice(0, 50);
  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(), // full name, for tickets and lookups

    email: String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200),
    phone: String(formData.get("phone") ?? "").trim().slice(0, 30),
  };
}

/**
 * "Continue to payment" on an event page.
 * Re-checks EVERYTHING on the server (never trust the browser's numbers):
 * sales still open, quantities, 10-ticket max, tickets left, buyer info.
 */
export async function startTicketCheckout(
  slug: string,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const event = await getPublicEventBySlug(slug);
  if (!event) return { error: "This show isn't available." };
  if (!salesOpen(event)) return { error: "Online sales for this show are closed." };

  const lines = event.ticket_types.map((t) => {
    const raw = String(formData.get(`qty_${t.id}`) ?? "0");
    const quantity = /^\d+$/.test(raw) ? Number(raw) : -1;
    return { ticketTypeId: t.id, name: t.name, priceCents: t.price_cents, quantity, limit: t.quantity_limit };
  });
  if (lines.some((l) => l.quantity < 0)) return { error: "Please pick a valid number of tickets." };
  for (const l of lines) {
    if (l.limit != null && l.quantity > l.limit) return { error: `Only ${l.limit} ${l.name} tickets are available.` };
  }

  const donationCents = parseDonation(
    String(formData.get("donation") ?? ""),
    String(formData.get("donation_custom") ?? ""),
  );
  if (donationCents === null) return { error: "Custom donation must be $0 (no donation) or between $1 and $1,000." };

  const order = priceOrder(lines, donationCents);
  if (order.ticketCount === 0) return { error: "Pick at least one ticket." };
  if (order.ticketCount > MAX_TICKETS_PER_ORDER) return { error: `You can buy up to ${MAX_TICKETS_PER_ORDER} tickets per order.` };
  // Quick check for a friendly message. The database checks again, under a
  // lock, when it holds the tickets (so two buyers can't get the last one).
  const left = await getTicketsRemaining(event);
  if (left != null && order.ticketCount > left) return { error: `Only ${left} tickets are left.` };

  const buyer = readBuyer(formData);
  if (!buyer.firstName || !buyer.lastName) return { error: "Please enter your first and last name." };
  if (!isValidEmail(buyer.email)) return { error: "Please enter a valid email so we can send your tickets." };

  // Opt-in name recognition for the donation add-on (spec D12), same rules as the Donate page.
  const recognize = order.donationCents > 0 && formData.get("recognize") === "on";
  // Ticket checkout has no separate "name to display" box: we show the buyer's first + last name.
  const displayName = recognize ? buyer.name.slice(0, 60) : "";

  if (!isDemo()) {
    // Hold the tickets, create Stripe's checkout page, and send the buyer there.
    const result = await startStripeTicketCheckout(event, order, buyer, recognize, displayName);
    if ("error" in result) return { error: result.error };
    redirect(result.url);
  }

  const demo: DemoOrder = {
    kind: "tickets",
    orderNo: newOrderNumber(),
    createdAt: new Date().toISOString(),
    event: { name: event.name, slug: event.slug, startsAt: event.starts_at, doorsAt: event.doors_at, venue: event.venue },
    lines: order.lines.map((l) => ({ name: l.name, quantity: l.quantity, priceCents: l.priceCents })),
    serviceFeeCents: order.serviceFeeCents,
    donationCents: order.donationCents,
    totalCents: order.totalCents,
    buyer,
    recognize,
    displayName,
    tickets: order.lines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ code: newShortCode(), typeName: l.name }))),
  };
  redirect(`/demo/checkout?o=${encodeDemoOrder(demo)}`);
}

/** "Continue" on the Donate page. The donor pays exactly the amount picked (spec D11). */
export async function startDonationCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const amount = parseDonation(String(formData.get("donation") ?? ""), String(formData.get("donation_custom") ?? ""));
  if (!amount) return { error: "Pick an amount, or enter a custom amount between $1 and $1,000." };

  const buyer = readBuyer(formData);
  if (!buyer.firstName || !buyer.lastName) return { error: "Please enter your first and last name." };
  if (!isValidEmail(buyer.email)) return { error: "Please enter a valid email for your receipt." };

  const recognize = formData.get("recognize") === "on";
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 60);
  if (recognize && !displayName) return { error: "Enter the name you'd like us to display, or uncheck the box." };

  if (!isDemo()) return { error: "Online donations are switched on in Step 7." };

  const demo: DemoOrder = {
    kind: "donation",
    orderNo: newOrderNumber(),
    createdAt: new Date().toISOString(),
    lines: [],
    serviceFeeCents: 0,
    donationCents: amount,
    totalCents: amount,
    buyer,
    recognize,
    displayName: recognize ? displayName : "",
    tickets: [],
  };
  redirect(`/demo/checkout?o=${encodeDemoOrder(demo)}`);
}
