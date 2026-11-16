import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllEventsForAdmin, STATUS_LABELS } from "@/lib/events";
import { formatShort } from "@/lib/time";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Admin · Events" };
export const dynamic = "force-dynamic";

export default async function AdminEventsPage(props: PageProps<"/admin">) {
  // Check here too, not just in the layout: Next.js can render a page in
  // parallel with its layout, so every page that loads private data checks.
  await requireAdmin();
  const { saved } = await props.searchParams;
  const events = await listAllEventsForAdmin();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-black">Events</h1>
        <Link href="/admin/events/new" className="font-display rounded-sm bg-burgundy px-5 py-2.5 font-bold text-white hover:bg-burgundy-bright">
          + New event
        </Link>
      </div>

      {saved && <p className="mt-4 rounded-sm border border-link p-3" role="status">Saved.</p>}

      {events.length === 0 ? (
        <p className="mt-8 text-muted">No events yet. Create your first one.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-panel p-4">
              <div>
                <p className="font-semibold">{e.name}</p>
                <p className="text-sm text-muted">
                  {formatShort(e.starts_at)} · {e.venue}
                </p>
                <p className="text-sm text-muted">
                  {e.ticket_types.map((t) => `${t.name} ${formatCents(t.price_cents)}`).join(" · ")}
                  {" · "}
                  {e.capacity ? `capacity ${e.capacity}` : "unlimited"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-sm px-3 py-1 text-xs font-semibold ${e.status === "on_sale" ? "bg-sky text-ink" : "border border-line"}`}>
                  {STATUS_LABELS[e.status]}
                </span>
                {e.status !== "draft" && (
                  <Link href={`/events/${e.slug}`} className="text-sm text-link hover:underline">View</Link>
                )}
                <Link href={`/admin/events/${e.id}`} className="text-sm text-link hover:underline">Edit</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
