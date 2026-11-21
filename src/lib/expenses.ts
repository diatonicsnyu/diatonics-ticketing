import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";

// ---------- types (mirror supabase/migrations/0002_expenses.sql) ----------

export type EboardMember = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type Expense = {
  id: string;
  member_id: string;
  spent_on: string; // "2026-11-21"
  description: string;
  category: string;
  amount_cents: number;
  reimbursed_at: string | null; // null = still owed
  notes: string;
  created_at: string;
};

export type MemberTotals = {
  member: EboardMember;
  count: number;
  spent_cents: number;
  reimbursed_cents: number;
  owed_cents: number;
};

export type ExpenseData =
  | { status: "demo" }
  | { status: "setup_needed" } // migration 0002 hasn't been run yet
  | { status: "ok"; members: EboardMember[]; expenses: Expense[] };

/** Supabase error codes that mean "this table doesn't exist yet". */
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

// ---------- admin queries (call requireAdmin() first!) ----------

export async function loadExpenseData(): Promise<ExpenseData> {
  if (isDemo()) return { status: "demo" };
  const db = adminDb();
  const [m, e] = await Promise.all([
    db.from("eboard_members").select("id, name, active, sort_order").order("sort_order").order("name"),
    db
      .from("expenses")
      .select("id, member_id, spent_on, description, category, amount_cents, reimbursed_at, notes, created_at")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (isMissingTable(m.error) || isMissingTable(e.error)) return { status: "setup_needed" };
  if (m.error) throw m.error;
  if (e.error) throw e.error;
  return { status: "ok", members: m.data as EboardMember[], expenses: e.data as Expense[] };
}

/**
 * One row per person: what they spent, what's been paid back, what's still
 * owed. People hidden from the e-board list still show if they have expenses.
 */
export function totalsByMember(members: EboardMember[], expenses: Expense[]): MemberTotals[] {
  return members
    .map((member) => {
      const mine = expenses.filter((x) => x.member_id === member.id);
      const spent = mine.reduce((s, x) => s + x.amount_cents, 0);
      const reimbursed = mine.filter((x) => x.reimbursed_at).reduce((s, x) => s + x.amount_cents, 0);
      return { member, count: mine.length, spent_cents: spent, reimbursed_cents: reimbursed, owed_cents: spent - reimbursed };
    })
    .filter((t) => t.member.active || t.count > 0);
}

/**
 * Total still owed to the e-board, for the admin home page. Never throws:
 * returns null if the expense tables aren't set up yet, so the events page
 * keeps working either way.
 */
export async function owedToEboardCents(): Promise<number | null> {
  if (isDemo()) return null;
  const { data, error } = await adminDb().from("expenses").select("amount_cents").is("reimbursed_at", null);
  if (error || !data) return null;
  return data.reduce((s, r) => s + (r.amount_cents as number), 0);
}

/** "2026-11-21" -> "Nov 21, 2026" (a plain date, so no time zone shifting). */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
