import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { BUYER_SORTS, loadBuyers, parseBuyerSort } from "@/lib/buyers";
import { listAllEventsForAdmin } from "@/lib/events";
import { formatCents } from "@/lib/money";
import { formatShort } from "@/lib/time";

export const metadata = { title: "Admin · Buyers" };
export const dynamic = "force-dynamic";

/** Everyone who bought tickets (SPEC D19, §3.8): table in the browser + CSV download. */
export default async function BuyersPage(props: PageProps<"/admin/buyers">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" && sp.event ? sp.event : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = parseBuyerSort(sp.sort);
  const [result, events] = await Promise.all([loadBuyers({ eventId, q, sort }), listAllEventsForAdmin()]);

  const eventParam = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
  const csvHref = `/admin/buyers/csv${eventParam}`;
  const ticketsCsvHref = `/admin/buyers/tickets-csv${eventParam}`;
  const input = "rounded-sm border border-line bg-white px-3 py-2 text-ink";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-black">Buyers</h1>
        {result.status === "ok" && (
          <a href={csvHref} className="font-display rounded-sm bg-burgundy px-5 py-2.5 font-bold text-white hover:bg-burgundy-bright">
            Download CSV
          </a>
        )}
      </div>
      <p className="mt-2 text-muted">
        Everyone who bought tickets online, plus comps. Tap an order to see each ticket&apos;s check-in. The CSV opens in Google Sheets or Excel
        {result.status === "ok" && (
          <>
            {" "}(or <a href={ticketsCsvHref} className="text-link hover:underline">download one row per ticket</a>)
          </>
        )}
        .
      </p>

      {/* Filter + search (plain GET form, works without JavaScript). */}
      <form className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Show</span>
          <select name="event" defaultValue={eventId ?? ""} className={input}>
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-sm font-semibold">Search</span>
          <input name="q" defaultValue={q} placeholder="Name, email or order number" className={`${input} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Sort</span>
          <select name="sort" defaultValue={sort} className={input}>
            {BUYER_SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <button className="rounded-sm border border-link px-4 py-2 text-link">Apply</button>
        {(eventId || q || sort !== "newest") && <Link href="/admin/buyers" className="py-2 text-sm text-link hover:underline">Clear</Link>}
      </form>

      {result.status === "demo" && <p className="mt-6 rounded-sm border border-line bg-panel p-4">The buyer list works once the database is connected.</p>}
      {result.status === "setup_needed" && (
        <p className="mt-6 rounded-sm border border-line bg-panel p-4">
          Run <code>supabase/migrations/0004_orders.sql</code> in Supabase first.
        </p>
      )}

      {result.status === "ok" &&
        (result.rows.length === 0 ? (
          <p className="mt-8 text-muted">{q || eventId ? "No buyers match." : "No tickets sold yet."}</p>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted">
              {result.rows.length} order{result.rows.length === 1 ? "" : "s"} · {result.rows.reduce((n, r) => n + r.ticketCount, 0)} tickets ·{" "}
              {formatCents(result.rows.reduce((n, r) => n + r.totalCents, 0))} total
            </p>

            {/* Laptop: a table. Phone: cards (SPEC §12 Admin). */}
            <div className="mt-3 hidden overflow-x-auto rounded-sm border border-line bg-panel md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-page text-muted">
                  <tr>
                    {["Buyer", "Email", "Phone", "Event", "Tickets", "Total", "Order", "Bought", "In"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.orderNo} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-semibold">
                        {r.firstName} {r.lastName}
                        {r.status === "comp" && <span className="block text-xs font-normal text-muted">🎟️ comp</span>}
                        {r.supporterName && <span className="block text-xs font-normal text-muted">💛 supporter</span>}
                      </td>
                      <td className="px-3 py-2 break-all">{r.email}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.phone || "—"}</td>
                      <td className="px-3 py-2">{r.eventName}</td>
                      <td className="px-3 py-2">{r.ticketTypes}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCents(r.totalCents)}
                        {r.donationCents > 0 && <span className="block text-xs text-muted">incl. {formatCents(r.donationCents)} donation</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        <Link href={`/admin/orders/${r.orderNo}`} className="text-link hover:underline">{r.orderNo}</Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatShort(r.purchasedAt)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.checkedIn}/{r.ticketCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-3 space-y-3 md:hidden">
              {result.rows.map((r) => (
                <li key={r.orderNo} className="rounded-sm border border-line bg-panel p-4 text-sm">
                  <p className="font-semibold">
                    {r.firstName} {r.lastName}{" "}
                    <Link href={`/admin/orders/${r.orderNo}`} className="font-mono font-normal text-link hover:underline">· {r.orderNo}</Link>
                    {r.status === "comp" && <span className="font-normal text-muted"> · 🎟️ comp</span>}
                  </p>
                  <p className="break-all">{r.email}{r.phone && ` · ${r.phone}`}</p>
                  <p className="text-muted">{r.eventName} · {r.ticketTypes}</p>
                  <p className="text-muted">
                    {formatCents(r.totalCents)}{r.donationCents > 0 && ` (incl. ${formatCents(r.donationCents)} donation)`} · {formatShort(r.purchasedAt)} · checked in {r.checkedIn}/{r.ticketCount}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ))}
    </>
  );
}
