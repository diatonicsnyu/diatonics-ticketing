import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/supabase/clients";
import { runDailyReminders } from "@/lib/reminders";
import { runDailyShowChanges } from "@/lib/show-changes";

export const dynamic = "force-dynamic";

/**
 * Daily job, run by Vercel Cron (see vercel.json) every morning
 * (14:00 UTC = 9 or 10am in New York).
 *
 * 1. Keep-alive: a free Supabase project pauses after ~7 days with no
 *    activity, which would take the whole site down between shows.
 * 2. Cancelled / rescheduled shows: finishes any refunds and buyer emails
 *    the 100-a-day email limit held back (step 8).
 * 3. Reminder emails for shows in the next 2 days (SPEC §3.6, D21).
 *
 * Vercel sends "Authorization: Bearer <CRON_SECRET>" with each run, so
 * nobody else can trigger it.
 */
export async function GET(request: Request) {
  const sent = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  if (sent.length !== want.length || !timingSafeEqual(sent, want)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { error } = await adminDb().from("events").select("id").limit(1);
  if (error) {
    console.error("cron keep-alive: database read failed:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }

  // One after the other (they share the day's email budget; show changes
  // are more urgent). Each runs even if the other fails; failures show in
  // Vercel's logs.
  let showChanges: unknown = "failed";
  let reminders: unknown = "failed";
  try {
    showChanges = await runDailyShowChanges();
  } catch (err) {
    console.error("cron: show changes failed:", err);
  }
  try {
    reminders = await runDailyReminders();
  } catch (err) {
    console.error("cron: reminders failed:", err);
  }
  return Response.json({ ok: true, at: new Date().toISOString(), showChanges, reminders });
}
