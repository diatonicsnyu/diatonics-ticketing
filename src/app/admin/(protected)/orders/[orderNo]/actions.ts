"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { loadAdminOrder, undoCheckIn } from "@/lib/admin-orders";
import { sendTicketEmail } from "@/lib/ticket-mail";

/** Undo one ticket's check-in, so it scans green again (spec §3.7: admin only). */
export async function undoCheckInAction(orderNo: string, ticketId: string) {
  const admin = await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) redirect(`/admin/orders/${orderNo}`);
  const order = await loadAdminOrder(orderNo);
  // Only tickets that belong to this order (so a tampered form can't undo another one).
  if (!order || !order.tickets.some((t) => t.id === ticketId)) redirect(`/admin/orders/${orderNo}?msg=not_found`);
  const result = await undoCheckIn(ticketId, admin.name);
  revalidatePath(`/admin/orders/${orderNo}`);
  redirect(`/admin/orders/${orderNo}?msg=undo_${result}`);
}

/** Sends the ticket email if it never went out (or failed). It never sends twice. */
export async function sendTicketEmailAction(orderNo: string) {
  await requireAdmin();
  if (isDemo()) redirect(`/admin/orders/${orderNo}`);
  const order = await loadAdminOrder(orderNo);
  if (!order) redirect(`/admin/orders/${orderNo}?msg=not_found`);
  const result = await sendTicketEmail(order.id).catch(() => "failed" as const);
  revalidatePath(`/admin/orders/${orderNo}`);
  redirect(`/admin/orders/${orderNo}?msg=email_${result}`);
}
