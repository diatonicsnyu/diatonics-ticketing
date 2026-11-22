import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, STATUS_LABELS } from "@/lib/events";
import { loadDashboard } from "@/lib/dashboard";
import { formatShort } from "@/lib/time";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Admin · Dashboard" };
export const dynamic = "force-dynamic";

/** Admin home: the dashboard every admin sees (SPEC D19, §3.8), then the events. */
export default async function AdminDashboardPage(props: PageProps<"/admin">) {
  // Check here too, not just in the layout: Next.js can render a page in
  // parallel with its layout, so every page that loads private data checks.
  await requireAdmin();
  const { saved } = await props.searchParams;
  const [events, dash] = await Promise.all([listAllEventsForAdmin(), loadDashboard()]);
  const d = dash.status === "ok" ? dash.data : null;

  return (
    <>
      <h1 className="font-display text-3xl font-black">Dashboard</h1>

      {dash.status === "setup_needed" && (
        <p className="mt-4 rounded-sm border border-line bg-panel p-4">
          Sales numbers appear once <code>supabase/migrations/0004_orders.sql</code> has been run in Supabase.
        </p>
      )}

      {d && (
        <>
          {/* The 5 big numbers (SPEC §12 Admin). */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Tickets sold" value={String(d.ticketsSold)} sub={d.compTickets > 0 ? `incl. ${d.compTickets} comp` : undefined} />
            <Stat label="Total revenue" value={formatCents(d.revenueCents)} sub="Tickets + fees + donations" />
            <Stat label="Net profit from sales" value={formatCents(d.netCents)} sub="Revenue − Stripe fees" />
            <Stat
              label="Total spent"
              value={d.spentCents == null ? "—" : formatCents(d.spentCents)}
              sub={d.spentCents == null ? "Expense log not set up" : "E-board expenses"}
              href="/admin/expenses"
            />
            <Stat
              label="Current balance"
              value={d.balanceCents == null ? "—" : formatCents(d.balanceCents)}
              sub="What the group has to spend"
              strong
            />
          </div>

          {/* Details under the big numbers. */}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-sm border border-line bg-panel p-4 text-sm sm:grid-cols-3">
            <Detail label="Ticket sales" value={formatCents(d.ticketSalesCents)} />
            <Detail label="Service fees" value={formatCents(d.serviceFeesCents)} />
            <Detail label="Donations" value={formatCents(d.donationsCents)} />
            <Detail label="Stripe fees" value={formatCents(d.stripeFeesCents)} />
            <Detail label="Checked in" value={`${d.checkedIn} / ${d.ticketsSold}`} />
            <Detail label="Door sales" value={String(d.doorSales)} />
            <Detail label="Total attendance" value={String(d.attendance)} />
            {d.duplicateCheckIns > 0 && <Detail label="Let in twice (offline)" value={String(d.duplicateCheckIns)} />}
            {d.owedCents != null && <Detail label="E-board still owed" value={formatCents(d.owedCents)} />}
          </dl>
          {d.ordersMissingFee > 0 && (
            <p className="mt-2 text-xs text-muted">
              Stripe hasn&apos;t reported the fee for {d.ordersMissingFee} order{d.ordersMissingFee === 1 ? "" : "s"} yet, so net profit is a little high until it does.
            </p>
          )}
          <p className="mt-3 text-sm">
            <Link href="/admin/buyers" className="text-link hover:underline">See who bought tickets →</Link>
          </p>
        </>
      )}

      {/* ---------- events ---------- */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-black">Events</h2>
        <Link href="/admin/events/new" className="font-display rounded-sm bg-burgundy px-5 py-2.5 font-bold text-white hover:bg-burgundy-bright">
          + New event
        </Link>
      </div>

      {saved && <p className="mt-4 rounded-sm border border-link p-3" role="status">Saved.</p>}

      {events.length === 0 ? (
        <p className="mt-8 text-muted">No events yet. Create your first one.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((e) => {
            const sold = d?.soldByEvent[e.id] ?? 0;
            return (
              <li key={e.id} className="rounded-sm border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-sm text-muted">
                      {formatShort(e.starts_at)} · {e.venue}
                    </p>
                    <p className="text-sm text-muted">
                      {e.ticket_types.map((t) => `${t.name} ${formatCents(t.price_cents)}${d ? ` (${d.soldByType[t.id] ?? 0} sold)` : ""}`).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-sm px-3 py-1 text-xs font-semibold ${e.status === "on_sale" ? "bg-sky text-ink" : "border border-line"}`}>
                      {STATUS_LABELS[e.status]}
                    </span>
                    {e.status !== "draft" && <Link href={`/events/${e.slug}`} className="text-sm text-link hover:underline">View</Link>}
                    <Link href={`/admin/events/${e.id}`} className="text-sm text-link hover:underline">Edit</Link>
                  </div>
                </div>
                {/* Tickets sold vs. capacity (SPEC §12 Admin). */}
                {d && (
                  <div className="mt-3">
                    <p className="text-sm">
                      <strong>{sold}</strong> sold{e.capacity ? ` of ${e.capacity}` : " (no capacity limit)"}
                    </p>
                    {/* Door night: scanned tickets + door-sale counter = total attendance (D32). */}
                    {((d.checkedInByEvent[e.id] ?? 0) > 0 || (d.doorSalesByEvent[e.id] ?? 0) > 0) && (
                      <p className="text-sm text-muted">
                        {d.checkedInByEvent[e.id] ?? 0} checked in + {d.doorSalesByEvent[e.id] ?? 0} door sales ={" "}
                        <strong className="text-ink">{(d.checkedInByEvent[e.id] ?? 0) + (d.doorSalesByEvent[e.id] ?? 0)} attendance</strong>
                      </p>
                    )}
                    {e.capacity ? (
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-page" role="progressbar" aria-valuemin={0} aria-valuemax={e.capacity} aria-valuenow={sold}>
                        <div className="h-full bg-burgundy" style={{ width: `${Math.min(100, (sold / e.capacity) * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, sub, href, strong }: { label: string; value: string; sub?: string; href?: string; strong?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${strong ? "text-burgundy" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = `block rounded-sm border bg-panel p-4 ${strong ? "border-burgundy" : "border-line"}`;
  return href ? <Link href={href} className={`${cls} hover:border-link`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
