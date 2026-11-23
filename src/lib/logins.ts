import "server-only";
import { createHash, randomInt } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";

/*
 * Personal logins (2026-11-22, supabase/migrations/0013_personal_logins.sql).
 * Everyone signs in with a username (first initial + last name: "rchen")
 * and their own 6-digit PIN, for admin and for the door app.
 *   eboard    -> admin + door
 *   volunteer -> door only
 *   spender   -> no login (expense log only)
 * Only a salted hash of each PIN is stored (lib/pin.ts).
 */

export type Role = "eboard" | "spender" | "volunteer";
export type LoginMember = { id: string; name: string; role: Role; active: boolean; username: string | null; pin_hash: string | null };

/** Who can sign in where. */
export const CAN_ADMIN: Role[] = ["eboard"];
export const CAN_DOOR: Role[] = ["eboard", "volunteer"];

/** "Rachel Chen" -> "rchen"; "Mary Ann de la Cruz" -> "mcruz". Letters only, lower case. */
export function baseUsername(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[^A-Za-z\s-]/g, "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "user";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1] : words[0].slice(1);
  return (first + last).toLowerCase() || "user";
}

/** A username nobody else has: rchen, then rchen2, rchen3… */
export function uniqueUsername(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const base = baseUsername(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** A random 6-digit PIN (100000–999999, so it never starts with 0). */
export function newPin(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Short fingerprint of a PIN hash, kept in login cookies: a new PIN logs the old sessions out. */
export function pinFingerprint(pinHash: string): string {
  return createHash("sha256").update(pinHash).digest("base64url").slice(0, 16);
}

export function normalizeUsername(typed: string): string {
  return typed.trim().toLowerCase().replace(/\s+/g, "");
}

/** The person with this username, if any (any role, active or not). */
export async function findByUsername(username: string): Promise<LoginMember | null> {
  const u = normalizeUsername(username);
  if (!/^[a-z0-9]{1,40}$/.test(u)) return null;
  const { data, error } = await adminDb()
    .from("eboard_members")
    .select("id, name, role, active, username, pin_hash")
    .ilike("username", u) // letters + digits only, so no wildcards to escape
    .maybeSingle();
  if (error) throw error;
  return data as LoginMember | null;
}

export async function getLoginMember(id: string): Promise<LoginMember | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await adminDb().from("eboard_members").select("id, name, role, active, username, pin_hash").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as LoginMember | null;
}

/** Can this person sign in to admin (or the door) right now? */
export function canSignIn(m: LoginMember | null, roles: Role[]): m is LoginMember & { pin_hash: string } {
  return !!m && m.active && roles.includes(m.role) && !!m.pin_hash;
}

/** "Rachel Chen" -> "Rachel": shown on door check-ins ("scanned by Rachel"). */
export function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
