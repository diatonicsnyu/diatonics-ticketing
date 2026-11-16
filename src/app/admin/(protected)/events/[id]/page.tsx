import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin, eventImageUrl } from "@/lib/events";
import { isoToNyInput, minutesBetween } from "@/lib/time";
import { EventForm } from "../../EventForm";
import { saveEvent } from "../../actions";

export const metadata = { title: "Admin · Edit event" };
export const dynamic = "force-dynamic";

const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export default async function EditEventPage(props: PageProps<"/admin/events/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const event = await getEventForAdmin(id);
  if (!event) notFound();

  return (
    <>
      <Link href="/admin" className="text-sm text-link hover:underline">← All events</Link>
      <h1 className="font-display mb-1 mt-2 text-2xl font-black">Edit event</h1>
      <p className="mb-6 text-sm text-muted">
        Public link: <code>/events/{event.slug}</code>
        {event.status === "draft" && " (hidden while Draft)"}
      </p>
      <EventForm
        action={saveEvent.bind(null, event.id)}
        submitLabel="Save changes"
        defaults={{
          name: event.name,
          venue: event.venue,
          description: event.description,
          starts_at: isoToNyInput(event.starts_at),
          doors_at: isoToNyInput(event.doors_at),
          sales_close_minutes: String(minutesBetween(event.starts_at, event.sales_close_at)),
          capacity: event.capacity == null ? "" : String(event.capacity),
          door_price: centsToInput(event.door_price_cents),
          // Cancelled events are handled by the cancel flow (Step 8), not this form.
          status: event.status === "cancelled" ? "closed" : event.status,
          has_pin: !!event.door_pin_hash,
          image_url: eventImageUrl(event.image_path),
          ticket_types: event.ticket_types.map((t) => ({
            id: t.id,
            name: t.name,
            price: centsToInput(t.price_cents),
            limit: t.quantity_limit == null ? "" : String(t.quantity_limit),
          })),
        }}
      />
    </>
  );
}
