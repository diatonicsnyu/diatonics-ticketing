import Image from "next/image";
import Link from "next/link";
import logo from "../../public/logo.png";
import { SiteChrome, DonateButton } from "@/components/SiteChrome";
import { listUpcomingEvents, salesOpen, eventImageUrl } from "@/lib/events";
import { formatShort } from "@/lib/time";
import { allInCents, formatCents } from "@/lib/money";

// Always render with fresh data (new events, sales closing).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await listUpcomingEvents();

  return (
    <SiteChrome>
      <section className="flex flex-col items-center gap-4 text-center">
        <Image src={logo} alt="Diatonics logo" width={180} height={180} priority />
        <h1 className="font-display text-3xl font-black sm:text-4xl">Upcoming Shows</h1>
      </section>

      <section className="mt-8 space-y-4" aria-label="Events">
        {events.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel p-6 text-center text-muted">
            No shows on sale right now. Check back soon!
          </p>
        ) : (
          events.map((e) => {
            const img = eventImageUrl(e.image_path);
            const cheapest = Math.min(...e.ticket_types.map((t) => t.price_cents));
            const open = salesOpen(e);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="flex overflow-hidden rounded-xl border border-line bg-panel transition hover:border-link"
              >
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="hidden w-36 shrink-0 object-cover sm:block" />
                )}
                <div className="flex-1 p-5">
                  <h2 className="font-display text-xl font-bold">{e.name}</h2>
                  <p className="mt-1 text-muted">{formatShort(e.starts_at)} · {e.venue}</p>
                  <p className="mt-3 text-sm font-semibold text-link">
                    {open
                      ? Number.isFinite(cheapest)
                        ? `Tickets from ${formatCents(allInCents(cheapest))} →`
                        : "Details →"
                      : "Online sales closed"}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </section>

      <section className="mt-12 rounded-xl border border-line bg-panel p-6 text-center">
        <h2 className="font-display text-xl font-bold">Support the Diatonics</h2>
        <p className="mt-2 text-muted">Every bit helps us keep singing.</p>
        <div className="mt-4">
          <DonateButton />
        </div>
      </section>
    </SiteChrome>
  );
}
