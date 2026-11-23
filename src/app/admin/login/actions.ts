"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { startAdminSession } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { verifyPin } from "@/lib/pin";
import { CAN_ADMIN, canSignIn, findByUsername, normalizeUsername } from "@/lib/logins";

export type LoginState = { error?: string };

// Lockout rules [assumed]: 5 wrong tries from one device in 15 minutes, or
// 30 wrong tries from anywhere in an hour (stops guessing from many devices).
const PER_IP_LIMIT = 5;
const PER_IP_MINUTES = 15;
const GLOBAL_LIMIT = 30;
const GLOBAL_MINUTES = 60;

const SETUP_MSG = "Login isn't set up yet: run supabase/migrations/0013_personal_logins.sql and private/set-logins.sql in Supabase.";

// A real hash to check against when the username doesn't exist, so a wrong
// username takes as long as a wrong PIN (nobody can tell which was wrong).
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/** Tables from 0002/0003 don't exist yet. */
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

/** Admin sign-in: username ("rchen") + your own 6-digit PIN. E-board only. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isDemo()) redirect("/admin");

  const typed = normalizeUsername(String(formData.get("username") ?? "")).slice(0, 40);
  const pin = String(formData.get("pin") ?? "").trim();
  if (!typed) return { error: "Type your username (like rchen)." };
  if (!/^\d{4,8}$/.test(pin)) return { error: "Your PIN is 6 digits." };

  const db = adminDb();
  const ip = await clientIp();

  // 1. Locked out? (Checked first, so a locked-out guesser learns nothing.)
  const [mine, all] = await Promise.all([
    db.from("admin_logins").select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("success", false).gte("created_at", minutesAgo(PER_IP_MINUTES)),
    db.from("admin_logins").select("id", { count: "exact", head: true })
      .eq("success", false).gte("created_at", minutesAgo(GLOBAL_MINUTES)),
  ]);
  if (isMissingTable(mine.error) || isMissingTable(all.error)) return { error: SETUP_MSG };
  if (mine.error || all.error) {
    console.error("Login lockout check failed:", (mine.error ?? all.error)?.message);
    return { error: "Couldn't log in right now. Try again in a minute." };
  }
  if ((mine.count ?? 0) >= PER_IP_LIMIT) return { error: `Too many wrong tries. Wait ${PER_IP_MINUTES} minutes and try again.` };
  if ((all.count ?? 0) >= GLOBAL_LIMIT) return { error: "Login is paused for up to an hour because of too many wrong tries." };

  // 2. Who is it, and is the PIN right? Same answer for a wrong username or a wrong PIN.
  let member;
  try {
    member = await findByUsername(typed);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42703") return { error: SETUP_MSG }; // username column missing: 0013 not run
    console.error("Login lookup failed:", err);
    return { error: "Couldn't log in right now. Try again in a minute." };
  }
  const allowed = canSignIn(member, CAN_ADMIN);
  const pinOk = await verifyPin(pin, member?.pin_hash ?? DUMMY_HASH);
  const ok = allowed && pinOk;

  const { error: logErr } = await db
    .from("admin_logins")
    .insert({ member_id: member?.id ?? null, name_typed: typed, ip, success: ok });
  if (logErr) {
    // Fail closed: without the log, the lockout can't work.
    console.error("Login log failed:", logErr.message);
    return { error: "Couldn't log in right now. Try again in a minute." };
  }
  if (!ok) {
    // A volunteer or spender with the right PIN: say why, instead of "wrong".
    if (member && pinOk && member.active && member.role !== "eboard") {
      return { error: member.role === "volunteer" ? "Your login is for the door app only (at /door)." : "Your name is on the expense log, but you don't have an admin login." };
    }
    return { error: "Wrong username or PIN." };
  }

  await startAdminSession({ memberId: member!.id, name: member!.name }, member!.pin_hash!);
  redirect("/admin");
}
