import { adminDb } from "@/lib/supabase/clients";
import { doorSessionOr401, toStats } from "@/lib/door";
import type { PendingCheckIn, PendingSale, SyncResponse } from "@/app/door/offline";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Sends what a door phone did while offline: check-ins and door-sale taps
 * (spec §3.7 "Offline behavior"). Safe to send twice. Tickets let in on two
 * offline phones come back as "duplicate" and are flagged for admin.
 */
export async function POST(request: Request) {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;

  const body = (await request.json().catch(() => ({}))) as { checkIns?: PendingCheckIn[]; sales?: PendingSale[] };
  const checkIns = (Array.isArray(body.checkIns) ? body.checkIns : [])
    .filter((c) => c && CID.test(String(c.cid)) && UUID.test(String(c.ticketId)))
    .slice(0, 1000)
    .map((c) => {
      const at = new Date(c.at);
      return {
        cid: c.cid,
        ticket_id: c.ticketId,
        at: (Number.isNaN(at.getTime()) ? new Date() : at).toISOString(),
        method: c.method === "lookup" ? "lookup" : "scan",
      };
    });
  const sales = (Array.isArray(body.sales) ? body.sales : [])
    .filter((x) => x && CID.test(String(x.cid)) && (x.delta === 1 || x.delta === -1))
    .slice(0, 1000)
    .map((x) => ({ cid: x.cid, delta: x.delta }));

  try {
    const { data, error } = await adminDb().rpc("door_sync", {
      p_event_id: s.eventId,
      p_device_id: s.deviceId,
      p_device_name: s.deviceName,
      p_check_ins: checkIns,
      p_sales: sales,
    });
    if (error) throw error;
    const r = data as { check_ins: SyncResponse["checkIns"]; stats: unknown };
    return Response.json({ checkIns: r.check_ins, stats: toStats(r.stats) } satisfies SyncResponse);
  } catch (err) {
    console.error("door sync failed:", err);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
