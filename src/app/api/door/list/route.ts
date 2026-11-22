import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";
import { doorSessionOr401, doorStats } from "@/lib/door";
import { eventTicketKey } from "@/lib/ticket-token";
import type { GuestList, ListTicket } from "@/app/door/offline";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  short_code: string;
  status: "valid" | "checked_in";
  checked_in_at: string | null;
  checked_in_device: string | null;
  ticket_types: { name: string } | null;
  orders: { order_no: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string } | null;
};

/**
 * The guest list a door phone keeps for offline mode (spec §3.7, D13):
 * ticket ids, names, types, statuses. Plus this show's ticket-signing key so
 * the phone can spot fake QR codes with no signal (spec §4; it only works
 * for this one show). Emails are NOT sent, only a fingerprint (hash) so an
 * exact email can still be looked up offline.
 */
export async function GET() {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;

  const [tickets, stats] = await Promise.all([
    adminDb()
      .from("tickets")
      .select("id, short_code, status, checked_in_at, checked_in_device, ticket_types(name), orders!inner(order_no, buyer_first_name, buyer_last_name, buyer_email, status)")
      .eq("event_id", s.eventId)
      .neq("status", "void")
      .in("orders.status", ["paid", "comp"]),
    doorStats(s),
  ]);
  if (tickets.error) {
    console.error("door list failed:", tickets.error);
    return Response.json({ error: "server" }, { status: 500 });
  }

  const list: GuestList = {
    eventId: s.eventId,
    key: eventTicketKey(s.eventId).toString("base64url"),
    fetchedAt: Date.now(),
    doorSales: stats.doorSales,
    doorSalesMine: stats.doorSalesMine,
    tickets: (tickets.data as unknown as Row[]).map(
      (t): ListTicket => ({
        id: t.id,
        n: `${t.orders!.buyer_first_name} ${t.orders!.buyer_last_name}`.trim(),
        t: t.ticket_types?.name ?? "Ticket",
        c: t.short_code,
        o: t.orders!.order_no,
        s: t.status === "checked_in" ? "checked_in" : "valid",
        at: t.checked_in_at,
        by: t.checked_in_device,
        e: createHash("sha256").update(t.orders!.buyer_email.trim().toLowerCase()).digest("hex"),
      }),
    ),
  };
  return Response.json(list, { headers: { "Cache-Control": "no-store" } });
}
