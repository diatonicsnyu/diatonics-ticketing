import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin, eventImageUrl } from "@/lib/events";
import { isoToNyInput, minutesBetween, formatShort } from "@/lib/time";
import { reminderStatus } from "@/lib/reminders";
import { loadEventMetrics } from "@/lib/event-metrics";
import { btn, btnDanger, btnSm, panel } from "@/lib/ui";
import { EventOverview } from "@/components/admin/EventOverview";
import { EventForm } from "../../EventForm";
import { saveEvent } from "../../actions";
import { sendRemindersNowAction } from "./actions";

export const metadata = { title: "Admin · Show" };
export const dynamic = "force-dynamic";

const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

/**
 * One show (SPEC §13): opens on the Overview tab (all its numbers); the
 * Edit tab has the form, saved with the button at the bottom.
 */
export default async function ShowPage(props: PageProps<"/admin/events/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const event = await getEventForAdmin(id);
  if (!event) notFound();
  const tab = sp.tab === "edit" && event.status !== "cancelled" ? "edit" : "overview";

  const tabs = (
    <div className="mt-4 flex gap-2 border-b border-edge" role="tablist">
      <Tab href={`/admin/events/${id}`} on={tab === "overview"}>Overview</Tab>
      {event.status !== "cancelled" && <Tab href={`/admin/events/${id}?tab=edit`} on={tab === "edit"}>Edit</Tab>}
    </div>
  );

  const header = (
    <>
      <Link href="/admin" className={btnSm}>← Dashboard</Link>
      <h1 className="font-display mt-3 text-3xl font-black">{event.name}</h1>
      <p className="text-muted">
        {formatShort(event.starts_at)} · {event.venue}
      </p>
      {sp.saved && <p className="mt-3 rounded-sm border border-[#23864a] bg-[#e9f6ee] p-3 font-semibold" role="status">Saved.</p>}
      {tabs}
    </>
  );

  // ---------- Overview ----------
  if (tab === "overview") {
    const [m, reminders] = await Promise.all([loadEventMetrics(event), event.status === "draft" ? null : reminderStatus(event.id).catch(() => null)]);
    const msg = sp.reminders;
    return (
      <>
        {header}
        {event.status === "cancelled" && (
          <p className={`${panel} mt-4 border-burgundy p-4`}>
            This show is <strong>cancelled</strong>, so it can&apos;t be edited.{" "}
            <Link href={`/admin/events/${event.id}/change`} className={btnSm}>See refunds and emails</Link>
          </p>
        )}
        <div className="mt-5">
          <EventOverview event={event} m={m} reminders={reminders} />
        </div>

        {/* Reminder buttons (SPEC §3.6) */}
        {reminders && reminders.recipients > 0 && event.status !== "cancelled" && (
          <section id="reminders" className={`${panel} mt-4 p-5`}>
            <h2 className="font-display text-xl font-black">Reminder emails</h2>
            {msg === "sent" && (
              <p className="mt-3 rounded-sm border border-line bg-page p-3 text-sm" role="status">
                Sent {String(sp.sent ?? 0)} reminder{sp.sent === "1" ? "" : "s"}
                {Number(sp.failed) > 0 && `, ${String(sp.failed)} failed (they'll be retried)`}.
                {Number(sp.left) > 0 && ` ${String(sp.left)} still to go: today's email limit is used up, so the daily job sends them tomorrow morning.`}
              </p>
            )}
            {msg === "not_open" && <p className="mt-3 rounded-sm border border-burgundy bg-white p-3 text-sm">Reminders only go out for shows that haven&apos;t happened yet.</p>}
            <p className="mt-2 text-sm">They go out by themselves. You don&apos;t have to do anything, but you can look at one or send them early.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/admin/events/${event.id}/reminder-preview`} target="_blank" rel="noreferrer" className={btn}>
                Preview the email
              </a>
              {reminders.reminded < reminders.recipients && reminders.daysAway >= 0 && (
                <form action={sendRemindersNowAction.bind(null, event.id)}>
                  <button className={btn}>Send now to everyone not reminded yet</button>
                </form>
              )}
            </div>
          </section>
        )}
      </>
    );
  }

  // ---------- Edit ----------
  return (
    <>
      {header}
      {event.status !== "draft" && (
        <p className="mt-5 rounded-sm border border-line bg-panel p-3 text-sm">
          Moving the date after tickets are sold? Use <strong>Cancel or move this show</strong> at the bottom instead of changing the date here, so buyers get an email about the new date.
        </p>
      )}
      <div className="mt-5 max-w-3xl">
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
      </div>

      {/* ---------- cancel / reschedule (D20) ---------- */}
      {(event.status === "on_sale" || event.status === "closed") && (
        <section className={`${panel} mt-10 max-w-3xl border-burgundy p-5`}>
          <h2 className="font-display text-xl font-black">Cancel or move this show</h2>
          <p className="mt-2 text-sm">Refund everyone and cancel, or move it to a new date. Nothing happens until you confirm three times.</p>
          <Link href={`/admin/events/${event.id}/change`} className={`${btnDanger} mt-3`}>
            Cancel or move this show…
          </Link>
        </section>
      )}
    </>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={on}
      className={`-mb-px rounded-t-sm border px-5 py-2.5 font-semibold transition ${
        on ? "border-edge border-b-page bg-page text-ink" : "border-transparent bg-white/60 text-muted hover:border-edge hover:bg-white hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
