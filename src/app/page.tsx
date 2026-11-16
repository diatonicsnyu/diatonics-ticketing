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
  const [next, ...later] = events;
  const nextCheapest = next ? Math.min(...next.ticket_types.map((t) => t.price_cents)) : NaN;

  return (
    <SiteChrome>
      <section className="flex flex-col items-center gap-4 text-center">
        <Image src={logo} alt="Diatonics logo" width={180} height={180} priority />
        <h1 className="font-display text-3xl font-black sm:text-4xl">Diatonics A Cappella</h1>
      </section>

      {/* The next show, big, with a Buy button (spec §12). */}
      {next && (
        <section className="mt-8 overflow-hidden rounded-sm border border-line bg-panel" aria-label="Next show">
          {eventImageUrl(next.image_path) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eventImageUrl(next.image_path)!} alt="" className="aspect-video w-full object-cover" />
          )}
          <div className="p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-burgundy">Next show</p>
            <h2 className="font-display mt-1 text-3xl font-black">{next.name}</h2>
            <p className="mt-2 text-lg">{formatShort(next.starts_at)}</p>
            <p className="text-muted">{next.venue}</p>
            {salesOpen(next) ? (
              <Link href={`/events/${next.slug}`}
                className="font-display mt-5 inline-block rounded-sm bg-burgundy px-8 py-4 text-lg font-bold text-white hover:bg-burgundy-bright">
                Get tickets{Number.isFinite(nextCheapest) && ` · ${formatCents(allInCents(nextCheapest))}`}
              </Link>
            ) : (
              <p className="mt-5 font-semibold">Online sales closed</p>
            )}
          </div>
        </section>
      )}

      {later.length > 0 && <h2 className="font-display mt-10 text-xl font-bold">More shows</h2>}
      <section className="mt-4 space-y-4" aria-label="Events">
        {events.length === 0 ? (
          <p className="rounded-sm border border-line bg-panel p-6 text-center text-muted">
            No shows on sale right now. Check back soon!
          </p>
        ) : (
          later.map((e) => {
            const img = eventImageUrl(e.image_path);
            const cheapest = Math.min(...e.ticket_types.map((t) => t.price_cents));
            const open = salesOpen(e);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="flex overflow-hidden rounded-sm border border-line bg-panel transition hover:border-link"
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

      <section className="mt-12 rounded-sm border border-line bg-panel p-6 text-center">
        <h2 className="font-display text-xl font-bold">Support the Diatonics</h2>
        <p className="mt-2 text-muted">Every bit helps us keep singing.</p>
        <div className="mt-4">
          <DonateButton />
        </div>
      </section>
    </SiteChrome>
  );
}
