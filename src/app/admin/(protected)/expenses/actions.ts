"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/clients";
import { dollarsToCents } from "@/lib/money";
import { isDemo } from "@/lib/demo";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

// Every action checks the admin login itself (layouts don't protect actions).

export type ExpenseFormState = { error?: string; savedAt?: number };

/** Refresh the expenses page and the admin home ("owed to e-board" line). */
function refresh() {
  revalidatePath("/admin", "layout");
}

export async function addExpense(_prev: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  await requireAdmin();
  if (isDemo()) return { error: "Demo preview: saving starts working once Supabase is connected." };

  const memberId = String(formData.get("member_id") ?? "");
  const spentOn = String(formData.get("spent_on") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const amount = dollarsToCents(String(formData.get("amount") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!memberId) return { error: "Pick who paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) return { error: "Pick the date they paid." };
  if (!description) return { error: "Say what it was for (e.g. diatonics.com domain)." };
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "Pick a category." };
  if (amount === null || amount <= 0) return { error: "Amount must look like 10 or 10.99." };

  const { error } = await adminDb().from("expenses").insert({
    member_id: memberId,
    spent_on: spentOn,
    description,
    category,
    amount_cents: amount,
    notes,
  });
  if (error) return { error: `Couldn't save: ${error.message}` };

  refresh();
  return { savedAt: Date.now() };
}

/** Mark an expense as paid back (paid=yes) or owed again (paid=no). */
export async function setReimbursed(formData: FormData) {
  await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const paid = formData.get("paid") === "yes";
  const { error } = await adminDb()
    .from("expenses")
    .update({ reimbursed_at: paid ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(`Couldn't update the expense: ${error.message}`);
  refresh();
}

export async function deleteExpense(formData: FormData) {
  await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const { error } = await adminDb().from("expenses").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete the expense: ${error.message}`);
  refresh();
}

/** Add someone to the e-board list (or bring back someone who was hidden). */
export async function addMember(formData: FormData) {
  await requireAdmin();
  if (isDemo()) return;
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return;
  const db = adminDb();
  const { data: last } = await db.from("eboard_members").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await db.from("eboard_members").insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error?.code === "23505") {
    // Already on the list (maybe hidden): just show them again.
    await db.from("eboard_members").update({ active: true }).eq("name", name);
  } else if (error) {
    throw new Error(`Couldn't add ${name}: ${error.message}`);
  }
  refresh();
}

/** Hide someone from "Who paid?" (active=no) or show them again (active=yes). Past expenses are kept. */
export async function setMemberActive(formData: FormData) {
  await requireAdmin();
  if (isDemo()) return;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "yes";
  const { error } = await adminDb().from("eboard_members").update({ active }).eq("id", id);
  if (error) throw new Error(`Couldn't update the e-board list: ${error.message}`);
  refresh();
}
