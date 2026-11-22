import { adminDb } from "@/lib/supabase/clients";
import { doorSessionOr401, doorStats } from "@/lib/door";
import { ticketIdFromToken, verifyTicketToken } from "@/lib/ticket-token";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanResponse = {
  result: "ok" | "used" | "wrong_event" | "void" | "not_found" | "fake";
  /** So the phone can update its offline copy of the list. */
  ticketId?: string;
  name?: string;
  type?: string;
  checkedInAt?: string;
  deviceName?: string;
  eventName?: string;
  stats?: { sold: number; checkedIn: number; doorSales: number; doorSalesMine: number };
};

/**
 * Door check-in (spec §3.7). Body: { token } from a QR scan, or
 * { ticketId } from manual lookup. The first scan wins (D15).
 */
export async function POST(request: Request) {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;

  const body = (await request.json().catch(() => ({}))) as { token?: unknown; ticketId?: unknown };
  let ticketId: string | null = null;
  let method: "scan" | "lookup" = "scan";

  if (typeof body.token === "string") {
    const token = body.token.trim();
    ticketId = ticketIdFromToken(token);
    if (!ticketId) return Response.json({ result: "fake" } satisfies ScanResponse);
    if (!verifyTicketToken(token, s.eventId)) {
      // Not signed for this show. A real ticket for ANOTHER show, or a fake?
      const { data: t } = await adminDb().from("tickets").select("event_id, events(name)").eq("id", ticketId).maybeSingle();
      if (t && verifyTicketToken(token, t.event_id as string)) {
        const eventName = (t.events as unknown as { name: string } | null)?.name;
        return Response.json({ result: "wrong_event", eventName } satisfies ScanResponse);
      }
      return Response.json({ result: "fake" } satisfies ScanResponse);
    }
  } else if (typeof body.ticketId === "string" && UUID.test(body.ticketId)) {
    ticketId = body.ticketId;
    method = "lookup";
  } else {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { data, error } = await adminDb().rpc("door_check_in", {
    p_event_id: s.eventId,
    p_ticket_id: ticketId,
    p_device_id: s.deviceId,
    p_device_name: s.deviceName,
    p_method: method,
  });
  if (error) {
    console.error("door_check_in failed:", error);
    return Response.json({ error: "server" }, { status: 500 });
  }
  const r = data as { result: ScanResponse["result"]; name?: string; type?: string; checked_in_at?: string; device_name?: string; event_name?: string };
  const stats = await doorStats(s).catch(() => undefined);
  return Response.json({
    result: r.result,
    ticketId: ticketId ?? undefined,
    name: r.name,
    type: r.type,
    checkedInAt: r.checked_in_at,
    deviceName: r.device_name,
    eventName: r.event_name,
    stats,
  } satisfies ScanResponse);
}
