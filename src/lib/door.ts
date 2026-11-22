import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/supabase/clients";
import { env } from "@/lib/env";

/*
 * DOOR LOGIN (spec §3.7, D16): a volunteer picks the show, types their name
 * and the show's door PIN. After that, a signed cookie says which show this
 * phone scans for and who's holding it. It's signed with a key that includes
 * the show's PIN hash, so changing the door PIN logs every door phone out.
 * Volunteers only ever see the door list (no money, no emails).
 */

export type DoorSession = {
  eventId: string;
  eventName: string;
  /** Random id for this phone's login (scan history, door-sale counter). */
  deviceId: string;
  /** The volunteer's name, shown as "scanned by Maya". */
  deviceName: string;
};

const COOKIE = "dia_door";
const SESSION_HOURS = 24; // [assumed] one show night

export type DoorEvent = { id: string; name: string; starts_at: string; door_pin_hash: string | null };

function sign(pinHash: string, payload: string): string {
  return createHmac("sha256", `door-session-v1|${env.ticketSecret}|${pinHash}`).update(payload).digest("base64url");
}

/**
 * Shows a door phone can log into: not drafts, not long over, starting
 * within the next 2 weeks [assumed]. Soonest first.
 */
export async function listDoorEvents(): Promise<DoorEvent[]> {
  const now = Date.now();
  const { data, error } = await adminDb()
    .from("events")
    .select("id, name, starts_at, door_pin_hash")
    .in("status", ["on_sale", "closed"])
    .gt("starts_at", new Date(now - 12 * 60 * 60_000).toISOString())
    .lt("starts_at", new Date(now + 14 * 24 * 60 * 60_000).toISOString())
    .order("starts_at");
  if (error) throw error;
  return data as DoorEvent[];
}

/** Logs this phone in for a show. Only call from a Server Action, after checking the PIN. */
export async function startDoorSession(event: DoorEvent, deviceName: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 60 * 60;
  const deviceId = randomBytes(9).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ e: event.id, d: deviceId, n: deviceName, x: exp })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(event.door_pin_hash ?? "", payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function endDoorSession() {
  (await cookies()).delete(COOKIE);
}

/** Which show this phone is logged into, or null. Checks the signature, expiry and the current PIN. */
export async function getDoorSession(): Promise<DoorSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let data: { e?: unknown; d?: unknown; n?: unknown; x?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data.e !== "string" || typeof data.d !== "string" || typeof data.n !== "string" || typeof data.x !== "number") return null;
  if (data.x < Date.now() / 1000) return null;
  if (!/^[0-9a-f-]{36}$/i.test(data.e)) return null;

  const { data: ev, error } = await adminDb()
    .from("events")
    .select("id, name, door_pin_hash, status")
    .eq("id", data.e)
    .maybeSingle();
  if (error) throw error;
  if (!ev || !ev.door_pin_hash || ev.status === "draft") return null;

  const expected = Buffer.from(sign(ev.door_pin_hash, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { eventId: ev.id, eventName: ev.name, deviceId: data.d, deviceName: data.n };
}

/** For /api/door/* routes: the session, or a 401 response to send back. */
export async function doorSessionOr401(): Promise<DoorSession | Response> {
  const s = await getDoorSession();
  return s ?? Response.json({ error: "logged_out" }, { status: 401 });
}

export type DoorStats = { sold: number; checkedIn: number; doorSales: number; doorSalesMine: number };

export async function doorStats(s: DoorSession): Promise<DoorStats> {
  const { data, error } = await adminDb().rpc("door_stats", { p_event_id: s.eventId, p_device_id: s.deviceId });
  if (error) throw error;
  return toStats(data);
}

export function toStats(d: unknown): DoorStats {
  const r = d as { sold: number; checked_in: number; door_sales: number; door_sales_mine: number };
  return { sold: r.sold, checkedIn: r.checked_in, doorSales: r.door_sales, doorSalesMine: r.door_sales_mine };
}
