import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";
import type { EventRow } from "@/lib/events";

/*
 * Everything about ONE show, for the dashboard's "current show" block and
 * the show's Overview tab (SPEC §13). Money only counts PAID orders.
 * Call requireAdmin() first.
 */

export type EventMetrics = {
  ticketsSold: number; // paid + gift, not void
  giftTickets: number;
  soldByType: Record<string, number>;
  orders: number; // paid orders
  ticketSalesCents: number;
  serviceFeesCents: number;
  donationsCents: number; // added at checkout for this show
  revenueCents: number;
  stripeFeesCents: number;
  netCents: number;
  checkedIn: number;
  doorSales: number;
  letInTwice: number;
  /** Tickets sold per New York day, oldest first, every day from the first sale to the last. */
  perDay: { day: string; tickets: number }[];
};

const nyDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

export async function loadEventMetrics(event: Pick<EventRow, "id">): Promise<EventMetrics | null> {
  if (isDemo()) return null;
  const db = adminDb();
  const [orders, tickets, door, dupes] = await Promise.all([
    db
      .from("orders")
      .select("tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents")
      .eq("event_id", event.id)
      .eq("status", "paid"),
    db.from("tickets").select("ticket_type_id, status, created_at, orders!inner(status)").eq("event_id", event.id).neq("status", "void").in("orders.status", ["paid", "comp"]),
    db.from("door_sale_counts").select("delta").eq("event_id", event.id),
    db.from("check_in_log").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("conflict", true),
  ]);
  if (orders.error || tickets.error) return null;

  const paid = orders.data as { tickets_subtotal_cents: number; service_fee_cents: number; donation_cents: number; total_cents: number; stripe_fee_cents: number | null }[];
  const t = tickets.data as unknown as { ticket_type_id: string; status: string; created_at: string; orders: { status: string } }[];
  const sum = (k: "tickets_subtotal_cents" | "service_fee_cents" | "donation_cents" | "total_cents") => paid.reduce((n, o) => n + o[k], 0);
  const stripeFees = paid.reduce((n, o) => n + (o.stripe_fee_cents ?? 0), 0);

  const soldByType: Record<string, number> = {};
  const byDay = new Map<string, number>();
  for (const x of t) {
    soldByType[x.ticket_type_id] = (soldByType[x.ticket_type_id] ?? 0) + 1;
    const d = nyDay(x.created_at);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  // Fill in days with no sales, so the chart's spacing is honest.
  const days = [...byDay.keys()].sort();
  const perDay: { day: string; tickets: number }[] = [];
  if (days.length) {
    for (let d = new Date(`${days[0]}T12:00:00Z`); nyDay(d.toISOString()) <= days.at(-1)!; d = new Date(d.getTime() + 86_400_000)) {
      const key = nyDay(d.toISOString());
      perDay.push({ day: key, tickets: byDay.get(key) ?? 0 });
      if (perDay.length > 120) break; // a very long sales period: keep the chart readable
    }
  }

  return {
    ticketsSold: t.length,
    giftTickets: t.filter((x) => x.orders.status === "comp").length,
    soldByType,
    orders: paid.length,
    ticketSalesCents: sum("tickets_subtotal_cents"),
    serviceFeesCents: sum("service_fee_cents"),
    donationsCents: sum("donation_cents"),
    revenueCents: sum("total_cents"),
    stripeFeesCents: stripeFees,
    netCents: sum("total_cents") - stripeFees,
    checkedIn: t.filter((x) => x.status === "checked_in").length,
    doorSales: door.error ? 0 : (door.data as { delta: number }[]).reduce((n, r) => n + r.delta, 0),
    letInTwice: dupes.error ? 0 : (dupes.count ?? 0),
    perDay,
  };
}

/**
 * The show the dashboard features: the next one that hasn't happened yet
 * (a show stays "current" until 6 hours after it starts); if there's none,
 * the most recent one. Drafts and cancelled shows are skipped unless
 * nothing else exists. `events` is newest-first (listAllEventsForAdmin).
 */
export function pickCurrentEvent<T extends Pick<EventRow, "starts_at" | "status">>(events: T[], now = Date.now()): T | null {
  const live = events.filter((e) => e.status === "on_sale" || e.status === "closed");
  const pool = live.length ? live : events;
  const upcoming = pool.filter((e) => Date.parse(e.starts_at) > now - 6 * 3600_000).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (upcoming.length) return upcoming[0];
  return [...pool].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null;
}
