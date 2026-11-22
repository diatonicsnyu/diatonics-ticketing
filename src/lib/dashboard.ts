import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";
import { ledgerTotals } from "@/lib/expenses";

/*
 * Admin dashboard numbers (SPEC D19, §3.8, §12 Admin). Every admin sees them.
 * The group isn't trying to make a profit; the money pays for things like
 * costumes. Only PAID orders count (pending/expired checkouts never do).
 *
 *   Total revenue          = tickets + service fees + donations
 *   Net profit from sales  = total revenue - Stripe fees
 *   Total spent            = e-board expenses (expense log)
 *   Current balance        = net profit from sales - total spent
 */

export type Dashboard = {
  ticketsSold: number;
  /** Of ticketsSold, how many were comps (free). */
  compTickets: number;
  checkedIn: number;
  ticketSalesCents: number;
  serviceFeesCents: number;
  donationsCents: number;
  revenueCents: number;
  stripeFeesCents: number;
  /** Paid orders whose Stripe fee isn't known yet (net is slightly high until it is). */
  ordersMissingFee: number;
  netCents: number;
  /** null = the expense log isn't set up yet (0005_ledger.sql). */
  spentCents: number | null;
  owedCents: number | null;
  balanceCents: number | null;
  /** Door-sale counter total (D32) and checked in + door sales. */
  doorSales: number;
  attendance: number;
  /** Tickets let in twice while door phones were offline (flagged when they synced, step 5). */
  duplicateCheckIns: number;
  /** Tickets sold per event and per ticket type id. */
  soldByEvent: Record<string, number>;
  checkedInByEvent: Record<string, number>;
  doorSalesByEvent: Record<string, number>;
  soldByType: Record<string, number>;
};

export type DashboardResult = { status: "demo" } | { status: "setup_needed" } | { status: "ok"; data: Dashboard };

function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

/** Call requireAdmin() first. */
export async function loadDashboard(): Promise<DashboardResult> {
  if (isDemo()) return { status: "demo" };
  const db = adminDb();
  const [orders, tickets, ledger, door, dupes] = await Promise.all([
    db
      .from("orders")
      .select("tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents, payment_method")
      .eq("status", "paid"),
    db.from("tickets").select("event_id, ticket_type_id, status, orders(status)").neq("status", "void"),
    ledgerTotals(),
    db.from("door_sale_counts").select("event_id, delta"),
    db.from("check_in_log").select("id", { count: "exact", head: true }).eq("conflict", true),
  ]);
  if (isMissingTable(orders.error) || isMissingTable(tickets.error)) return { status: "setup_needed" };
  if (orders.error) throw orders.error;
  if (tickets.error) throw tickets.error;

  const paid = orders.data ?? [];
  const sum = (k: "tickets_subtotal_cents" | "service_fee_cents" | "donation_cents" | "total_cents") =>
    paid.reduce((s, o) => s + (o[k] as number), 0);
  const stripeFees = paid.reduce((s, o) => s + ((o.stripe_fee_cents as number | null) ?? 0), 0);
  const missingFee = paid.filter((o) => o.stripe_fee_cents == null && (o.total_cents as number) > 0 && o.payment_method === "stripe").length;

  const soldByEvent: Record<string, number> = {};
  const soldByType: Record<string, number> = {};
  const checkedInByEvent: Record<string, number> = {};
  const doorSalesByEvent: Record<string, number> = {};
  // Before 0007_door.sql is run the door table is missing: count it as 0.
  for (const r of door.error ? [] : (door.data ?? [])) {
    doorSalesByEvent[r.event_id as string] = (doorSalesByEvent[r.event_id as string] ?? 0) + (r.delta as number);
  }
  for (const t of tickets.data ?? []) {
    soldByEvent[t.event_id as string] = (soldByEvent[t.event_id as string] ?? 0) + 1;
    if (t.status === "checked_in") checkedInByEvent[t.event_id as string] = (checkedInByEvent[t.event_id as string] ?? 0) + 1;
    soldByType[t.ticket_type_id as string] = (soldByType[t.ticket_type_id as string] ?? 0) + 1;
  }

  const revenue = sum("total_cents");
  const net = revenue - stripeFees;
  const spent = ledger?.spentCents ?? null;
  const checkedIn = (tickets.data ?? []).filter((t) => t.status === "checked_in").length;
  const doorSales = Object.values(doorSalesByEvent).reduce((a, b) => a + b, 0);

  return {
    status: "ok",
    data: {
      ticketsSold: (tickets.data ?? []).length,
      compTickets: (tickets.data ?? []).filter((t) => (t.orders as unknown as { status: string } | null)?.status === "comp").length,
      checkedIn,
      ticketSalesCents: sum("tickets_subtotal_cents"),
      serviceFeesCents: sum("service_fee_cents"),
      donationsCents: sum("donation_cents"),
      revenueCents: revenue,
      stripeFeesCents: stripeFees,
      ordersMissingFee: missingFee,
      netCents: net,
      spentCents: spent,
      owedCents: ledger?.owedCents ?? null,
      balanceCents: spent == null ? null : net - spent,
      doorSales,
      attendance: checkedIn + doorSales,
      duplicateCheckIns: dupes.error ? 0 : (dupes.count ?? 0),
      soldByEvent,
      soldByType,
      checkedInByEvent,
      doorSalesByEvent,
    },
  };
}
