import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, getTicketsRemaining } from "@/lib/events";
import { listComps } from "@/lib/admin-orders";
import { formatShort } from "@/lib/time";
import { giveTicketsAction } from "./actions";
import { GiftForm, type GiftEvent } from "./GiftForm";
import { cardButton, eyebrow, panel } from "@/lib/ui";

export const metadata = { title: "Admin · Gift tickets" };
export const dynamic = "force-dynamic";

/** Shows that can take gift tickets: on sale or sales closed, not more than a day past. Soonest first. */
async function giftableEvents(): Promise<GiftEvent[]> {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const open = (await listAllEventsForAdmin())
    .filter((e) => (e.status === "on_sale" || e.status === "closed") && new Date(e.starts_at).getTime() > dayAgo && e.ticket_types.length > 0)
    .reverse();
  return Promise.all(
    open.map(async (e) => ({
      id: e.id,
      label: `${e.name} · ${formatShort(e.starts_at)}`,
      left: await getTicketsRemaining(e),
      types: e.ticket_types.map((t) => ({ id: t.id, name: t.name })),
    })),
  );
}

/** Gift tickets (SPEC §3.8 "comps", stored as order status 'comp'): emailed like normal tickets, count against capacity. */
export default async function GiftTicketsPage() {
  await requireAdmin();
  const [events, comps] = await Promise.all([giftableEvents(), listComps()]);

  const totalGiven = comps.reduce((n, c) => n + c.count, 0);
  return (
    <>
      {/* Header band: what this is, in one glance */}
      <div className={`${panel} flex flex-wrap items-center gap-5 bg-gradient-to-r from-[#fdf3f5] to-[#eef6fc] p-5`}>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border border-edge bg-white text-4xl shadow-sm" aria-hidden>
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-black">Gift tickets</h1>
          <p className="mt-1 max-w-3xl">
            Free tickets for guests: performers, photographers, family. They&apos;re emailed like normal tickets and scan the same at the door.
          </p>
        </div>
        <dl className="flex gap-3">
          <div className="rounded-sm border border-edge bg-white px-4 py-2 text-center">
            <dt className={eyebrow}>Given</dt>
            <dd className="text-2xl font-black tabular-nums">{totalGiven}</dd>
          </div>
          <div className="rounded-sm border border-edge bg-white px-4 py-2 text-center">
            <dt className={eyebrow}>People</dt>
            <dd className="text-2xl font-black tabular-nums">{comps.length}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={`${panel} p-5`}>
          <h2 className="font-display text-xl font-black">Give tickets</h2>
          <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <li>1. Pick the show</li>
            <li>2. Who they&apos;re for</li>
            <li>3. We email them their tickets</li>
          </ol>
          <p className="mt-2 text-sm text-muted">
            Gift tickets use up seats, so you can still give them after online sales close, as long as there are tickets left.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            {events.length === 0 ? (
              <p>No shows can take gift tickets right now. A show has to be on sale (or have sales closed) and not be over yet.</p>
            ) : (
              <GiftForm action={giveTicketsAction} events={events} />
            )}
          </div>
        </section>

        <section className={`${panel} p-5`}>
          <h2 className="font-display text-xl font-black">Given so far</h2>
          {comps.length === 0 ? (
            <p className="mt-3 text-muted">No gift tickets yet. They&apos;ll show up here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {comps.map((c) => (
                <li key={c.orderNo}>
                  <Link href={`/admin/orders/${c.orderNo}`} className={`${cardButton} flex items-start gap-3`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#fdf3f5] text-lg font-black text-burgundy" aria-hidden>
                      {c.count}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {c.name} <span className="font-normal text-muted">· {c.count} ticket{c.count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="block text-sm">{c.eventName}</span>
                      <span className="block break-all text-xs text-muted">
                        {c.email} · given by {c.compBy || "—"} · {formatShort(c.at)}
                        {c.note && ` · ${c.note}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
