import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, STATUS_LABELS, type EventRow } from "@/lib/events";
import { loadDashboard } from "@/lib/dashboard";
import { loadEventMetrics, pickCurrentEvent } from "@/lib/event-metrics";
import { reminderStatus } from "@/lib/reminders";
import { loadLedger, balancesByMember, totalOwed, nameLookup } from "@/lib/expenses";
import { formatShort } from "@/lib/time";
import { formatCents } from "@/lib/money";
import { btn, btnPrimary, btnSm, cardButton, eyebrow, panel } from "@/lib/ui";
import { EventOverview } from "@/components/admin/EventOverview";
import { FeedLine } from "@/components/admin/FeedLine";

export const metadata = { title: "Admin · Dashboard" };
export const dynamic = "force-dynamic";

/** Upcoming shows soonest first, then past shows newest first. */
function splitEvents(events: EventRow[], now: number) {
  const soon = (e: EventRow) => Date.parse(e.starts_at) > now - 6 * 3600_000;
  return {
    upcoming: events.filter(soon).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    past: events.filter((e) => !soon(e)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
  };
}

async function loadPage() {
  const now = Date.now();
  const [events, dash, ledger] = await Promise.all([listAllEventsForAdmin(), loadDashboard(), loadLedger().catch(() => null)]);
  const current = pickCurrentEvent(events, now);
  const [metrics, reminders] = current
    ? await Promise.all([loadEventMetrics(current), current.status === "draft" ? null : reminderStatus(current.id).catch(() => null)])
    : [null, null];
  return { events, dash, ledger, current, metrics, reminders, ...splitEvents(events, now) };
}

/**
 * Admin home (SPEC D19, §13): money totals on top; shows on the left; the
 * current show in the middle; the expense log on the right.
 */
export default async function AdminDashboardPage() {
  // Check here too, not just in the layout: Next.js can render a page in
  // parallel with its layout, so every page that loads private data checks.
  await requireAdmin();
  const { dash, ledger, current, metrics, reminders, upcoming, past, events } = await loadPage();
  const d = dash.status === "ok" ? dash.data : null;
  const sold = (e: EventRow) => d?.soldByEvent[e.id] ?? 0;

  return (
    <>
      {dash.status === "setup_needed" && (
        <p className={`${panel} mb-4 p-4`}>
          Sales numbers appear once <code>supabase/migrations/0004_orders.sql</code> has been run in Supabase.
        </p>
      )}

      {/* ---------- the 4 big numbers, always on top (SPEC §13) ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total revenue" value={d ? formatCents(d.revenueCents) : "—"} sub="Tickets + fees + donations, all shows" />
        <Stat label="Net profit" value={d ? formatCents(d.netCents) : "—"} sub="Revenue − Stripe fees" />
        <Stat
          label="Total spent"
          value={d?.spentCents == null ? "—" : formatCents(d.spentCents)}
          sub={d?.spentCents == null ? "Expense log not set up" : "From the expense log"}
          href="/admin/expenses"
        />
        <Stat label="Current balance" value={d?.balanceCents == null ? "—" : formatCents(d.balanceCents)} sub="What the group has to spend" strong />
      </div>
      {d && (
        <p className="mt-2 text-sm text-muted">
          All shows: {d.ticketsSold} tickets sold{d.compTickets > 0 && ` (incl. ${d.compTickets} gift)`} · ticket sales {formatCents(d.ticketSalesCents)} · service fees{" "}
          {formatCents(d.serviceFeesCents)} · donations {formatCents(d.donationsCents)} · Stripe fees {formatCents(d.stripeFeesCents)}
          {d.refundFeesLostCents > 0 && ` · fees lost to refunds ${formatCents(d.refundFeesLostCents)}`}
          {d.ordersMissingFee > 0 && ` · Stripe fee not reported yet on ${d.ordersMissingFee} order${d.ordersMissingFee === 1 ? "" : "s"}`}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_21rem]">
        {/* ---------- left: the shows ---------- */}
        <aside className={`${panel} p-4`} aria-label="Shows">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-black">Shows</h2>
            <Link href="/admin/events/new" className={btnSm}>+ New show</Link>
          </div>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No shows yet. Create the first one.</p>
          ) : (
            <>
              {upcoming.length > 0 && <p className={`${eyebrow} mt-4`}>Coming up</p>}
              <ul className="mt-2 space-y-2">
                {upcoming.map((e) => (
                  <ShowButton key={e.id} e={e} sold={sold(e)} current={e.id === current?.id} />
                ))}
              </ul>
              {past.length > 0 && <p className={`${eyebrow} mt-5`}>Past</p>}
              <ul className="mt-2 space-y-2">
                {past.map((e) => (
                  <ShowButton key={e.id} e={e} sold={sold(e)} current={e.id === current?.id} />
                ))}
              </ul>
            </>
          )}
        </aside>

        {/* ---------- middle: the current show ---------- */}
        <section aria-label="Current show" className="min-w-0">
          {current ? (
            <EventOverview event={current} m={metrics} reminders={reminders} onDashboard />
          ) : (
            <div className={`${panel} p-8 text-center`}>
              <p className="text-lg">No shows yet.</p>
              <Link href="/admin/events/new" className={`${btnPrimary} mt-4`}>Create a show</Link>
            </div>
          )}
        </section>

        {/* ---------- right: the expense log ---------- */}
        <aside className={`${panel} p-4 lg:col-span-2 xl:col-span-1`} aria-label="Expense log">
          <ExpensePanel ledger={ledger} />
        </aside>
      </div>
    </>
  );
}

function ShowButton({ e, sold, current }: { e: EventRow; sold: number; current: boolean }) {
  return (
    <li>
      <Link href={`/admin/events/${e.id}`} className={`${cardButton} ${current ? "border-burgundy ring-1 ring-burgundy" : ""}`}>
        <span className="block font-semibold">{e.name}</span>
        <span className="block text-sm text-muted">{formatShort(e.starts_at)}</span>
        <span className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className={`rounded-sm px-1.5 py-0.5 font-semibold ${e.status === "on_sale" ? "bg-sky" : "border border-line"}`}>{STATUS_LABELS[e.status]}</span>
          <span className="tabular-nums text-muted">
            {sold}
            {e.capacity ? ` / ${e.capacity}` : ""} sold
          </span>
        </span>
        {e.capacity ? (
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-sm bg-page">
            <span className="block h-full bg-burgundy" style={{ width: `${Math.min(100, (sold / e.capacity) * 100)}%` }} />
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function ExpensePanel({ ledger }: { ledger: Awaited<ReturnType<typeof loadLedger>> | null }) {
  if (!ledger || ledger.status !== "ok") {
    return (
      <>
        <h2 className="font-display text-xl font-black">Expense log</h2>
        <p className="mt-2 text-sm text-muted">The expense log works once the database is set up.</p>
      </>
    );
  }
  const owed = totalOwed(balancesByMember(ledger.members, ledger.entries));
  const nameOf = nameLookup(ledger.members);
  const latest = ledger.entries.slice(0, 6);
  return (
    <>
      <h2 className="font-display text-xl font-black">Expense log</h2>
      <div className="mt-3 rounded-sm border border-line bg-page/60 p-3">
        <p className={eyebrow}>E-board is owed</p>
        <p className="text-2xl font-black tabular-nums">{formatCents(owed)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/admin/expenses?add=expense" className={btnSm}>+ Expense</Link>
        <Link href="/admin/expenses?add=reimbursement" className={btnSm}>+ Reimbursement</Link>
      </div>
      <p className={`${eyebrow} mt-4`}>Latest</p>
      {latest.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing logged yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {latest.map((e) => (
            <FeedLine key={e.id} e={e} nameOf={nameOf} compact />
          ))}
        </ul>
      )}
      <Link href="/admin/expenses" className={`${btn} mt-3 w-full`}>Open the full log</Link>
    </>
  );
}

function Stat({ label, value, sub, href, strong }: { label: string; value: string; sub?: string; href?: string; strong?: boolean }) {
  const body = (
    <>
      <p className={eyebrow}>{label}</p>
      <p className={`mt-1 text-3xl font-black tabular-nums ${strong ? "text-burgundy" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = `block rounded-sm border bg-panel p-4 ${strong ? "border-burgundy" : "border-edge"}`;
  return href ? (
    <Link href={href} className={`${cls} shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
