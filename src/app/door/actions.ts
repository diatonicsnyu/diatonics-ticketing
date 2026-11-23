"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { endDoorSession, listDoorEvents, startDoorSession } from "@/lib/door";
import { getAdminSession } from "@/lib/auth";
import { verifyPin } from "@/lib/pin";
import { CAN_DOOR, canSignIn, findByUsername, getLoginMember, normalizeUsername, shortName } from "@/lib/logins";

export type DoorLoginState = { error?: string };

// Lockout [assumed, same as the admin login]: 5 wrong tries from one phone in
// 15 minutes, or 30 wrong tries from anywhere in an hour.
const PER_IP_LIMIT = 5;
const PER_IP_MINUTES = 15;
const GLOBAL_LIMIT = 30;
const GLOBAL_MINUTES = 60;

// See the admin login: a wrong username takes as long as a wrong PIN.
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Door sign-in: pick the show, then your own username + PIN (volunteers and e-board). */
export async function doorLogin(_prev: DoorLoginState, formData: FormData): Promise<DoorLoginState> {
  const eventId = String(formData.get("event_id") ?? "");
  const typed = normalizeUsername(String(formData.get("username") ?? "")).slice(0, 40);
  const pin = String(formData.get("pin") ?? "").trim();
  if (!typed) return { error: "Type your username (like rchen)." };
  if (!/^\d{4,8}$/.test(pin)) return { error: "Your PIN is 6 digits." };

  const db = adminDb();
  const ip = await clientIp();
  const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const [mine, all] = await Promise.all([
    db.from("door_logins").select("id", { count: "exact", head: true }).eq("ip", ip).eq("success", false).gte("created_at", since(PER_IP_MINUTES)),
    db.from("door_logins").select("id", { count: "exact", head: true }).eq("success", false).gte("created_at", since(GLOBAL_MINUTES)),
  ]);
  if (mine.error || all.error) {
    console.error("door login check failed:", mine.error ?? all.error);
    return { error: "The door app isn't set up yet. Ask the group leader." };
  }
  if ((mine.count ?? 0) >= PER_IP_LIMIT) return { error: `Too many wrong tries. Wait ${PER_IP_MINUTES} minutes, then try again.` };
  if ((all.count ?? 0) >= GLOBAL_LIMIT) return { error: "Too many wrong tries. Door login is paused for a bit. Ask the group leader." };

  const event = (await listDoorEvents()).find((e) => e.id === eventId);
  if (!event) return { error: "Pick a show from the list." };

  let member;
  try {
    member = await findByUsername(typed);
  } catch (err) {
    console.error("door login lookup failed:", err);
    return { error: "Door logins aren't set up yet. Ask the group leader." };
  }
  const pinOk = await verifyPin(pin, member?.pin_hash ?? DUMMY_HASH);
  const ok = canSignIn(member, CAN_DOOR) && pinOk;
  await db.from("door_logins").insert({ event_id: event.id, ip, name_typed: member?.name ?? "", username_typed: typed, member_id: member?.id ?? null, success: ok });
  if (!canSignIn(member, CAN_DOOR) || !pinOk) return { error: "Wrong username or PIN. Check with the group leader." };

  await startDoorSession(event, member, shortName(member.name));
  redirect("/door");
}

/** "Scan as <name>": an e-board member already logged in to admin just picks the show. */
export async function doorLoginAsAdmin(formData: FormData) {
  const admin = await getAdminSession();
  if (!admin) redirect("/door");
  const event = (await listDoorEvents()).find((e) => e.id === String(formData.get("event_id") ?? ""));
  const member = await getLoginMember(admin.memberId);
  if (!event || !canSignIn(member, CAN_DOOR)) redirect("/door");
  await startDoorSession(event, member, shortName(member.name));
  redirect("/door");
}

export async function doorLogout() {
  await endDoorSession();
  redirect("/door");
}
