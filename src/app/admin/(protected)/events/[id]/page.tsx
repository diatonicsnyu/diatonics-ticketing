import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin, eventImageUrl } from "@/lib/events";
import { isoToNyInput, minutesBetween, formatShort } from "@/lib/time";
import { reminderStatus } from "@/lib/reminders";
import { EventForm } from "../../EventForm";
import { saveEvent } from "../../actions";
import { sendRemindersNowAction } from "./actions";

export const metadata = { title: "Admin · Edit event" };
export const dynamic = "force-dynamic";

const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export default async function EditEventPage(props: PageProps<"/admin/events/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const event = await getEventForAdmin(id);
  if (!event) notFound();

  // A cancelled show can't be edited (its buyers were refunded); show where the refunds stand instead.
  if (event.status === "cancelled") {
    return (
      <>
        <Link href="/admin" className="text-sm text-link hover:underline">← All events</Link>
        <h1 className="font-display mb-1 mt-2 text-3xl font-black">{event.name}</h1>
        <p className="mt-4 rounded-sm border border-burgundy bg-panel p-4">
          This show is <strong>cancelled</strong>, so it can&apos;t be edited.{" "}
          <Link href={`/admin/events/${event.id}/change`} className="text-link hover:underline">See refunds and emails →</Link>
        </p>
      </>
    );
  }

  const reminders = event.status === "draft" ? null : await reminderStatus(event.id);
  const msg = sp.reminders;

  return (
    <>
      <Link href="/admin" className="text-sm text-link hover:underline">← All events</Link>
      <h1 className="font-display mb-1 mt-2 text-3xl font-black">Edit event</h1>
      <p className="mb-6 text-sm text-muted">
        Public link: <code>/events/{event.slug}</code>
        {event.status === "draft" && " (hidden while Draft)"}
      </p>
      {event.status !== "draft" && (
        <p className="mb-6 rounded-sm border border-line bg-panel p-3 text-sm">
          Moving the date after tickets are sold? Use{" "}
          <Link href={`/admin/events/${event.id}/change`} className="text-link hover:underline">Cancel or move this show</Link> instead of
          changing it here, so buyers get an email about the new date.
        </p>
      )}
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
          status: event.status,
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

      {/* ---------- reminder emails (SPEC §3.6) ---------- */}
      {event.status !== "draft" && (
        <section id="reminders" className="mt-10 rounded-sm border border-line bg-panel p-5">
          <h2 className="font-display text-2xl font-black">Reminder emails</h2>
          {msg === "sent" && (
            <p className="mt-3 rounded-sm border border-link bg-white p-3 text-sm" role="status">
              Sent {String(sp.sent ?? 0)} reminder{sp.sent === "1" ? "" : "s"}
              {Number(sp.failed) > 0 && `, ${String(sp.failed)} failed (they'll be retried)`}.
              {Number(sp.left) > 0 && ` ${String(sp.left)} still to go: today's email limit is used up, so the daily job sends them tomorrow morning.`}
            </p>
          )}
          {msg === "not_open" && <p className="mt-3 rounded-sm border border-burgundy bg-white p-3 text-sm" role="status">Reminders only go out for shows that haven&apos;t happened yet.</p>}
          {reminders == null ? (
            <p className="mt-2 text-sm text-muted">Run <code>supabase/migrations/0011_reminders_cancel.sql</code> in Supabase first.</p>
          ) : (
            <>
              <p className="mt-2">
                <strong>{reminders.reminded}</strong> of <strong>{reminders.recipients}</strong> buyer{reminders.recipients === 1 ? "" : "s"} reminded. {reminders.plan}
              </p>
              <p className="mt-1 text-sm text-muted">
                Each buyer gets one email with their tickets and QR codes. They go out automatically; you don&apos;t have to do anything.
              </p>
              {reminders.recipients > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a href={`/admin/events/${event.id}/reminder-preview`} target="_blank" rel="noreferrer" className="rounded-sm border border-link px-4 py-2 text-sm text-link hover:bg-page">
                    Preview the email
                  </a>
                  {reminders.reminded < reminders.recipients && reminders.daysAway >= 0 && (
                    <form action={sendRemindersNowAction.bind(null, event.id)}>
                      <button className="rounded-sm border border-line bg-white px-4 py-2 text-sm hover:border-link">Send now to everyone not reminded yet</button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------- cancel / reschedule (D20) ---------- */}
      {(event.status === "on_sale" || event.status === "closed") && (
        <section className="mt-6 rounded-sm border border-burgundy bg-panel p-5">
          <h2 className="font-display text-2xl font-black">Cancel or move this show</h2>
          <p className="mt-2 text-sm">
            Refund everyone and cancel, or move it to a new date ({formatShort(event.starts_at)} now). Nothing happens until you confirm three times.
          </p>
          <Link href={`/admin/events/${event.id}/change`} className="mt-3 inline-block rounded-sm border border-burgundy px-4 py-2 text-sm font-semibold text-burgundy hover:bg-page">
            Cancel or move this show…
          </Link>
        </section>
      )}
    </>
  );
}
