"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { getEventForAdmin } from "@/lib/events";
import { nyInputToIso } from "@/lib/time";
import { cancelShow, finishCancellation, rescheduleShow } from "@/lib/show-changes";

const base = (id: string) => `/admin/events/${id}/change`;

/** Same comparison the page uses: case and extra spaces don't matter. */
function sameName(a: string, b: string) {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Step 3 of 3 (D20): only runs if the typed name matches the show's name.
 * Everything before this step only looks; nothing changes until here.
 */
export async function confirmShowChange(eventId: string, formData: FormData) {
  await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) redirect(base(eventId));
  const event = await getEventForAdmin(eventId);
  if (!event) redirect("/admin");

  const action = String(formData.get("action") ?? "");
  const starts = String(formData.get("starts") ?? "");
  const doors = String(formData.get("doors") ?? "");
  const back = `${base(eventId)}?step=3&action=${encodeURIComponent(action)}&starts=${encodeURIComponent(starts)}&doors=${encodeURIComponent(doors)}`;
  if (!sameName(String(formData.get("confirm_name") ?? ""), event.name)) redirect(`${back}&error=name`);

  if (action === "refund") {
    const r = await cancelShow(eventId);
    revalidatePath("/", "layout");
    if (r === "not_found" || r === "not_open") redirect(`${base(eventId)}?error=${r}`);
    redirect(`${base(eventId)}?done=refund&errors=${r.refundErrors.length}`);
  }

  if (action === "reschedule") {
    const startsIso = nyInputToIso(starts);
    const doorsIso = doors ? nyInputToIso(doors) : null;
    if (!startsIso || (doors && !doorsIso)) redirect(`${back}&error=date`);
    if (Date.parse(startsIso) < Date.now()) redirect(`${back}&error=past`);
    if (doorsIso && Date.parse(doorsIso) > Date.parse(startsIso)) redirect(`${back}&error=doors`);
    const r = await rescheduleShow(eventId, startsIso, doorsIso);
    revalidatePath("/", "layout");
    if (typeof r === "string") redirect(`${base(eventId)}?error=${r}`);
    redirect(`${base(eventId)}?done=reschedule&sent=${r.emailsSent}&left=${r.emailsLeft}`);
  }

  redirect(base(eventId));
}

/** "Keep going" on a cancelled show: retries refunds and sends emails still waiting. */
export async function finishCancellationAction(eventId: string) {
  await requireAdmin();
  if (isDemo()) redirect(base(eventId));
  const r = await finishCancellation(eventId);
  revalidatePath(base(eventId));
  redirect(`${base(eventId)}?errors=${r.refundErrors.length}`);
}
