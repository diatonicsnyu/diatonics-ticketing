import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, getTicketsRemaining } from "@/lib/events";
import { listComps } from "@/lib/admin-orders";
import { formatShort } from "@/lib/time";
import { issueCompAction } from "./actions";
import { CompForm, type CompEvent } from "./CompForm";

export const metadata = { title: "Admin · Comp tickets" };
export const dynamic = "force-dynamic";

/** Shows that can take comps: on sale or sales closed, not more than a day past. Soonest first. */
async function compableEvents(): Promise<CompEvent[]> {
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

/** Comp (free) tickets, SPEC §3.8: emailed like normal tickets, count against capacity. */
export default async function CompsPage() {
  await requireAdmin();
  const [events, comps] = await Promise.all([compableEvents(), listComps()]);

  return (
    <>
      <h1 className="font-display text-3xl font-black">Comp tickets</h1>
      <p className="mt-2 text-muted">
        Free tickets for guests. They get emailed like normal tickets, scan the same at the door, and count against the show&apos;s capacity.
      </p>

      <div className="mt-6 rounded-sm border border-line bg-panel p-5">
        {events.length === 0 ? (
          <p>No shows can take comps right now. A show has to be on sale (or have sales closed) and not be over yet.</p>
        ) : (
          <CompForm action={issueCompAction} events={events} />
        )}
      </div>

      <h2 className="font-display mt-10 text-2xl font-black">Issued</h2>
      {comps.length === 0 ? (
        <p className="mt-3 text-muted">No comps yet.</p>
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
