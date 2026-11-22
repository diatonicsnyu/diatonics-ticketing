import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/clients";
import { doorSessionOr401 } from "@/lib/door";

export const dynamic = "force-dynamic";

export type LookupTicket = {
  ticketId: string;
  name: string;
  type: string;
  shortCode: string;
  orderNo: string;
  status: "valid" | "checked_in";
  checkedInAt: string | null;
  deviceName: string | null;
};

type Row = {
  id: string;
  short_code: string;
  status: "valid" | "checked_in" | "void";
  checked_in_at: string | null;
  checked_in_device: string | null;
  ticket_types: { name: string } | null;
  orders: { order_no: string; status: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string } | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]/g, "");

/**
 * Manual lookup (D14): search this show's tickets by name, email, order
 * number (KM47) or ticket code. Emails can be searched but are never sent
 * back to the phone (volunteers don't see emails, spec §3.7).
 */
export async function GET(request: NextRequest) {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;
  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (raw.length < 2) return Response.json({ tickets: [] });

  const { data, error } = await adminDb()
    .from("tickets")
    .select("id, short_code, status, checked_in_at, checked_in_device, ticket_types(name), orders!inner(order_no, status, buyer_first_name, buyer_last_name, buyer_email)")
    .eq("event_id", s.eventId)
    .neq("status", "void")
    .in("orders.status", ["paid", "comp"]);
  if (error) {
    console.error("door lookup failed:", error);
    return Response.json({ error: "server" }, { status: 500 });
  }

  const q = raw.toLowerCase().replace(/\s+/g, " ");
  const qs = squash(raw);
  const matches = (data as unknown as Row[]).filter((t) => {
    const o = t.orders!;
    const name = `${o.buyer_first_name} ${o.buyer_last_name}`.toLowerCase();
    return (
      name.includes(q) ||
      (qs.length >= 3 && o.buyer_email.toLowerCase().includes(qs)) ||
      o.order_no.toLowerCase() === qs ||
      (qs.length >= 4 && squash(t.short_code).includes(qs))
    );
  });

  const tickets: LookupTicket[] = matches.slice(0, 30).map((t) => ({
    ticketId: t.id,
    name: `${t.orders!.buyer_first_name} ${t.orders!.buyer_last_name}`.trim(),
    type: t.ticket_types?.name ?? "Ticket",
    shortCode: t.short_code,
    orderNo: t.orders!.order_no,
    status: t.status === "checked_in" ? "checked_in" : "valid",
    checkedInAt: t.checked_in_at,
    deviceName: t.checked_in_device,
  }));
  tickets.sort((a, b) => a.name.localeCompare(b.name) || a.shortCode.localeCompare(b.shortCode));
  return Response.json({ tickets, more: matches.length > tickets.length });
}
