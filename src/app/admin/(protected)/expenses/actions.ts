"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/clients";
import { dollarsToCents } from "@/lib/money";
import { isDemo } from "@/lib/demo";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

// Every action checks the admin login itself (layouts don't protect actions).
// Who TYPED an entry always comes from requireAdmin(), never from the form.

export type EntryFormState = { error?: string; savedAt?: number };

/** Default note on reimbursements (SPEC D33) [assumed]. */
const DEFAULT_REIMBURSEMENT_NOTE = "from ticket sale funds";

/** Refresh the expense log and the dashboard. */
function refresh() {
  revalidatePath("/admin", "layout");
}

type ParsedEntry =
  | { error: string }
  | { kind: "expense" | "reimbursement"; memberId: string; amount: number; description: string; category: string | null; note: string };

/** Reads + checks the fields shared by "add" and "edit". */
function parseEntry(formData: FormData): ParsedEntry {
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "expense" && kind !== "reimbursement") return { error: "Pick Expense or Reimbursement." };
  const amount = dollarsToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) return { error: "Amount must look like 20 or 20.50." };
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const memberId = String(formData.get("member_id") ?? "");

  if (kind === "expense") {
    if (!memberId) return { error: "Pick who spent the money." };
    if (!description) return { error: "Say what it was for (e.g. posters)." };
    const category = String(formData.get("category") ?? "");
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "Pick a category." };
    // Required (SPEC §13): no random entries.
    if (!note) return { error: "Add a note: the store, a receipt link, or why it was needed." };
    return { kind, memberId, amount, description, category, note };
  }

  if (!memberId) return { error: "Pick who you paid back." };
  return { kind, memberId, amount, description, category: null, note: note || DEFAULT_REIMBURSEMENT_NOTE };
}

/** The person picked must be on the list (e-board or spender), and shown. */
async function isListedPerson(memberId: string): Promise<boolean> {
  const { data } = await adminDb().from("eboard_members").select("id").eq("id", memberId).eq("active", true).maybeSingle();
  return !!data;
}

export async function addEntry(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const me = await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving starts working once Supabase is connected." };
  const p = parseEntry(formData);
  if ("error" in p) return { error: p.error };
  if (!(await isListedPerson(p.memberId))) return { error: "That person isn't on the list anymore. Refresh the page." };

  const { error } = await adminDb().from("ledger_entries").insert({
    kind: p.kind,
    member_id: p.memberId,
    entered_by_member_id: me.memberId,
    amount_cents: p.amount,
    description: p.description,
    category: p.category,
    note: p.note,
  });
  if (error) return { error: `Couldn't save: ${error.message}` };
  refresh();
  return { savedAt: Date.now() };
}

/** Edit an entry. Only the person who entered it can (SPEC D33). */
export async function updateEntry(entryId: string, _prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const me = await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving starts working once Supabase is connected." };
  const db = adminDb();
  const { data: existing } = await db.from("ledger_entries").select("kind, member_id, entered_by_member_id").eq("id", entryId).maybeSingle();
  if (!existing) return { error: "That entry doesn't exist anymore." };
  if (existing.entered_by_member_id !== me.memberId) return { error: "You can only edit entries you added." };

  formData.set("kind", existing.kind); // the type can't be switched while editing
  const p = parseEntry(formData);
  if ("error" in p) return { error: p.error };
  if (p.memberId !== existing.member_id && !(await isListedPerson(p.memberId))) return { error: "That person isn't on the list anymore." };

  const { error } = await db
    .from("ledger_entries")
    .update({ member_id: p.memberId, amount_cents: p.amount, description: p.description, category: p.category, note: p.note })
    .eq("id", entryId)
    .eq("entered_by_member_id", me.memberId);
  if (error) return { error: `Couldn't save: ${error.message}` };
  refresh();
  return { savedAt: Date.now() };
}

/** Delete an entry. Only the person who entered it can. */
export async function deleteEntry(formData: FormData) {
  const me = await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const { error } = await adminDb().from("ledger_entries").delete().eq("id", id).eq("entered_by_member_id", me.memberId);
  if (error) throw new Error(`Couldn't delete the entry: ${error.message}`);
  refresh();
}

/** The optional "I got it": only the person who was paid back can tap it (or undo it). */
export async function setReceived(formData: FormData) {
  const me = await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const got = formData.get("got") === "yes";
  const { error } = await adminDb()
    .from("ledger_entries")
    .update({ received_confirmed_at: got ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("kind", "reimbursement")
    .eq("member_id", me.memberId);
  if (error) throw new Error(`Couldn't update the entry: ${error.message}`);
  refresh();
}
