import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";

/*
 * Buyer list (SPEC D19, §3.8): everyone who bought tickets, for every admin.
 * Shown as a table in the browser and as a CSV download (no .xlsx).
 * Only paid (and later, comp) ticket orders. Never any card info (we never have it).
 */

export type BuyerRow = {
  orderNo: string;
  purchasedAt: string; // ISO
  eventId: string | null;
  eventName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketCount: number;
  ticketTypes: string; // "2 × General, 1 × Student"
  ticketsCents: number;
  serviceFeeCents: number;
  donationCents: number;
  totalCents: number;
  checkedIn: number;
  supporterName: string; // opt-in donor name (D12), or ""
  status: string;
};

export type BuyersResult = { status: "demo" } | { status: "setup_needed" } | { status: "ok"; rows: BuyerRow[] };

type Row = {
  order_no: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_email: string;
  buyer_phone: string;
  tickets_subtotal_cents: number;
  service_fee_cents: number;
  donation_cents: number;
  total_cents: number;
  recognize: boolean;
  display_name: string;
  event_id: string | null;
  events: { name: string } | null;
  order_lines: { quantity: number; ticket_types: { name: string; sort_order: number } | null }[];
  tickets: { status: string }[];
};

/** Call requireAdmin() first. `eventId` limits it to one show; `q` searches name / email / order number. */
export async function loadBuyers(opts: { eventId?: string; q?: string } = {}): Promise<BuyersResult> {
  if (isDemo()) return { status: "demo" };
  let query = adminDb()
    .from("orders")
    .select(
      "order_no, status, paid_at, created_at, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, recognize, display_name, event_id, events(name), order_lines(quantity, ticket_types(name, sort_order)), tickets(status)",
    )
    .eq("kind", "tickets")
    .in("status", ["paid", "comp"])
    .order("paid_at", { ascending: false, nullsFirst: false });
  if (opts.eventId) query = query.eq("event_id", opts.eventId);
  const { data, error } = await query;
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return { status: "setup_needed" };
  if (error) throw error;

  let rows = (data as unknown as Row[]).map((o): BuyerRow => {
    const lines = [...o.order_lines].sort((a, b) => (a.ticket_types?.sort_order ?? 0) - (b.ticket_types?.sort_order ?? 0));
    return {
      orderNo: o.order_no,
      purchasedAt: o.paid_at ?? o.created_at,
      eventId: o.event_id,
      eventName: o.events?.name ?? "",
      firstName: o.buyer_first_name,
      lastName: o.buyer_last_name,
      email: o.buyer_email,
      phone: o.buyer_phone,
      ticketCount: lines.reduce((n, l) => n + l.quantity, 0),
      ticketTypes: lines.map((l) => `${l.quantity} × ${l.ticket_types?.name ?? "Ticket"}`).join(", "),
      ticketsCents: o.tickets_subtotal_cents,
      serviceFeeCents: o.service_fee_cents,
      donationCents: o.donation_cents,
      totalCents: o.total_cents,
      checkedIn: o.tickets.filter((t) => t.status === "checked_in").length,
      supporterName: o.recognize ? o.display_name : "",
      status: o.status,
    };
  });

  const q = opts.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.firstName, r.lastName, `${r.firstName} ${r.lastName}`, r.email, r.orderNo, r.phone].some((v) => v.toLowerCase().includes(q)),
    );
  }
  return { status: "ok", rows };
}

/** Turns rows into CSV text that opens cleanly in Google Sheets / Excel. */
export function buyersCsv(rows: BuyerRow[]): string {
  const money = (c: number) => (c / 100).toFixed(2);
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  // Quote every cell; neutralize spreadsheet formulas (a name like "=HYPERLINK(...)").
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Order", "Purchased (NY time)", "Event", "First name", "Last name", "Email", "Phone", "Tickets", "Ticket types", "Tickets $", "Service fees $", "Donation $", "Total $", "Checked in", "Supporter name", "Status"];
  const lines = rows.map((r) =>
    [r.orderNo, when(r.purchasedAt), r.eventName, r.firstName, r.lastName, r.email, r.phone, r.ticketCount, r.ticketTypes, money(r.ticketsCents), money(r.serviceFeeCents), money(r.donationCents), money(r.totalCents), r.checkedIn, r.supporterName, r.status]
      .map(cell)
      .join(","),
  );
  // The BOM makes Excel read the file as UTF-8 (names with accents stay correct).
  return "﻿" + [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
