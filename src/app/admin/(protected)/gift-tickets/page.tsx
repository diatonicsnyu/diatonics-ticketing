import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, getTicketsRemaining } from "@/lib/events";
import { listComps } from "@/lib/admin-orders";
import { formatShort } from "@/lib/time";
import { giveTicketsAction } from "./actions";
import { GiftForm, type GiftEvent } from "./GiftForm";

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

  return (
    <>
      <h1 className="font-display text-3xl font-black">Gift tickets</h1>
      <p className="mt-2 text-muted">
        Free tickets for guests. They get emailed like normal tickets and scan the same at the door. They count against the show&apos;s capacity, so you can still give them after online sales close, as long as there are tickets left.
      </p>

      <div className="mt-6 rounded-sm border border-line bg-panel p-5">
        {events.length === 0 ? (
          <p>No shows can take gift tickets right now. A show has to be on sale (or have sales closed) and not be over yet.</p>
        ) : (
          <GiftForm action={giveTicketsAction} events={events} />
        )}
      </div>

      <h2 className="font-display mt-10 text-2xl font-black">Given so far</h2>
      {comps.length === 0 ? (
        <p className="mt-3 text-muted">No gift tickets yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {comps.map((c) => (
            <li key={c.orderNo}>
              <Link href={`/admin/orders/${c.orderNo}`} className="block rounded-sm border border-line bg-panel p-3 text-sm hover:border-link">
                <span className="font-semibold">{c.name}</span> · {c.count} ticket{c.count === 1 ? "" : "s"} · {c.eventName}
                <span className="block text-muted">
                  {c.email} · by {c.compBy || "—"} · {formatShort(c.at)}
                  {c.note && ` · ${c.note}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
