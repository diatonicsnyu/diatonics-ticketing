"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { issueComp } from "@/lib/admin-orders";

export type GiftFormState = { error?: string };

/** Gift tickets (SPEC §3.8 "comps"; stored as status 'comp'). On success, opens the new order. */
export async function giveTicketsAction(_prev: GiftFormState, formData: FormData): Promise<GiftFormState> {
  const admin = await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) return { error: "Demo preview: gift tickets work once Supabase is connected." };

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
  revalidatePath("/admin/gift-tickets");
  redirect(`/admin/orders/${result.orderNo}?msg=${result.email === "sent" ? "gift_sent" : "gift_email_failed"}`);
}
