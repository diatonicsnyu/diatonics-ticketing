import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";
import { newOrderNumber } from "@/lib/shortcode";
import { isValidEmail, MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { sendTicketEmail } from "@/lib/ticket-mail";

/*
 * Admin tools for single orders (SPEC §3.8, step 6): the order page,
 * comp (free) tickets, and undoing a check-in. Call requireAdmin() first.
 */

export type AdminTicket = {
  id: string;
  shortCode: string;
  typeName: string;
  status: "valid" | "checked_in" | "void";
  checkedInAt: string | null;
  checkedInDevice: string | null;
  history: { action: "check_in" | "undo"; method: string; deviceName: string; at: string; conflict: boolean }[];
};

export type AdminOrder = {
  id: string;
  orderNo: string;
  status: "pending" | "paid" | "expired" | "refunded" | "comp";
  createdAt: string;
  paidAt: string | null;
  event: { id: string; name: string; startsAt: string } | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  lines: { typeName: string; quantity: number; priceCents: number }[];
  ticketsCents: number;
  serviceFeeCents: number;
  donationCents: number;
  totalCents: number;
  stripeFeeCents: number | null;
  supporterName: string;
  compBy: string;
  compNote: string;
  tickets: AdminTicket[];
  /** Latest ticket email for this order, if any. */
  ticketEmail: null | { status: "sending" | "sent" | "failed"; at: string; error: string | null };
};

type OrderRow = {
  id: string;
  order_no: string;
  status: AdminOrder["status"];
  created_at: string;
  paid_at: string | null;
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_email: string;
  buyer_phone: string;
  tickets_subtotal_cents: number;
  service_fee_cents: number;
  donation_cents: number;
  total_cents: number;
  stripe_fee_cents: number | null;
  recognize: boolean;
  display_name: string;
  comp_by?: string;
  comp_note?: string;
  events: { id: string; name: string; starts_at: string } | null;
  order_lines: { quantity: number; price_cents: number; ticket_types: { name: string; sort_order: number } | null }[];
  tickets: {
    id: string;
    short_code: string;
    status: AdminTicket["status"];
    checked_in_at: string | null;
    checked_in_device: string | null;
    created_at: string;
    ticket_types: { name: string; sort_order: number } | null;
  }[];
};

const ORDER_SELECT =
  "id, order_no, status, created_at, paid_at, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, tickets_subtotal_cents, service_fee_cents, donation_cents, total_cents, stripe_fee_cents, recognize, display_name, events(id, name, starts_at), order_lines(quantity, price_cents, ticket_types(name, sort_order)), tickets(id, short_code, status, checked_in_at, checked_in_device, created_at, ticket_types(name, sort_order))";

/** The order page. Order numbers are like "KM47". */
export async function loadAdminOrder(orderNo: string): Promise<AdminOrder | null> {
  if (isDemo() || !/^[A-Z0-9]{2,12}$/.test(orderNo)) return null;
  const db = adminDb();
  // comp_by / comp_note arrive with 0009_admin_tools.sql; work without them until it's run.
  let res = await db.from("orders").select(`${ORDER_SELECT}, comp_by, comp_note`).eq("order_no", orderNo).maybeSingle();
  if (res.error?.code === "42703") res = await db.from("orders").select(ORDER_SELECT).eq("order_no", orderNo).maybeSingle();
  if (res.error) throw res.error;
  const o = res.data as unknown as OrderRow | null;
  if (!o) return null;

  const ticketIds = o.tickets.map((t) => t.id);
  const [log, mail] = await Promise.all([
    ticketIds.length
      ? db.from("check_in_log").select("ticket_id, action, method, device_name, created_at, conflict").in("ticket_id", ticketIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    db.from("email_log").select("status, created_at, sent_at, error").eq("order_id", o.id).eq("type", "ticket").order("created_at", { ascending: false }).limit(1),
  ]);
  const history = new Map<string, AdminTicket["history"]>();
  for (const r of (log.error ? [] : log.data ?? []) as { ticket_id: string; action: "check_in" | "undo"; method: string; device_name: string; created_at: string; conflict: boolean }[]) {
    const list = history.get(r.ticket_id) ?? [];
    list.push({ action: r.action, method: r.method, deviceName: r.device_name, at: r.created_at, conflict: r.conflict });
    history.set(r.ticket_id, list);
  }
  const m = (mail.error ? null : mail.data?.[0]) as { status: "sending" | "sent" | "failed"; created_at: string; sent_at: string | null; error: string | null } | undefined;

  const bySort = (a: { ticket_types: { sort_order: number } | null }, b: { ticket_types: { sort_order: number } | null }) =>
    (a.ticket_types?.sort_order ?? 0) - (b.ticket_types?.sort_order ?? 0);

  return {
    id: o.id,
    orderNo: o.order_no,
    status: o.status,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    event: o.events ? { id: o.events.id, name: o.events.name, startsAt: o.events.starts_at } : null,
    firstName: o.buyer_first_name,
    lastName: o.buyer_last_name,
    email: o.buyer_email,
    phone: o.buyer_phone,
    lines: [...o.order_lines].sort(bySort).map((l) => ({ typeName: l.ticket_types?.name ?? "Ticket", quantity: l.quantity, priceCents: l.price_cents })),
    ticketsCents: o.tickets_subtotal_cents,
    serviceFeeCents: o.service_fee_cents,
    donationCents: o.donation_cents,
    totalCents: o.total_cents,
    stripeFeeCents: o.stripe_fee_cents,
    supporterName: o.recognize ? o.display_name : "",
    compBy: o.comp_by ?? "",
    compNote: o.comp_note ?? "",
    tickets: [...o.tickets]
      .sort((a, b) => bySort(a, b) || a.created_at.localeCompare(b.created_at))
      .map((t) => ({
        id: t.id,
        shortCode: t.short_code,
        typeName: t.ticket_types?.name ?? "Ticket",
        status: t.status,
        checkedInAt: t.checked_in_at,
        checkedInDevice: t.checked_in_device,
        history: history.get(t.id) ?? [],
      })),
    ticketEmail: m ? { status: m.status, at: m.sent_at ?? m.created_at, error: m.error } : null,
  };
}

// ---------------------------------------------------------------------------
// Comp tickets
// ---------------------------------------------------------------------------

export type CompInput = {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
  issuedBy: string;
};

const COMP_ERRORS: Record<string, string> = {
  EVENT_NOT_OPEN: "Comps can only be issued for a show that's on sale or has sales closed (not a draft or cancelled show).",
  SOLD_OUT: "There isn't room: that many comps would go over the show's capacity.",
  TYPE_SOLD_OUT: "That ticket type doesn't have that many left.",
  BAD_QUANTITY: `Pick between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`,
  BAD_TYPE: "That ticket type isn't part of this show. Refresh the page and try again.",
};

/** Issues free tickets and emails them like a normal order. */
export async function issueComp(input: CompInput): Promise<{ orderNo: string; email: "sent" | "already" | "failed" | "skipped" } | { error: string }> {
  if (!input.firstName || !input.lastName) return { error: "Enter their first and last name." };
  if (!isValidEmail(input.email)) return { error: "Enter a valid email, so the tickets can be sent." };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_TICKETS_PER_ORDER) return { error: COMP_ERRORS.BAD_QUANTITY };

  const db = adminDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNo = newOrderNumber();
    const { data, error } = await db.rpc("create_comp_order", {
      p_order: {
        event_id: input.eventId,
        order_no: orderNo,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        comp_by: input.issuedBy,
        comp_note: input.note,
      },
      p_lines: [{ ticket_type_id: input.ticketTypeId, quantity: input.quantity }],
    });
    if (!error) {
      const email = await sendTicketEmail(data as string).catch((e) => {
        console.error("comp ticket email failed:", e);
        return "failed" as const;
      });
      return { orderNo, email };
    }
    const known = Object.keys(COMP_ERRORS).find((k) => error.message.includes(k));
    if (known) return { error: COMP_ERRORS[known] };
    if (error.code === "23505") continue; // order number taken: pick another
    if (error.code === "PGRST202" || error.code === "42883") return { error: "Run supabase/migrations/0009_admin_tools.sql in Supabase first." };
    if (error.code === "22P02") return { error: "Pick a show and ticket type." };
    console.error("create_comp_order failed:", error);
    return { error: "Something went wrong. Please try again." };
  }
  return { error: "Something went wrong. Please try again." };
}

export type CompRow = { orderNo: string; name: string; email: string; eventName: string; count: number; compBy: string; note: string; at: string };

/** Recent comps, newest first. */
export async function listComps(limit = 50): Promise<CompRow[]> {
  if (isDemo()) return [];
  const { data, error } = await adminDb()
    .from("orders")
    .select("order_no, buyer_first_name, buyer_last_name, buyer_email, comp_by, comp_note, created_at, events(name), order_lines(quantity)")
    .eq("status", "comp")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return []; // 0009 not run yet: no comps
  return (data as unknown as { order_no: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; comp_by: string; comp_note: string; created_at: string; events: { name: string } | null; order_lines: { quantity: number }[] }[]).map((o) => ({
    orderNo: o.order_no,
    name: `${o.buyer_first_name} ${o.buyer_last_name}`.trim(),
    email: o.buyer_email,
    eventName: o.events?.name ?? "",
    count: o.order_lines.reduce((n, l) => n + l.quantity, 0),
    compBy: o.comp_by,
    note: o.comp_note,
    at: o.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Undo a check-in
// ---------------------------------------------------------------------------

export async function undoCheckIn(ticketId: string, adminName: string): Promise<"ok" | "not_checked_in" | "not_found" | "setup_needed"> {
  const { data, error } = await adminDb().rpc("admin_undo_check_in", { p_ticket_id: ticketId, p_admin_name: `Admin: ${adminName}` });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return "setup_needed";
    if (error.code === "22P02") return "not_found";
    throw error;
  }
  return (data as { result: "ok" | "not_checked_in" | "not_found" }).result;
}
