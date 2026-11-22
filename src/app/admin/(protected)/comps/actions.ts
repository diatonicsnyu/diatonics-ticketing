"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { issueComp } from "@/lib/admin-orders";

export type CompFormState = { error?: string };

/** Issue free tickets (SPEC §3.8 comps). On success, opens the new order. */
export async function issueCompAction(_prev: CompFormState, formData: FormData): Promise<CompFormState> {
  const admin = await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) return { error: "Demo preview: comps work once Supabase is connected." };

  const field = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const result = await issueComp({
    eventId: field("event_id", 64),
    ticketTypeId: field("ticket_type_id", 64),
    quantity: Number(field("quantity", 3)),
    firstName: field("first_name", 50),
    lastName: field("last_name", 50),
    email: field("email", 200).toLowerCase(),
    phone: field("phone", 30),
    note: field("note", 200),
    issuedBy: admin.name,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin");
  revalidatePath("/admin/comps");
  redirect(`/admin/orders/${result.orderNo}?msg=${result.email === "sent" ? "comp_sent" : "comp_email_failed"}`);
}
