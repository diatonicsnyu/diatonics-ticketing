"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, endAdminSession } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/clients";
import { nyInputToIso, isoToNyDate, addMinutes } from "@/lib/time";
import { dollarsToCents } from "@/lib/money";
import { hashPin, isValidPin } from "@/lib/pin";
import type { EventStatus } from "@/lib/events";
import { isDemo } from "@/lib/demo";

export async function logout() {
  if (isDemo()) redirect("/");
  await endAdminSession();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Create / edit an event
// ---------------------------------------------------------------------------

export type EventFormState = { error?: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EDITABLE_STATUSES: EventStatus[] = ["draft", "on_sale", "closed"];

type TicketTypeInput = { id: string | null; name: string; price_cents: number; quantity_limit: number | null };

/** "Spring Show 2027" + date -> "spring-show-2027-2027-04-10" */
function makeSlug(name: string, startsAtIso: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base || "event"}-${isoToNyDate(startsAtIso)}`;
}

/** Optional whole number field. "" -> null. Returns "invalid" if not a positive integer. */
function optionalPositiveInt(v: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d+$/.test(s) || Number(s) <= 0) return "invalid";
  return Number(s);
}

/**
 * Handles both "new event" (eventId = null) and "edit event".
 * Validates everything first, then writes. Returns { error } to show on the
 * form, or redirects back to the event list on success.
 */
export async function saveEvent(
  eventId: string | null,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdmin(); // Server Actions must check this themselves.
  if (isDemo()) return { error: "Demo preview: saving starts working once Supabase is connected." };

  // ----- read + validate the simple fields -----
  const name = String(formData.get("name") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAt = nyInputToIso(String(formData.get("starts_at") ?? ""));
  const doorsRaw = String(formData.get("doors_at") ?? "").trim();
  const doorsAt = doorsRaw ? nyInputToIso(doorsRaw) : null;
  const closeMinutesRaw = String(formData.get("sales_close_minutes") ?? "30").trim();
  const status = String(formData.get("status") ?? "draft") as EventStatus;
  const capacity = optionalPositiveInt(formData.get("capacity"));
  const doorPriceRaw = String(formData.get("door_price") ?? "").trim();
  const doorPrice = doorPriceRaw ? dollarsToCents(doorPriceRaw) : null;
  const pin = String(formData.get("door_pin") ?? "").trim();

  if (!name) return { error: "Event name is required." };
  if (!venue) return { error: "Venue is required." };
  if (!startsAt) return { error: "Show date and time are required." };
  if (doorsRaw && !doorsAt) return { error: "Doors time isn't a valid date/time." };
  if (!/^-?\d+$/.test(closeMinutesRaw)) return { error: "Sales close must be a whole number of minutes." };
  if (!EDITABLE_STATUSES.includes(status)) return { error: "Pick a valid status." };
  if (capacity === "invalid") return { error: "Capacity must be a whole number above 0, or blank for unlimited." };
  if (doorPriceRaw && doorPrice === null) return { error: "Door price must look like 8 or 8.00, or be blank." };
  if (pin && !isValidPin(pin)) return { error: "Door PIN must be 4 to 8 digits." };

  const salesCloseAt = addMinutes(startsAt, Number(closeMinutesRaw));

  // ----- ticket types (repeated rows from the form, in order) -----
  const ids = formData.getAll("tt_id").map(String);
  const names = formData.getAll("tt_name").map((v) => String(v).trim());
  const prices = formData.getAll("tt_price").map(String);
  const limits = formData.getAll("tt_limit");

  const ticketTypes: TicketTypeInput[] = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i] && !prices[i]?.trim()) continue; // fully empty row: ignore
    const price = dollarsToCents(prices[i] ?? "");
    const limit = optionalPositiveInt(limits[i] ?? null);
    if (!names[i]) return { error: `Ticket type ${i + 1} needs a name.` };
    if (price === null) return { error: `"${names[i]}" needs a price like 5 or 5.00.` };
    if (limit === "invalid") return { error: `"${names[i]}" limit must be a whole number, or blank.` };
    ticketTypes.push({ id: ids[i] || null, name: names[i], price_cents: price, quantity_limit: limit });
  }
  if (ticketTypes.length === 0) return { error: "Add at least one ticket type (e.g. General $5)." };

  // ----- image (optional) -----
  const image = formData.get("image");
  const hasNewImage = image instanceof File && image.size > 0;
  if (hasNewImage) {
    if (!image.type.startsWith("image/")) return { error: "The event image must be a picture file." };
    if (image.size > MAX_IMAGE_BYTES) return { error: "The event image must be under 5 MB." };
  }
  const removeImage = formData.get("remove_image") === "on";

  // ----- write to the database -----
  const db = adminDb();
  const fields: Record<string, unknown> = {
    name,
    venue,
    description,
    starts_at: startsAt,
    doors_at: doorsAt,
    sales_close_at: salesCloseAt,
    capacity,
    door_price_cents: doorPrice,
    status,
  };
  if (pin) fields.door_pin_hash = await hashPin(pin); // blank = keep current PIN
  if (removeImage && !hasNewImage) fields.image_path = null;

  let id = eventId;
  if (!id) {
    // New event: try the natural slug, add a random suffix if it's taken.
    let slug = makeSlug(name, startsAt);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await db.from("events").insert({ ...fields, slug }).select("id").single();
      if (!error) {
        id = data.id;
        break;
      }
      if (error.code !== "23505") return { error: `Couldn't save: ${error.message}` }; // 23505 = duplicate
      slug = `${makeSlug(name, startsAt)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    if (!id) return { error: "Couldn't create a unique link for this event. Try a slightly different name." };
  } else {
    // A cancelled show stays cancelled: this form must never reopen it
    // (its buyers were refunded). ".neq" makes that hold even mid-cancel.
    const { data, error } = await db.from("events").update(fields).eq("id", id).neq("status", "cancelled").select("id");
    if (error) return { error: `Couldn't save: ${error.message}` };
    if (!data || data.length === 0) return { error: "This show is cancelled, so it can't be edited." };
  }

  // Ticket types: update kept rows, add new rows, delete removed rows.
  // (From Step 2 on, deleting a type that already has tickets sold will be
  // refused by the database, which is what we want.)
  const { data: existing } = await db.from("ticket_types").select("id").eq("event_id", id);
  const keepIds = new Set(ticketTypes.map((t) => t.id).filter(Boolean));
  const toDelete = (existing ?? []).map((r) => r.id).filter((x) => !keepIds.has(x));
  if (toDelete.length) {
    const { error } = await db.from("ticket_types").delete().in("id", toDelete);
    if (error) return { error: `Couldn't remove a ticket type: ${error.message}` };
  }
  for (const [i, t] of ticketTypes.entries()) {
    const row = { event_id: id, name: t.name, price_cents: t.price_cents, quantity_limit: t.quantity_limit, sort_order: i };
    const { error } = t.id
      ? await db.from("ticket_types").update(row).eq("id", t.id).eq("event_id", id)
      : await db.from("ticket_types").insert(row);
    if (error) return { error: `Couldn't save ticket type "${t.name}": ${error.message}` };
  }

  // Upload the image last, once we know the event id.
  if (hasNewImage) {
    const ext = (image.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage
      .from("event-images")
      .upload(path, image, { contentType: image.type, upsert: false });
    if (upErr) return { error: `Event saved, but the image upload failed: ${upErr.message}` };
    await db.from("events").update({ image_path: path }).eq("id", id);
  }

  revalidatePath("/", "layout");
  redirect(`/admin?saved=${id}`);
}
