"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";
import { hashPin } from "@/lib/pin";
import { CAN_DOOR, newPin, uniqueUsername, type Role } from "@/lib/logins";

/*
 * Settings → People & logins. Every action checks the admin login itself.
 * A new PIN is shown ONCE to the admin who made it (to pass on privately);
 * only its hash is stored.
 */

export type NewLogin = { name: string; username: string; pin: string };
export type PeopleState = { error?: string; ok?: string; login?: NewLogin };

const ROLES: Role[] = ["eboard", "volunteer", "spender"];
const needsLogin = (r: Role) => CAN_DOOR.includes(r); // e-board and volunteers sign in

function refresh() {
  revalidatePath("/admin", "layout");
}

async function takenUsernames(): Promise<string[]> {
  const { data, error } = await adminDb().from("eboard_members").select("username").not("username", "is", null);
  if (error) throw error;
  return (data as { username: string }[]).map((d) => d.username);
}

/** Gives this person a username (if they don't have one) and a brand-new PIN. */
async function issueLogin(id: string, name: string, currentUsername: string | null): Promise<NewLogin> {
  const username = currentUsername ?? uniqueUsername(name, await takenUsernames());
  const pin = newPin();
  const { error } = await adminDb().from("eboard_members").update({ username, pin_hash: await hashPin(pin) }).eq("id", id);
  if (error) throw error;
  return { name, username, pin };
}

function roleLabel(r: Role) {
  return r === "eboard" ? "e-board" : r === "volunteer" ? "a door volunteer" : "a spender";
}

const SETUP = "Run supabase/migrations/0013_personal_logins.sql in Supabase first.";
const isSetupError = (e: { code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || e.code === "23514");

/** Add someone (or bring back someone who was removed). */
export async function addPerson(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving is off." };
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const role = String(formData.get("role") ?? "") as Role;
  if (!ROLES.includes(role)) return { error: "Pick what they are." };
  if (!name) return { error: "Type their full name." };
  if (!/\s/.test(name)) return { error: "Use their full name (first and last). Their username is made from it." };

  const db = adminDb();
  const { data: existing, error: findErr } = await db.from("eboard_members").select("id, active, username, pin_hash").eq("name", name).maybeSingle();
  if (findErr) return { error: `Couldn't add ${name}: ${findErr.message}` };
  let id: string;
  if (existing) {
    if (existing.active) return { error: `${name} is already on the list.` };
    const { error } = await db.from("eboard_members").update({ active: true, role }).eq("id", existing.id);
    if (error) return { error: isSetupError(error) ? SETUP : `Couldn't add ${name}: ${error.message}` };
    id = existing.id as string;
  } else {
    const { data: last } = await db.from("eboard_members").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const { data, error } = await db
      .from("eboard_members")
      .insert({ name, role, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return { error: isSetupError(error) ? SETUP : `Couldn't add ${name}: ${error.message}` };
    id = data.id as string;
  }

  let login: NewLogin | undefined;
  if (needsLogin(role)) {
    try {
      // Someone coming back keeps their username but always gets a fresh PIN.
      login = await issueLogin(id, name, (existing?.username as string | null) ?? null);
    } catch (err) {
      return { error: isSetupError(err as { code?: string }) ? SETUP : `Added ${name}, but couldn't make their login. Try "New PIN".` };
    }
  }
  refresh();
  return { ok: `Added ${name} as ${roleLabel(role)}.`, login };
}

/** A fresh PIN (forgot theirs, or it may have been seen). Logs them out everywhere. */
export async function resetPin(id: string, _prev: PeopleState): Promise<PeopleState> {
  void _prev; // useActionState passes the last result; not needed here
  await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving is off." };
  const { data: m, error } = await adminDb().from("eboard_members").select("id, name, role, active, username").eq("id", id).maybeSingle();
  if (error) return { error: isSetupError(error) ? SETUP : error.message };
  if (!m || !m.active || !needsLogin(m.role as Role)) return { error: "Only e-board and door volunteers have logins." };
  try {
    const login = await issueLogin(m.id as string, m.name as string, (m.username as string | null) ?? null);
    refresh();
    return { login };
  } catch (err) {
    return { error: isSetupError(err as { code?: string }) ? SETUP : "Couldn't make a new PIN. Try again." };
  }
}

/** Switch someone between e-board, door volunteer and spender. */
export async function setRole(id: string, _prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const me = await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving is off." };
  const role = String(formData.get("role") ?? "") as Role;
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (id === me.memberId && role !== "eboard") return { error: "You can't take away your own admin access." };
  const db = adminDb();
  const { data: m, error } = await db.from("eboard_members").select("id, name, username, pin_hash").eq("id", id).maybeSingle();
  if (error || !m) return { error: error ? (isSetupError(error) ? SETUP : error.message) : "That person isn't on the list." };
  const { error: upErr } = await db.from("eboard_members").update({ role }).eq("id", id);
  if (upErr) return { error: isSetupError(upErr) ? SETUP : upErr.message };
  let login: NewLogin | undefined;
  // Newly able to sign in and no PIN yet: make one now.
  if (needsLogin(role) && !m.pin_hash) login = await issueLogin(m.id as string, m.name as string, (m.username as string | null) ?? null);
  refresh();
  return { ok: `${m.name} is now ${roleLabel(role)}.`, login };
}

/** Remove someone (or bring them back). Their past expense entries stay; removed people can't sign in. */
export async function setActive(formData: FormData) {
  const me = await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "yes";
  if (!active && id === me.memberId) throw new Error("You can't remove yourself.");
  const { error } = await adminDb().from("eboard_members").update({ active }).eq("id", id);
  if (error) throw new Error(`Couldn't update the list: ${error.message}`);
  refresh();
}
