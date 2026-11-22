"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { isLeadershipPin, startAdminSession } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

export type LoginState = { error?: string };

// Lockout rules [assumed]: 5 wrong PINs from one device in 15 minutes, or
// 30 wrong PINs from anywhere in an hour (stops guessing from many devices).
const PER_IP_LIMIT = 5;
const PER_IP_MINUTES = 15;
const GLOBAL_LIMIT = 30;
const GLOBAL_MINUTES = 60;

const SETUP_MSG = "Login isn't set up yet: run supabase/migrations/0003_admin_login.sql in Supabase.";

/** "  rachel   CHEN " -> "rachel chen" */
function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Finds the e-board member they typed: full name, or just a first name if
 * only one active member has it ("Rachel" -> Rachel Chen).
 */
function matchMember<T extends { name: string }>(members: T[], typed: string): T | null {
  const t = normalize(typed);
  const full = members.find((m) => normalize(m.name) === t);
  if (full) return full;
  const byFirst = members.filter((m) => normalize(m.name).split(" ")[0] === t);
  return byFirst.length === 1 ? byFirst[0] : null;
}

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

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isDemo()) redirect("/admin");

  const typed = String(formData.get("name") ?? "").trim().slice(0, 100);
  const pin = String(formData.get("pin") ?? "").trim();
  if (!typed) return { error: "Type your name." };
  if (!pin) return { error: "Type the PIN." };

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
  if ((mine.count ?? 0) >= PER_IP_LIMIT) {
    return { error: `Too many wrong PINs. Wait ${PER_IP_MINUTES} minutes and try again.` };
  }
  if ((all.count ?? 0) >= GLOBAL_LIMIT) {
    return { error: "Login is paused for up to an hour because of too many wrong PINs." };
  }

  // 2. Is that name on the e-board list? (Not a PIN guess, so not counted.)
  // Only e-board can log in; spenders (0012_spenders.sql) are in the expense log only.
  let { data: members, error: mErr } = await db.from("eboard_members").select("id, name").eq("active", true).eq("role", "eboard");
  if (mErr?.code === "42703") {
    // 0012 not run yet: there are no spenders, so everyone on the list is e-board.
    ({ data: members, error: mErr } = await db.from("eboard_members").select("id, name").eq("active", true));
  }
  if (isMissingTable(mErr)) return { error: SETUP_MSG };
  if (mErr) {
    console.error("Login member lookup failed:", mErr.message);
    return { error: "Couldn't log in right now. Try again in a minute." };
  }
  const member = matchMember(members ?? [], typed);
  if (!member) return { error: "That name isn't on the e-board list. Try your full name." };

  // 3. Check the PIN and log the try either way.
  // If ADMIN_PIN is missing or isn't 4–8 digits on the server, env.adminPin
  // throws. Show a clear message instead of a crash page (this is what broke
  // the live login on 2026-11-21: the deploy didn't have a valid ADMIN_PIN yet).
  let ok: boolean;
  try {
    ok = isLeadershipPin(pin);
  } catch (err) {
    console.error("Admin login misconfigured:", err instanceof Error ? err.message : err);
    return { error: "Admin login isn't set up on the server: ADMIN_PIN must be 4–8 digits, then redeploy." };
  }
  const { error: logErr } = await db
    .from("admin_logins")
    .insert({ member_id: member.id, name_typed: typed, ip, success: ok });
  if (logErr) {
    // Fail closed: without the log, the lockout can't work.
    console.error("Login log failed:", logErr.message);
    return { error: isMissingTable(logErr) ? SETUP_MSG : "Couldn't log in right now. Try again in a minute." };
  }
  if (!ok) return { error: "Wrong PIN." };

  await startAdminSession({ memberId: member.id, name: member.name });
  redirect("/admin");
}
