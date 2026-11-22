import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";

/*
 * Venmo-style expense log (SPEC D33, §6 LedgerEntry).
 * One shared log of:
 *  - EXPENSES: someone spent their own money on the group (red/pink)
 *  - REIMBURSEMENTS: money sent back to someone (green)
 * Per-person balance = expenses - reimbursements = still owed.
 * Tables: supabase/migrations/0005_ledger.sql (+ eboard_members from 0002).
 */

export type EboardMember = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type LedgerKind = "expense" | "reimbursement";

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  member_id: string; // expense: who spent · reimbursement: who was paid back
  entered_by_member_id: string | null; // who typed it in (from the login)
  amount_cents: number;
  description: string;
  category: string | null;
  note: string;
  received_confirmed_at: string | null; // the optional "I got it"
  created_at: string;
};

export type MemberBalance = {
  member: EboardMember;
  spent_cents: number;
  reimbursed_cents: number;
  /** spent - reimbursed. Negative = paid back more than they spent. */
  owed_cents: number;
};

export type LedgerData =
  | { status: "demo" }
  | { status: "setup_needed" } // migration 0005 hasn't been run yet
  | { status: "ok"; members: EboardMember[]; entries: LedgerEntry[] };

/** Supabase error codes that mean "this table doesn't exist yet". */
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

const ENTRY_COLUMNS =
  "id, kind, member_id, entered_by_member_id, amount_cents, description, category, note, received_confirmed_at, created_at";

// ---------- admin queries (call requireAdmin() first!) ----------

/** The whole shared log (newest first) and the e-board list. */
export async function loadLedger(): Promise<LedgerData> {
  if (isDemo()) return { status: "demo" };
  const db = adminDb();
  const [m, e] = await Promise.all([
    db.from("eboard_members").select("id, name, active, sort_order").order("sort_order").order("name"),
    db.from("ledger_entries").select(ENTRY_COLUMNS).order("created_at", { ascending: false }),
  ]);
  if (isMissingTable(m.error) || isMissingTable(e.error)) return { status: "setup_needed" };
  if (m.error) throw m.error;
  if (e.error) throw e.error;
  return { status: "ok", members: m.data as EboardMember[], entries: e.data as LedgerEntry[] };
}

/**
 * One row per person. People hidden from the e-board list still show if
 * they have entries.
 */
export function balancesByMember(members: EboardMember[], entries: LedgerEntry[]): MemberBalance[] {
  return members
    .map((member) => {
      const mine = entries.filter((x) => x.member_id === member.id);
      const spent = mine.filter((x) => x.kind === "expense").reduce((s, x) => s + x.amount_cents, 0);
      const reimbursed = mine.filter((x) => x.kind === "reimbursement").reduce((s, x) => s + x.amount_cents, 0);
      return { member, spent_cents: spent, reimbursed_cents: reimbursed, owed_cents: spent - reimbursed };
    })
    .filter((b) => b.member.active || b.spent_cents > 0 || b.reimbursed_cents > 0);
}

/**
 * Total still owed to the e-board: the sum of everyone's positive balance
 * [assumed: someone who was overpaid doesn't cancel out what others are owed].
 */
export function totalOwed(balances: MemberBalance[]): number {
  return balances.reduce((s, b) => s + Math.max(0, b.owed_cents), 0);
}

export type LedgerTotals = { spentCents: number; reimbursedCents: number; owedCents: number };

/**
 * Totals for the dashboard + the admin home. Never throws: returns null if
 * the log isn't set up yet, so the dashboard keeps working either way.
 */
export async function ledgerTotals(): Promise<LedgerTotals | null> {
  const data = await loadLedger().catch(() => null);
  if (!data || data.status !== "ok") return null;
  const balances = balancesByMember(data.members, data.entries);
  return {
    spentCents: data.entries.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount_cents, 0),
    reimbursedCents: data.entries.filter((e) => e.kind === "reimbursement").reduce((s, e) => s + e.amount_cents, 0),
    owedCents: totalOwed(balances),
  };
}

/** "Nov 21, 2026" in New York time. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

/** Names for the log: first names, unless two people share one (then full names). */
export function nameLookup(members: Pick<EboardMember, "id" | "name">[]): (id: string | null) => string {
  const firstCounts = new Map<string, number>();
  for (const m of members) firstCounts.set(firstName(m.name), (firstCounts.get(firstName(m.name)) ?? 0) + 1);
  const byId = new Map(members.map((m) => [m.id, (firstCounts.get(firstName(m.name)) ?? 0) > 1 ? m.name : firstName(m.name)]));
  return (id) => (id ? (byId.get(id) ?? "Someone") : "Someone");
}

/** "Rachel Chen" -> "Rachel" (the log reads like Venmo: "Callum spent $20"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
