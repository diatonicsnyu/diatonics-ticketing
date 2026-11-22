import { adminDb } from "@/lib/supabase/clients";
import { doorSessionOr401, toStats } from "@/lib/door";

export const dynamic = "force-dynamic";

/** Door-sale counter +1 / -1 (D32). Count only: no amounts, names or payment info. */
export async function POST(request: Request) {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;
  const { delta } = (await request.json().catch(() => ({}))) as { delta?: unknown };
  if (delta !== 1 && delta !== -1) return Response.json({ error: "bad_request" }, { status: 400 });

  const { data, error } = await adminDb().rpc("door_sale_change", { p_event_id: s.eventId, p_device_id: s.deviceId, p_delta: delta });
  if (error) {
    console.error("door_sale_change failed:", error);
    return Response.json({ error: "server" }, { status: 500 });
  }
  return Response.json(toStats(data));
}
