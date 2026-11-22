import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * Daily job, run by Vercel Cron (see vercel.json).
 *
 * Keep-alive: a free Supabase project pauses after ~7 days with no activity,
 * which would take the whole site down between shows. One tiny database read
 * a day stops that. (Step 8's reminder emails will hook in here too.)
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
  return Response.json({ ok: true, at: new Date().toISOString() });
}
