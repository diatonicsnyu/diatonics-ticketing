import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { buildCancelEmail } from "@/lib/email/cancel-email";
import { buildTicketEmail } from "@/lib/email/ticket-email";
import { getOrderById, markSessionExpired } from "@/lib/orders";
import { emailsSince, recipient, resendBatch, toEmailOrder, type OutgoingEmail } from "@/lib/ticket-mail";
import { RESEND_DAILY_LIMIT } from "@/lib/reminder-plan";

/*
 * Cancel or reschedule a show (SPEC D20, §3.8). Both are safe to run again:
 *  - refunds use a Stripe idempotency key per order, so nobody is refunded twice;
 *  - each buyer gets one email per change (unique index in 0011).
 * If the 100-emails-a-day limit or a timeout stops part way, the daily job
 * (api/cron/daily) finishes the rest, and the admin page has a "keep going"
 * button.
 */

/** Show-change emails may use all but 10 of the day's 100 (they're urgent). */
const NOTICE_RESERVE = 10;

type Show = {
  id: string;
  name: string;
  status: string;
  starts_at: string;
  doors_at: string | null;
  sales_close_at: string;
  cancelled_at?: string | null;
  rescheduled_at?: string | null;
  previous_starts_at?: string | null;
};

async function getShow(eventId: string): Promise<Show | null> {
  const { data, error } = await adminDb()
    .from("events")
    .select("id, name, status, starts_at, doors_at, sales_close_at, cancelled_at, rescheduled_at, previous_starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data as Show | null;
}

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  buyer_first_name: string;
  buyer_email: string;
  total_cents: number;
  stripe_fee_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  tickets: { status: string }[];
};

async function showOrders(eventId: string): Promise<OrderRow[]> {
  const { data, error } = await adminDb()
    .from("orders")
    .select("id, order_no, status, buyer_first_name, buyer_email, total_cents, stripe_fee_cents, stripe_payment_intent_id, stripe_session_id, tickets(status)")
    .eq("event_id", eventId)
    .eq("kind", "tickets");
  if (error) throw error;
  return data as OrderRow[];
}

// ---------------------------------------------------------------------------
// Summary (step 2 of the 3 confirmation steps)
// ---------------------------------------------------------------------------

export type ShowSummary = {
  paidOrders: number;
  paidCents: number;
  /** What Stripe keeps even after refunding (the group pays it). */
  stripeFeesCents: number;
  giftOrders: number;
  tickets: number;
  /** People in the middle of checking out right now. */
  checkingOut: number;
};

export async function showSummary(eventId: string): Promise<ShowSummary> {
  const orders = await showOrders(eventId);
  const paid = orders.filter((o) => o.status === "paid");
  return {
    paidOrders: paid.length,
    paidCents: paid.reduce((n, o) => n + o.total_cents, 0),
    stripeFeesCents: paid.reduce((n, o) => n + (o.stripe_fee_cents ?? 0), 0),
    giftOrders: orders.filter((o) => o.status === "comp").length,
    tickets: orders.filter((o) => o.status === "paid" || o.status === "comp").reduce((n, o) => n + o.tickets.filter((t) => t.status !== "void").length, 0),
    checkingOut: orders.filter((o) => o.status === "pending").length,
  };
}

// ---------------------------------------------------------------------------
// Cancel + refund everyone
// ---------------------------------------------------------------------------

export type CancelProgress = {
  refunded: number;
  refundedCents: number;
  /** Paid orders still to refund (normally 0; a retry finishes them). */
  toRefund: number;
  refundErrors: string[];
  emailsSent: number;
  emailsLeft: number;
};

/** Step 3: cancels the show, then refunds and emails everyone (as far as it gets). */
export async function cancelShow(eventId: string): Promise<CancelProgress | "not_found" | "not_open"> {
  const show = await getShow(eventId);
  if (!show) return "not_found";
  if (show.status !== "cancelled") {
    if (show.status !== "on_sale" && show.status !== "closed") return "not_open";
    // Stop sales first, so nobody buys while refunds go out.
    const { error } = await adminDb()
      .from("events")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw error;
  }
  return finishCancellation(eventId);
}

/** Refunds anyone not refunded yet, voids every ticket, and emails whoever hasn't been told. Safe to repeat. */
export async function finishCancellation(eventId: string): Promise<CancelProgress> {
  const db = adminDb();
  const orders = await showOrders(eventId);

  // Close checkouts still open, so they can't be paid now. (If one was paid
  // a moment ago, Stripe refuses to close it and it shows up as paid below.)
  for (const o of orders.filter((x) => x.status === "pending" && x.stripe_session_id)) {
    try {
      await stripe().checkout.sessions.expire(o.stripe_session_id!);
      await markSessionExpired(o.stripe_session_id!);
    } catch {
      /* already paid or already closed: handled below / by the webhook */
    }
  }

  const refundErrors: string[] = [];
  const paid = orders.filter((o) => o.status === "paid");
  // A few at a time, to stay well inside Stripe's rate limits.
  for (let i = 0; i < paid.length; i += 4) {
    await Promise.all(
      paid.slice(i, i + 4).map(async (o) => {
        if (!o.stripe_payment_intent_id) {
          refundErrors.push(`${o.order_no}: no Stripe payment on file`);
          return;
        }
        let refundId: string | null = null;
        try {
          const refund = await stripe().refunds.create(
            {
              payment_intent: o.stripe_payment_intent_id,
              reason: "requested_by_customer",
              metadata: { order_id: o.id, order_no: o.order_no, reason: "show_cancelled" },
            },
            { idempotencyKey: `show-cancel-refund-${o.id}` },
          );
          refundId = refund.id;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code !== "charge_already_refunded") {
            refundErrors.push(`${o.order_no}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
            return;
          }
        }
        const { error } = await db
          .from("orders")
          .update({ status: "refunded", refunded_at: new Date().toISOString(), stripe_refund_id: refundId })
          .eq("id", o.id)
          .eq("status", "paid");
        if (error) refundErrors.push(`${o.order_no}: refunded in Stripe, but saving failed (${error.message})`);
      }),
    );
  }

  // Every ticket for this show stops working (refunded and gift tickets alike).
  const { error: voidError } = await db.from("tickets").update({ status: "void" }).eq("event_id", eventId).neq("status", "void");
  if (voidError) throw voidError;

  const after = await showOrders(eventId);
  const emails = await sendShowEmails(eventId, "cancel");
  const refundedOrders = after.filter((o) => o.status === "refunded");
  return {
    refunded: refundedOrders.length,
    refundedCents: refundedOrders.reduce((n, o) => n + o.total_cents, 0),
    toRefund: after.filter((o) => o.status === "paid").length,
    refundErrors,
    emailsSent: emails.alreadySent + emails.sent,
    emailsLeft: emails.left,
  };
}

/** Where things stand for an already-cancelled show (the admin page after step 3). */
export async function cancelProgress(eventId: string): Promise<CancelProgress> {
  const orders = await showOrders(eventId);
  const emails = await showEmailCounts(eventId, "cancel");
  const refunded = orders.filter((o) => o.status === "refunded");
  return {
    refunded: refunded.length,
    refundedCents: refunded.reduce((n, o) => n + o.total_cents, 0),
    toRefund: orders.filter((o) => o.status === "paid").length,
    refundErrors: [],
    emailsSent: emails.sent,
    emailsLeft: emails.left,
  };
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

export type RescheduleResult = { emailsSent: number; emailsLeft: number };

/** Step 3: moves the show. Tickets stay valid (they're tied to the show, not the date). */
export async function rescheduleShow(
  eventId: string,
  newStartsAt: string,
  newDoorsAt: string | null,
): Promise<RescheduleResult | "not_found" | "not_open" | "same_time"> {
  const show = await getShow(eventId);
  if (!show) return "not_found";
  if (show.status !== "on_sale" && show.status !== "closed") return "not_open";
  if (Date.parse(newStartsAt) === Date.parse(show.starts_at)) return "same_time";

  // Online sales close the same amount of time after the new start as before.
  const shift = Date.parse(newStartsAt) - Date.parse(show.starts_at);
  const { error } = await adminDb()
    .from("events")
    .update({
      starts_at: newStartsAt,
      doors_at: newDoorsAt,
      sales_close_at: new Date(Date.parse(show.sales_close_at) + shift).toISOString(),
      previous_starts_at: show.starts_at,
      rescheduled_at: new Date().toISOString(),
    })
    .eq("id", eventId);
  if (error) throw error;

  const emails = await sendShowEmails(eventId, "reschedule");
  return { emailsSent: emails.alreadySent + emails.sent, emailsLeft: emails.left };
}

// ---------------------------------------------------------------------------
// Emails to buyers (one per order per change)
// ---------------------------------------------------------------------------

/** Orders that should get this show's cancel / reschedule email. */
function emailOrders(orders: OrderRow[], type: "cancel" | "reschedule"): OrderRow[] {
  return type === "cancel"
    ? // Only once the refund went through (the email says "we've refunded").
      orders.filter((o) => o.status === "refunded" || o.status === "comp")
    : orders.filter((o) => (o.status === "paid" || o.status === "comp") && o.tickets.some((t) => t.status !== "void"));
}

async function alreadyEmailed(eventId: string, type: "cancel" | "reschedule", forStartsAt: string): Promise<Set<string>> {
  const { data, error } = await adminDb()
    .from("email_log")
    .select("order_id")
    .eq("type", type)
    .eq("event_id", eventId)
    .eq("for_starts_at", forStartsAt)
    .neq("status", "failed");
  if (error) throw error;
  return new Set((data as { order_id: string }[]).map((d) => d.order_id));
}

async function showEmailCounts(eventId: string, type: "cancel" | "reschedule"): Promise<{ sent: number; left: number }> {
  const show = await getShow(eventId);
  if (!show) return { sent: 0, left: 0 };
  const due = emailOrders(await showOrders(eventId), type);
  const done = await alreadyEmailed(eventId, type, show.starts_at);
  const sent = due.filter((o) => done.has(o.id)).length;
  return { sent, left: due.length - sent };
}

/** Sends this show's cancel / reschedule email to everyone who hasn't had it, within today's email budget. */
export async function sendShowEmails(eventId: string, type: "cancel" | "reschedule"): Promise<{ sent: number; alreadySent: number; failed: number; left: number }> {
  const db = adminDb();
  const show = await getShow(eventId);
  if (!show) return { sent: 0, alreadySent: 0, failed: 0, left: 0 };
  const due = emailOrders(await showOrders(eventId), type);
  const done = await alreadyEmailed(eventId, type, show.starts_at);
  const todo = due.filter((o) => !done.has(o.id));
  const budget = Math.max(0, RESEND_DAILY_LIMIT - NOTICE_RESERVE - (await emailsSince(23)));
  const batch = todo.slice(0, budget);

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i += 25) {
    const claimed: { id: string; mail: OutgoingEmail }[] = [];
    for (const o of batch.slice(i, i + 25)) {
      const { to, testFor } = recipient(o.buyer_email);
      let mail: { subject: string; html: string; text: string } | null = null;
      if (type === "cancel") {
        mail = buildCancelEmail({
          siteUrl: env.siteUrl,
          firstName: o.buyer_first_name,
          eventName: show.name,
          startsAt: show.starts_at,
          orderNo: o.order_no,
          refundCents: o.status === "comp" ? 0 : o.total_cents,
          testFor,
        });
      } else {
        const order = await getOrderById(o.id);
        if (order && order.tickets.length > 0) {
          mail = buildTicketEmail({
            kind: "reschedule",
            siteUrl: env.siteUrl,
            firstName: o.buyer_first_name,
            orders: [toEmailOrder(order)],
            previousStartsAt: show.previous_starts_at ?? null,
            testFor,
          });
        }
      }
      if (!mail) continue;
      const { data, error } = await db
        .from("email_log")
        .insert({ type, order_id: o.id, event_id: eventId, buyer_email: o.buyer_email.toLowerCase(), for_starts_at: show.starts_at, to_email: to })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // another run already sent it
        throw error;
      }
      claimed.push({ id: data.id as string, mail: { to, ...mail } });
    }
    const results = await resendBatch(claimed.map((c) => c.mail));
    await Promise.all(
      results.map((res, j) =>
        db
          .from("email_log")
          .update(res.ok ? { status: "sent", resend_id: res.id, sent_at: new Date().toISOString() } : { status: "failed", error: res.error })
          .eq("id", claimed[j].id),
      ),
    );
    sent += results.filter((r) => r.ok).length;
    failed += results.filter((r) => !r.ok).length;
    if (results.some((r) => !r.ok)) console.error(`Some ${type} emails failed:`, results.find((r) => !r.ok));
  }
  return { sent, alreadySent: done.size, failed, left: todo.length - sent };
}

/** The daily job: finish any cancellation (refunds + emails) and reschedule emails still going out. */
export async function runDailyShowChanges(now = new Date()): Promise<string[]> {
  const db = adminDb();
  const out: string[] = [];
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [cancelled, moved] = await Promise.all([
    db.from("events").select("id, name").eq("status", "cancelled").gte("cancelled_at", monthAgo),
    db.from("events").select("id, name").in("status", ["on_sale", "closed"]).not("rescheduled_at", "is", null).gt("starts_at", now.toISOString()),
  ]);
  if (cancelled.error) throw cancelled.error;
  if (moved.error) throw moved.error;
  for (const e of cancelled.data as { id: string; name: string }[]) {
    const p = await finishCancellation(e.id);
    if (p.toRefund || p.emailsLeft || p.refundErrors.length) out.push(`${e.name}: ${p.toRefund} to refund, ${p.emailsLeft} emails left`);
  }
  for (const e of moved.data as { id: string; name: string }[]) {
    const r = await sendShowEmails(e.id, "reschedule");
    if (r.sent || r.left) out.push(`${e.name}: ${r.sent} reschedule emails sent, ${r.left} left`);
  }
  return out;
}
