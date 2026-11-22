"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { endDoorSession, listDoorEvents, startDoorSession } from "@/lib/door";
import { verifyPin } from "@/lib/pin";

export type DoorLoginState = { error?: string };

// Lockout [assumed, same as the admin login]: 5 wrong PINs from one phone in
// 15 minutes, or 30 wrong PINs from anywhere in an hour.
const PER_IP_LIMIT = 5;
const PER_IP_MINUTES = 15;
const GLOBAL_LIMIT = 30;
const GLOBAL_MINUTES = 60;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function doorLogin(_prev: DoorLoginState, formData: FormData): Promise<DoorLoginState> {
  const eventId = String(formData.get("event_id") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  const pin = String(formData.get("pin") ?? "").trim();
  if (!name) return { error: "Type your name (it shows on check-ins, like “scanned by Maya”)." };
  if (!/^\d{4,8}$/.test(pin)) return { error: "The door PIN is 4 to 8 digits." };

  const db = adminDb();
  const ip = await clientIp();
  const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const [mine, all] = await Promise.all([
    db.from("door_logins").select("id", { count: "exact", head: true }).eq("ip", ip).eq("success", false).gte("created_at", since(PER_IP_MINUTES)),
    db.from("door_logins").select("id", { count: "exact", head: true }).eq("success", false).gte("created_at", since(GLOBAL_MINUTES)),
  ]);
  if (mine.error || all.error) {
    console.error("door login check failed:", mine.error ?? all.error);
    return { error: "The door app isn't set up yet: run supabase/migrations/0007_door.sql in Supabase." };
  }
  if ((mine.count ?? 0) >= PER_IP_LIMIT) return { error: `Too many wrong PINs. Wait ${PER_IP_MINUTES} minutes, then try again.` };
  if ((all.count ?? 0) >= GLOBAL_LIMIT) return { error: "Too many wrong PINs. Door login is paused for a bit. Ask the group leader." };

  const event = (await listDoorEvents()).find((e) => e.id === eventId);
  if (!event) return { error: "Pick a show from the list." };
  if (!event.door_pin_hash) return { error: "This show has no door PIN yet. Ask the group leader to set one in admin." };

  const ok = await verifyPin(pin, event.door_pin_hash);
  await db.from("door_logins").insert({ event_id: event.id, ip, name_typed: name, success: ok });
  if (!ok) return { error: "Wrong PIN. Check with the group leader." };

  await startDoorSession(event, name);
  redirect("/door");
}

export async function doorLogout() {
  await endDoorSession();
  redirect("/door");
}
