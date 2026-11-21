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
  /** Tickets sold per event and per ticket type id. */
  soldByEvent: Record<string, number>;
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
  const [orders, tickets, ledger] = await Promise.all([
    db
      .from("orders")
      .select("tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents, payment_method")
      .eq("status", "paid"),
    db.from("tickets").select("event_id, ticket_type_id, status").neq("status", "void"),
    ledgerTotals(),
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
  for (const t of tickets.data ?? []) {
    soldByEvent[t.event_id as string] = (soldByEvent[t.event_id as string] ?? 0) + 1;
    soldByType[t.ticket_type_id as string] = (soldByType[t.ticket_type_id as string] ?? 0) + 1;
  }

  const revenue = sum("total_cents");
  const net = revenue - stripeFees;
  const spent = ledger?.spentCents ?? null;

  return {
    status: "ok",
    data: {
      ticketsSold: (tickets.data ?? []).length,
      checkedIn: (tickets.data ?? []).filter((t) => t.status === "checked_in").length,
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
      soldByEvent,
      soldByType,
    },
  };
}
