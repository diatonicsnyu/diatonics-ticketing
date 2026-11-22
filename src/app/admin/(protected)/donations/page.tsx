import { requireAdmin } from "@/lib/auth";
import { loadDonations, supporterNames, type DonationRow } from "@/lib/donations";
import { formatCents } from "@/lib/money";
import { formatShort } from "@/lib/time";
import { btn, btnPrimary } from "@/lib/ui";

export const metadata = { title: "Admin · Donations" };
export const dynamic = "force-dynamic";

/** Every donation (Donate page + ticket add-on), the opt-in supporters list, and CSVs (SPEC §3.8). */
export default async function DonationsPage() {
  await requireAdmin();
  const result = await loadDonations();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-black">Donations</h1>
        {result.status === "ok" && result.rows.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <a href="/admin/donations/csv" className={btnPrimary}>Download CSV</a>
            <a href="/admin/donations/supporters-csv" className={btn}>Supporters CSV</a>
          </div>
        )}
      </div>
      <p className="mt-2 text-muted">From the Donate page and added at ticket checkout. Donors pay exactly what they pick; the group covers Stripe&apos;s fee.</p>

      {result.status === "demo" && <p className="mt-6 rounded-sm border border-line bg-panel p-4">Donations show here once the database is connected.</p>}
      {result.status === "setup_needed" && (
        <p className="mt-6 rounded-sm border border-line bg-panel p-4">Run <code>supabase/migrations/0004_orders.sql</code> in Supabase first.</p>
      )}

      {result.status === "ok" &&
        (result.rows.length === 0 ? (
          <p className="mt-8 text-muted">No donations yet.</p>
        ) : (
          <Body rows={result.rows} />
        ))}
    </>
  );
}

function Body({ rows }: { rows: DonationRow[] }) {
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const standalone = rows.filter((r) => r.standalone);
  const addOn = rows.filter((r) => !r.standalone);
  // Stripe's fee is only known per payment; for a Donate-page donation the whole fee is the donation's.
  const standaloneFees = standalone.reduce((n, r) => n + (r.stripeFeeCents ?? 0), 0);
  const names = supporterNames(rows);

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total donated" value={formatCents(total)} sub={`${rows.length} donation${rows.length === 1 ? "" : "s"}`} />
        <Stat label="Donate page" value={formatCents(standalone.reduce((n, r) => n + r.amountCents, 0))} sub={`${standalone.length} · Stripe kept ${formatCents(standaloneFees)}`} />
        <Stat label="Added to tickets" value={formatCents(addOn.reduce((n, r) => n + r.amountCents, 0))} sub={`${addOn.length} order${addOn.length === 1 ? "" : "s"}`} />
        <Stat label="Thanked by name" value={String(names.length)} sub="On the Donate page" />
      </dl>

      {/* Laptop: a table. Phone: cards (SPEC §12 Admin). */}
      <div className="mt-6 hidden overflow-x-auto rounded-sm border border-line bg-panel md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-page text-muted">
            <tr>
              {["Donor", "Email", "Amount", "Where", "Thank by name", "Date", "Ref"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderNo} className="border-t border-line align-top">
                <td className="px-3 py-2 font-semibold">{r.firstName} {r.lastName}</td>
                <td className="px-3 py-2 break-all">{r.email}</td>
                <td className="px-3 py-2 tabular-nums">{formatCents(r.amountCents)}</td>
                <td className="px-3 py-2">{r.source}</td>
                <td className="px-3 py-2">{r.supporterName ? `💛 ${r.supporterName}` : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatShort(r.paidAt)}</td>
                <td className="px-3 py-2 font-mono">{r.orderNo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.orderNo} className="rounded-sm border border-line bg-panel p-4 text-sm">
            <p className="font-semibold">{r.firstName} {r.lastName} · {formatCents(r.amountCents)}</p>
            <p className="break-all">{r.email}</p>
            <p className="text-muted">{r.source} · {formatShort(r.paidAt)} · <span className="font-mono">{r.orderNo}</span></p>
            {r.supporterName && <p className="text-muted">💛 Thank as {r.supporterName}</p>}
          </li>
        ))}
      </ul>

      <h2 className="font-display mt-10 text-2xl font-black">Supporters list</h2>
      <p className="mt-1 text-sm text-muted">Shown on the Donate page. Only donors who checked &ldquo;Thank me by name&rdquo;.</p>
      {names.length === 0 ? (
        <p className="mt-3 text-muted">Nobody yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-sm">💛 {n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-line bg-panel p-4">
      <dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}
