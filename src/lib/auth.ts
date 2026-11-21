import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo";

/*
 * ADMIN LOGIN (SPEC D18): an e-board member types their name + the
 * leadership PIN (ADMIN_PIN, one shared PIN for now). After that, a signed
 * cookie says who they are. The cookie can't be forged or edited without
 * the server's secret key.
 *
 * The secret used to sign it includes ADMIN_PIN, so changing the PIN logs
 * everyone out.
 */

export type AdminSession = { memberId: string; name: string };

const COOKIE = "dia_admin";
const SESSION_DAYS = 7;

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function sign(data: string): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(`admin-session-v1|${env.supabaseSecretKey}|${env.adminPin}`);
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

/** Compares two byte arrays without leaking where they differ. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** True if the typed PIN is the leadership PIN. */
export function isLeadershipPin(pin: string): boolean {
  const enc = new TextEncoder();
  return sameBytes(enc.encode(pin), enc.encode(env.adminPin));
}

/** Logs this browser in. Only call from a Server Action. */
export async function startAdminSession(session: AdminSession) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ m: session.memberId, n: session.name, e: exp })));
  const token = `${payload}.${b64url(await sign(payload))}`;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true, // page scripts can't read it
    secure: process.env.NODE_ENV === "production", // https only once deployed
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Logs this browser out. Only call from a Server Action. */
export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

/** Who is logged in, or null. Checks the signature and the expiry. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!sameBytes(fromB64url(sig), await sign(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data.e !== "number" || data.e < Date.now() / 1000) return null;
    if (typeof data.m !== "string" || typeof data.n !== "string") return null;
    return { memberId: data.m, name: data.n };
  } catch {
    return null;
  }
}

/**
 * Call at the top of EVERY admin page and EVERY admin Server Action.
 * (Layouts alone don't protect Server Actions, so each action checks too.)
 * Anyone not logged in is sent to the login page.
 */
export async function requireAdmin(): Promise<AdminSession> {
  // Demo mode (no Supabase yet): there is no real data to protect, so the
  // admin pages open without login. This can never happen once Supabase
  // keys are set, because then isDemo() is false.
  if (isDemo()) return { memberId: "demo", name: "demo preview" };

  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
