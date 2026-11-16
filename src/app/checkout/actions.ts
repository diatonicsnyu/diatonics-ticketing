"use server";

import { redirect } from "next/navigation";
import { getPublicEventBySlug, salesOpen, ticketsRemaining } from "@/lib/events";
import { priceOrder, parseDonation, isValidEmail, MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { newOrderNumber, newShortCode } from "@/lib/shortcode";
import { isDemo } from "@/lib/demo";
import { encodeDemoOrder, type DemoOrder } from "@/lib/demo-order";

export type CheckoutState = { error?: string };

function readBuyer(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim().slice(0, 100),
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
  if (donationCents === null) return { error: "Custom donation must be between $1 and $1,000." };

  const order = priceOrder(lines, donationCents);
  if (order.ticketCount === 0) return { error: "Pick at least one ticket." };
  if (order.ticketCount > MAX_TICKETS_PER_ORDER) return { error: `You can buy up to ${MAX_TICKETS_PER_ORDER} tickets per order.` };
  const left = ticketsRemaining(event);
  if (left != null && order.ticketCount > left) return { error: `Only ${left} tickets are left.` };

  const buyer = readBuyer(formData);
  if (!buyer.name) return { error: "Please enter your name." };
  if (!isValidEmail(buyer.email)) return { error: "Please enter a valid email so we can send your tickets." };

  if (!isDemo()) {
    // Step 2 replaces this with: hold the tickets, create a Stripe Checkout
    // session (test mode), and redirect to Stripe.
    return { error: "Online checkout is switched on in Step 2." };
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
    recognize: false,
    displayName: "",
    tickets: order.lines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ code: newShortCode(), typeName: l.name }))),
  };
  redirect(`/demo/checkout?o=${encodeDemoOrder(demo)}`);
}

/** "Continue" on the Donate page. The donor pays exactly the amount picked (spec D11). */
export async function startDonationCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const amount = parseDonation(String(formData.get("donation") ?? ""), String(formData.get("donation_custom") ?? ""));
  if (!amount) return { error: "Pick an amount, or enter a custom amount between $1 and $1,000." };

  const buyer = readBuyer(formData);
  if (!buyer.name) return { error: "Please enter your name." };
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
