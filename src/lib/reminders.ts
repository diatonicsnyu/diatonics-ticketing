import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { env } from "@/lib/env";
import { buildTicketEmail } from "@/lib/email/ticket-email";
import { getOrderById } from "@/lib/orders";
import { emailsSince, recipient, resendBatch, toEmailOrder } from "@/lib/ticket-mail";
import { formatDate } from "@/lib/time";
import {
  nyDaysUntil,
  planReminders,
  REMINDER_DAILY_MAX,
  RESEND_DAILY_LIMIT,
  RESERVE_FOR_ORDERS,
  whenWord,
  type ReminderRecipient,
} from "@/lib/reminder-plan";

/*
 * Reminder emails (SPEC §3.6, D21). The daily job (api/cron/daily) sends
 * them by itself; admins can preview them and send early from the event's
 * admin page. One email per buyer per show (all their orders for that show
 * together), never twice for the same show date.
 */

type ShowEvent = { id: string; name: string; starts_at: string; status: string };
type Recipient = ReminderRecipient & { firstName: string; orderIds: string[] };

/** Everyone with active tickets for this show, plus who's been reminded for its current date. */
async function loadRecipients(event: ShowEvent): Promise<{ all: Recipient[]; reminded: Set<string> }> {
  const db = adminDb();
  const [orders, log] = await Promise.all([
    db
      .from("orders")
      .select("id, buyer_email, buyer_first_name, paid_at, created_at, tickets(status)")
      .eq("event_id", event.id)
      .eq("kind", "tickets")
      .in("status", ["paid", "comp"]),
    db
      .from("email_log")
      .select("buyer_email")
      .eq("type", "reminder")
      .eq("event_id", event.id)
      .eq("for_starts_at", event.starts_at)
      .neq("status", "failed"),
  ]);
  if (orders.error) throw orders.error;
  if (log.error) throw log.error;

  const byEmail = new Map<string, Recipient>();
  for (const o of orders.data as { id: string; buyer_email: string; buyer_first_name: string; paid_at: string | null; created_at: string; tickets: { status: string }[] }[]) {
    if (!o.tickets.some((t) => t.status !== "void")) continue;
    const email = o.buyer_email.trim().toLowerCase();
    const at = o.paid_at ?? o.created_at;
    const r = byEmail.get(email);
    if (!r) byEmail.set(email, { email, firstPaidAt: at, firstName: o.buyer_first_name, orderIds: [o.id] });
    else {
      r.orderIds.push(o.id);
      if (at < r.firstPaidAt) r.firstPaidAt = at;
    }
  }
  return { all: [...byEmail.values()], reminded: new Set((log.data as { buyer_email: string }[]).map((l) => l.buyer_email.toLowerCase())) };
}

/** Reminder emails still allowed today: ≤80 reminders, and always ~20 left for orders. */
export async function reminderBudget(): Promise<number> {
  const [reminders, all] = await Promise.all([emailsSince(23, "reminder"), emailsSince(23)]);
  return Math.max(0, Math.min(REMINDER_DAILY_MAX - reminders, RESEND_DAILY_LIMIT - RESERVE_FOR_ORDERS - all));
}

/** Builds one buyer's reminder (their tickets, with QR codes). */
async function buildReminder(event: ShowEvent, r: Recipient, daysAway: number, testFor: string | null) {
  const orders = (await Promise.all(r.orderIds.map(getOrderById))).filter((o) => o && o.tickets.length > 0);
  if (orders.length === 0) return null;
  return buildTicketEmail({
    kind: "reminder",
    siteUrl: env.siteUrl,
    firstName: r.firstName,
    orders: orders.map((o) => toEmailOrder(o!)),
    when: whenWord(daysAway),
    testFor,
  });
}

/** Sends reminders to these buyers (claiming each first, so nobody gets two). */
async function sendReminders(event: ShowEvent, batch: Recipient[], daysAway: number): Promise<{ sent: number; failed: number }> {
  const db = adminDb();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i += 25) {
    const claimed: { id: string; mail: { to: string; subject: string; html: string; text: string } }[] = [];
    for (const r of batch.slice(i, i + 25)) {
      const { to, testFor } = recipient(r.email);
      const mail = await buildReminder(event, r, daysAway, testFor);
      if (!mail) continue;
      const { data, error } = await db
        .from("email_log")
        .insert({ type: "reminder", order_id: r.orderIds[0], event_id: event.id, buyer_email: r.email, for_starts_at: event.starts_at, to_email: to })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // already reminded (another run got there first)
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
    if (results.some((r) => !r.ok)) console.error("Some reminders failed:", results.find((r) => !r.ok));
  }
  return { sent, failed };
}

/** The daily job: today's reminders for every show in the next 2 days, soonest first. */
export async function runDailyReminders(now = new Date()): Promise<{ event: string; sent: number; failed: number }[]> {
  const { data, error } = await adminDb()
    .from("events")
    .select("id, name, starts_at, status")
    .in("status", ["on_sale", "closed"])
    .gt("starts_at", new Date(now.getTime() + 60 * 60_000).toISOString()) // not about to start
    .lt("starts_at", new Date(now.getTime() + 3 * 86_400_000).toISOString())
    .order("starts_at");
  if (error) throw error;

  let budget = await reminderBudget();
  const out: { event: string; sent: number; failed: number }[] = [];
  for (const event of data as ShowEvent[]) {
    const daysAway = nyDaysUntil(event.starts_at, now);
    const { all, reminded } = await loadRecipients(event);
    const batch = planReminders(all, reminded, daysAway, budget) as Recipient[];
    if (batch.length === 0) continue;
    const res = await sendReminders(event, batch, daysAway);
    budget -= res.sent + res.failed;
    out.push({ event: event.name, ...res });
  }
  return out;
}

export type ReminderStatus = {
  recipients: number;
  reminded: number;
  daysAway: number;
  /** Plain-language schedule, for the admin page. */
  plan: string;
};

async function getShow(eventId: string): Promise<ShowEvent | null> {
  const { data, error } = await adminDb().from("events").select("id, name, starts_at, status").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data as ShowEvent | null;
}

/** For the event's admin page. Call requireAdmin() first. null = 0011 not run yet. */
export async function reminderStatus(eventId: string, now = new Date()): Promise<ReminderStatus | null> {
  const event = await getShow(eventId);
  if (!event) return null;
  let r: { all: Recipient[]; reminded: Set<string> };
  try {
    r = await loadRecipients(event);
  } catch {
    return null;
  }
  const n = r.all.length;
  const reminded = r.all.filter((x) => r.reminded.has(x.email)).length;
  const daysAway = nyDaysUntil(event.starts_at, now);
  const dayBefore = (d: number) => formatDate(new Date(Date.parse(event.starts_at) - d * 86_400_000).toISOString());
  let plan: string;
  if (event.status === "cancelled") plan = "This show is cancelled, so no reminders go out.";
  else if (daysAway < 0 || Date.parse(event.starts_at) < now.getTime()) plan = "This show is over.";
  else if (n === 0) plan = "Nobody has tickets yet.";
  else if (reminded === n) plan = "Everyone has been reminded.";
  else if (n <= REMINDER_DAILY_MAX) plan = `Goes out by itself on the morning of ${dayBefore(1)} (the day before).`;
  else plan = `More than ${REMINDER_DAILY_MAX} buyers, so it's split: the earliest ${Math.ceil(n / 2)} on the morning of ${dayBefore(2)}, the rest on ${dayBefore(1)}.`;
  return { recipients: n, reminded, daysAway, plan };
}

/** "Send now" on the admin page: everyone not reminded yet, as far as today's budget allows. */
export async function sendRemindersNow(eventId: string, now = new Date()): Promise<{ sent: number; failed: number; left: number } | "not_open"> {
  const event = await getShow(eventId);
  if (!event || (event.status !== "on_sale" && event.status !== "closed") || Date.parse(event.starts_at) < now.getTime()) return "not_open";
  const { all, reminded } = await loadRecipients(event);
  const pending = all.filter((r) => !reminded.has(r.email)).sort((a, b) => a.firstPaidAt.localeCompare(b.firstPaidAt));
  const batch = pending.slice(0, await reminderBudget());
  const res = await sendReminders(event, batch, Math.max(0, nyDaysUntil(event.starts_at, now)));
  return { ...res, left: pending.length - res.sent };
}

/** The reminder the first buyer would get (the "tomorrow" version), for the admin preview. */
export async function previewReminder(eventId: string): Promise<string | null> {
  const event = await getShow(eventId);
  if (!event) return null;
  const { all } = await loadRecipients(event);
  if (all.length === 0) return null;
  const mail = await buildReminder(event, all[0], 1, null);
  return mail?.html ?? null;
}
