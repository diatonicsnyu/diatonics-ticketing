import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo";
import { CAN_ADMIN, canSignIn, getLoginMember, pinFingerprint } from "@/lib/logins";

/*
 * ADMIN LOGIN (SPEC D18, personal logins since 2026-11-22): an e-board
 * member types their username ("rchen") and their own PIN. After that, a
 * signed cookie says who they are. The cookie can't be forged or edited
 * without the server's secret key.
 *
 * Every request re-checks the person in the database: if they're removed,
 * made a spender, or get a new PIN, their old logins stop working at once.
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
  const keyMaterial = new TextEncoder().encode(`admin-session-v2|${env.supabaseSecretKey}`);
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

/** Logs this browser in. Only call from a Server Action, after checking the PIN. */
export async function startAdminSession(session: AdminSession, pinHash: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ m: session.memberId, n: session.name, e: exp, p: pinFingerprint(pinHash) })));
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

/**
 * Who is logged in, or null. Checks the signature, the expiry, and that the
 * person is still e-board with the same PIN. Cached per request (the layout
 * and the page both ask).
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let data: { m?: unknown; n?: unknown; e?: unknown; p?: unknown };
  try {
    if (!sameBytes(fromB64url(sig), await sign(payload))) return null;
    data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  } catch {
    return null;
  }
  if (typeof data.e !== "number" || data.e < Date.now() / 1000) return null;
  if (typeof data.m !== "string" || typeof data.n !== "string" || typeof data.p !== "string") return null;
  const member = await getLoginMember(data.m).catch(() => null);
  if (!canSignIn(member, CAN_ADMIN) || pinFingerprint(member.pin_hash) !== data.p) return null;
  return { memberId: member.id, name: member.name };
});

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
