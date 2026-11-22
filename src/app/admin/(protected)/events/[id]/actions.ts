"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { sendRemindersNow } from "@/lib/reminders";

/** "Send reminders now" on the event page: everyone not reminded yet, within today's email budget. */
export async function sendRemindersNowAction(eventId: string) {
  await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) redirect(`/admin/events/${eventId}`);
  const r = await sendRemindersNow(eventId);
  revalidatePath(`/admin/events/${eventId}`);
  const q = r === "not_open" ? "reminders=not_open" : `reminders=sent&sent=${r.sent}&failed=${r.failed}&left=${r.left}`;
  redirect(`/admin/events/${eventId}?${q}#reminders`);
}
