import Link from "next/link";
import type { EventRow } from "@/lib/events";
import { STATUS_LABELS } from "@/lib/events";
import type { EventMetrics } from "@/lib/event-metrics";
import type { ReminderStatus } from "@/lib/reminders";
import { formatCents } from "@/lib/money";
import { formatShort } from "@/lib/time";
import { btn, btnPrimary, eyebrow, panel } from "@/lib/ui";
import { SalesChart } from "./SalesChart";

/**
 * Everything about one show (SPEC §13): the dashboard's big "current show"
 * block and the show page's Overview tab both use this.
 */
export function EventOverview({
  event,
  m,
  reminders,
  onDashboard = false,
}: {
  event: EventRow;
  m: EventMetrics | null;
  reminders: ReminderStatus | null;
  /** On the dashboard: a big title and an "Open this show" button. */
  onDashboard?: boolean;
}) {
  const sold = m?.ticketsSold ?? 0;
  const attendance = (m?.checkedIn ?? 0) + (m?.doorSales ?? 0);
  const started = doorNightNear(event.starts_at);

  return (
    <div className="space-y-4">
      <div className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {onDashboard && <p className={eyebrow}>Current show</p>}
            <h2 className={`font-display font-black ${onDashboard ? "text-4xl" : "text-3xl"}`}>{event.name}</h2>
            <p className="mt-1 text-lg">{formatShort(event.starts_at)}</p>
            <p className="text-muted">{event.venue}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-sm px-3 py-1 text-sm font-semibold ${event.status === "on_sale" ? "bg-sky text-ink" : "border border-edge bg-white"}`}>
              {STATUS_LABELS[event.status]}
            </span>
            {onDashboard && (
              <Link href={`/admin/events/${event.id}`} className={btnPrimary}>
                Open this show
              </Link>
            )}
          </div>
        </div>

        {/* Big numbers for this show */}
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Big label="Tickets sold" value={`${sold}${event.capacity ? ` / ${event.capacity}` : ""}`} sub={m && m.giftTickets > 0 ? `incl. ${m.giftTickets} gift` : event.capacity ? `${Math.max(0, event.capacity - sold)} left` : "No capacity limit"} />
          <Big label="Money from this show" value={formatCents(m?.revenueCents ?? 0)} sub={`${m?.orders ?? 0} paid order${m?.orders === 1 ? "" : "s"}`} />
          <Big label="Checked in" value={String(m?.checkedIn ?? 0)} sub={sold ? `of ${sold} tickets` : "Door night"} />
          <Big label="Total attendance" value={String(attendance)} sub={`${m?.checkedIn ?? 0} scanned + ${m?.doorSales ?? 0} door sales`} />
        </dl>
        {event.capacity ? (
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-sm bg-page" role="progressbar" aria-label="Tickets sold vs capacity" aria-valuemin={0} aria-valuemax={event.capacity} aria-valuenow={sold}>
            <div className="h-full bg-burgundy" style={{ width: `${Math.min(100, (sold / event.capacity) * 100)}%` }} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${panel} p-5`}>
          {m ? <SalesChart perDay={m.perDay} /> : <p className="text-muted">Sales numbers appear once the database is connected.</p>}
        </section>

        <section className={`${panel} p-5`}>
          <h3 className="font-semibold">Ticket types</h3>
          <ul className="mt-2 space-y-1">
            {event.ticket_types.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span>
                  {t.name} <span className="text-muted">· {formatCents(t.price_cents)}</span>
                </span>
                <span className="tabular-nums">
                  {m?.soldByType[t.id] ?? 0} sold{t.quantity_limit ? ` of ${t.quantity_limit}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold">Money</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Ticket sales" value={formatCents(m?.ticketSalesCents ?? 0)} />
            <Row label="Service fees" value={formatCents(m?.serviceFeesCents ?? 0)} />
            <Row label="Donations at checkout" value={formatCents(m?.donationsCents ?? 0)} />
            <Row label="Stripe fees" value={`− ${formatCents(m?.stripeFeesCents ?? 0)}`} />
            <Row label="Net from this show" value={<strong>{formatCents(m?.netCents ?? 0)}</strong>} />
          </dl>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h3 className="font-semibold">Reminder emails</h3>
          {reminders ? (
            <p className="mt-1 text-sm">
              <strong>{reminders.reminded}</strong> of <strong>{reminders.recipients}</strong> buyers reminded. {reminders.plan}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Reminders appear once the show is on sale.</p>
          )}
          {(started || (m?.letInTwice ?? 0) > 0) && (
            <>
              <h3 className="mt-4 font-semibold">Door night</h3>
              <p className="mt-1 text-sm">
                {m?.checkedIn ?? 0} checked in · {m?.doorSales ?? 0} door sales · {attendance} total
                {(m?.letInTwice ?? 0) > 0 && <> · <strong className="text-burgundy">{m!.letInTwice} let in twice while offline</strong></>}
              </p>
            </>
          )}
        </section>
        <section className={`${panel} flex flex-wrap content-start gap-2 p-5`}>
          <h3 className="w-full font-semibold">Shortcuts</h3>
          <Link href={`/admin/buyers?event=${event.id}`} className={btn}>Who bought tickets</Link>
          <Link href="/admin/gift-tickets" className={btn}>Give gift tickets</Link>
          {event.status !== "draft" && (
            <Link href={`/events/${event.slug}`} className={btn}>
              See the public page
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

/** Door night is within 3 hours, or past. */
function doorNightNear(startsAt: string): boolean {
  return Date.parse(startsAt) < Date.now() + 3 * 3600_000;
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-line bg-page/60 p-3">
      <dt className={eyebrow}>{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
