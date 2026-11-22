import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { env } from "@/lib/env";
import { buildTicketEmail, type EmailOrder } from "@/lib/email/ticket-email";
import { buildDonationReceipt } from "@/lib/email/donation-email";
import { getDonationById, getOrderById, getUpcomingOrdersByEmail, type ConfirmedOrder } from "@/lib/orders";
import { orderLinkUrl } from "@/lib/ticket-token";

/*
 * Sending ticket emails through Resend (spec §3.4, §3.5, D22, D23).
 * Every email is logged in email_log (supabase/migrations/0006_email.sql).
 */

/** Resend's free plan allows 100 emails a day. */
const DAILY_LIMIT = 100;
/** "Lost your ticket?" stops here, so ticket emails always have room [assumed]. */
const RESEND_DAILY_CAP = 90;
/** "Lost your ticket?" limits: per email (spec §3.5) and per network [assumed]. */
const PER_EMAIL_PER_HOUR = 3;
const PER_IP_PER_HOUR = 10;

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/**
 * Sends up to 100 emails in ONE request (Resend's batch API), so a round of
 * reminders isn't slowed by the 2-requests-a-second limit. Each email still
 * counts toward the 100/day. Returns one result per email, in order.
 */
export async function resendBatch(msgs: OutgoingEmail[]): Promise<SendResult[]> {
  if (msgs.length === 0) return [];
  try {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(msgs.map((m) => ({ from: env.emailFrom, to: [m.to], subject: m.subject, html: m.html, text: m.text }))),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await r.json().catch(() => ({}))) as { data?: { id: string }[]; message?: string };
    if (!r.ok || !Array.isArray(body.data) || body.data.length !== msgs.length) {
      const error = `Resend batch ${r.status}: ${body.message ?? "unexpected reply"}`.slice(0, 500);
      return msgs.map(() => ({ ok: false as const, error }));
    }
    return body.data.map((d) => ({ ok: true as const, id: d.id }));
  } catch (err) {
    const error = `Resend batch failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    return msgs.map(() => ({ ok: false as const, error }));
  }
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

async function resendSend(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok || !body.id) return { ok: false, error: `Resend ${r.status}: ${body.message ?? "no id returned"}`.slice(0, 500) };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: `Resend request failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) };
  }
}

/** Where an email for this buyer actually goes (test mode sends everything to the group inbox). */
export function recipient(buyerEmail: string): { to: string; testFor: string | null } {
  const test = env.emailTestTo;
  return test ? { to: test, testFor: buyerEmail } : { to: buyerEmail, testFor: null };
}

export function toEmailOrder(o: ConfirmedOrder): EmailOrder {
  return {
    orderNo: o.orderNo,
    buyerName: o.buyerName,
    event: o.event,
    tickets: o.tickets.map((t) => ({ shortCode: t.shortCode, typeName: t.typeName, qrToken: t.qrToken })),
    viewUrl: orderLinkUrl(o.id),
    donationCents: o.donationCents,
  };
}

/** Emails sent (or being sent) in the last 24 hours. */
async function emailsLastDay(): Promise<number> {
  return emailsSince(24);
}

/** Emails sent (or being sent) in the last `hours` hours, optionally of one type. */
export async function emailsSince(hours: number, type?: string): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60_000).toISOString();
  if (type) {
    const { count, error } = await adminDb()
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("type", type)
      .neq("status", "failed")
      .gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  }
  const { count, error } = await adminDb()
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .neq("status", "failed")
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Sends an order's ticket email, once. Safe to call many times (Stripe's
 * webhook and the confirmation page both do): the database lets only one
 * call claim it. A failed send is logged and the next call tries again.
 */
export async function sendTicketEmail(orderId: string): Promise<"sent" | "already" | "failed" | "skipped"> {
  const db = adminDb();
  const order = await getOrderById(orderId);
  if (!order || (order.status !== "paid" && order.status !== "comp") || order.tickets.length === 0) return "skipped";

  // A send that crashed halfway (very rare) would block forever; give up on it after 10 minutes.
  await db
    .from("email_log")
    .update({ status: "failed", error: "timed out while sending" })
    .eq("order_id", orderId)
    .eq("type", "ticket")
    .eq("status", "sending")
    .lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { to, testFor } = recipient(order.buyerEmail);
  const { data: claim, error: claimError } = await db
    .from("email_log")
    .insert({ order_id: orderId, type: "ticket", to_email: to })
    .select("id")
    .single();
  if (claimError) {
    if (claimError.code === "23505") return "already"; // another call already sent it / is sending it
    throw claimError;
  }

  if ((await emailsLastDay()) > DAILY_LIMIT) {
    console.warn(`Over Resend's ${DAILY_LIMIT}/day budget; trying the ticket email for ${order.orderNo} anyway.`);
  }

  const mail = buildTicketEmail({ kind: "ticket", siteUrl: env.siteUrl, firstName: order.buyerFirstName, orders: [toEmailOrder(order)], testFor });
  const res = await resendSend({ to, ...mail });
  await db
    .from("email_log")
    .update(res.ok ? { status: "sent", resend_id: res.id, sent_at: new Date().toISOString() } : { status: "failed", error: res.error })
    .eq("id", claim.id);
  if (!res.ok) {
    console.error(`Ticket email for order ${order.orderNo} failed: ${res.error}`);
    return "failed";
  }
  return "sent";
}

/**
 * Emails a Donate-page donation's receipt, once (spec §3.3). Same once-only
 * rule as the ticket email (unique index in 0010_donations.sql).
 */
export async function sendDonationReceipt(orderId: string): Promise<"sent" | "already" | "failed" | "skipped"> {
  const db = adminDb();
  const d = await getDonationById(orderId);
  if (!d || d.status !== "paid") return "skipped";

  await db
    .from("email_log")
    .update({ status: "failed", error: "timed out while sending" })
    .eq("order_id", orderId)
    .eq("type", "donation_receipt")
    .eq("status", "sending")
    .lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { to, testFor } = recipient(d.email);
  const { data: claim, error: claimError } = await db
    .from("email_log")
    .insert({ order_id: orderId, type: "donation_receipt", to_email: to })
    .select("id")
    .single();
  if (claimError) {
    if (claimError.code === "23505") return "already";
    throw claimError;
  }

  const mail = buildDonationReceipt({
    siteUrl: env.siteUrl,
    firstName: d.firstName,
    amountCents: d.amountCents,
    paidAt: d.paidAt ?? d.createdAt,
    reference: d.orderNo,
    displayName: d.recognize ? d.displayName : "",
    testFor,
  });
  const res = await resendSend({ to, ...mail });
  await db
    .from("email_log")
    .update(res.ok ? { status: "sent", resend_id: res.id, sent_at: new Date().toISOString() } : { status: "failed", error: res.error })
    .eq("id", claim.id);
  if (!res.ok) {
    console.error(`Donation receipt for ${d.orderNo} failed: ${res.error}`);
    return "failed";
  }
  return "sent";
}

export type ResendOutcome = "sent_or_no_match" | "too_many" | "daily_limit" | "error";

/**
 * "Lost your ticket?" (spec §3.5, D22): re-sends every upcoming ticket for
 * this email TO THIS EMAIL ONLY. The answer is the same whether or not the
 * email has tickets, so nobody can use it to find out who bought tickets.
 */
export async function resendTicketsForEmail(rawEmail: string, ip: string): Promise<ResendOutcome> {
  const db = adminDb();
  const email = rawEmail.trim().toLowerCase();
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const [byEmail, byIp] = await Promise.all([
    db.from("ticket_resend_requests").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", hourAgo),
    ip
      ? db.from("ticket_resend_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (byEmail.error || byIp.error) {
    console.error("Re-send limit check failed:", byEmail.error ?? byIp.error);
    return "error";
  }
  if ((byEmail.count ?? 0) >= PER_EMAIL_PER_HOUR || (byIp.count ?? 0) >= PER_IP_PER_HOUR) return "too_many";

  const orders = await getUpcomingOrdersByEmail(email);
  const { data: request, error: logError } = await db
    .from("ticket_resend_requests")
    .insert({ email, ip, matched: orders.length > 0 })
    .select("id")
    .single();
  if (logError) {
    console.error("Re-send request log failed:", logError);
    return "error";
  }
  if (orders.length === 0) return "sent_or_no_match";

  if ((await emailsLastDay()) >= RESEND_DAILY_CAP) {
    // Don't count this one against their 3, since nothing was sent.
    await db.from("ticket_resend_requests").delete().eq("id", request.id);
    return "daily_limit";
  }

  // Sent to the address on the order (in test mode: the group inbox).
  const { to, testFor } = recipient(orders[0].buyerEmail);
  const { data: logRow, error: claimError } = await db
    .from("email_log")
    .insert({ order_id: orders.length === 1 ? orders[0].id : null, type: "resend", to_email: to })
    .select("id")
    .single();
  if (claimError) {
    console.error("email_log insert failed:", claimError);
    return "error";
  }

  const mail = buildTicketEmail({ kind: "resend", siteUrl: env.siteUrl, firstName: orders[0].buyerFirstName, orders: orders.map(toEmailOrder), testFor });
  const res = await resendSend({ to, ...mail });
  await db
    .from("email_log")
    .update(res.ok ? { status: "sent", resend_id: res.id, sent_at: new Date().toISOString() } : { status: "failed", error: res.error })
    .eq("id", logRow.id);
  if (!res.ok) {
    console.error(`Re-send email failed: ${res.error}`);
    return "error";
  }
  return "sent_or_no_match";
}
