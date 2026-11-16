import Image from "next/image";
import Link from "next/link";
import logo from "../../public/logo.png";
import { SiteChrome, DonateButton } from "@/components/SiteChrome";
import { listUpcomingEvents, salesOpen, eventImageUrl } from "@/lib/events";
import { formatShort } from "@/lib/time";
import { allInCents, formatCents } from "@/lib/money";

/**
 * Picture beside an event tile: the event's uploaded image if it has one,
 * otherwise the Diatonics logo as a placeholder.
 */
function EventThumb({ imagePath, className }: { imagePath: string | null; className: string }) {
  const img = eventImageUrl(imagePath);
  return (
    <div className={`relative shrink-0 bg-sky/30 ${className}`}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Image src={logo} alt="" fill sizes="256px" className="object-contain p-3" />
      )}
    </div>
  );
}

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
        <h1 className="font-display text-4xl font-black sm:text-5xl">Diatonics A Cappella</h1>
      </section>

      {/* The next show, big, with a Buy button (spec §12). */}
      {next && (
        <section className="mt-8 flex flex-col overflow-hidden rounded-sm border border-line bg-panel sm:flex-row" aria-label="Next show">
          <EventThumb imagePath={next.image_path} className="h-48 w-full sm:h-auto sm:min-h-64 sm:w-64" />
          {/* Text on the left, button on the right, so the tile is balanced edge to edge.
              Stacks (text, then button) on narrower screens. */}
          <div className="flex flex-1 flex-col justify-center gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-12">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-burgundy">Next show</p>
              <h2 className="font-display mt-1 text-4xl font-black">{next.name}</h2>
              <p className="mt-2 text-lg">{formatShort(next.starts_at)}</p>
              <p className="text-muted">{next.venue}</p>
            </div>
            {salesOpen(next) ? (
              <Link href={`/events/${next.slug}`}
                className="font-display shrink-0 self-start whitespace-nowrap rounded-sm bg-burgundy px-8 py-4 text-lg font-bold text-white hover:bg-burgundy-bright lg:self-center">
                Get tickets{Number.isFinite(nextCheapest) && ` · ${formatCents(allInCents(nextCheapest))}`}
              </Link>
            ) : (
              <p className="shrink-0 font-semibold">Online sales closed</p>
            )}
          </div>
        </section>
      )}

      {later.length > 0 && <h2 className="font-display mt-10 text-2xl font-bold">More shows</h2>}
      <section className="mt-4 space-y-4" aria-label="Events">
        {events.length === 0 ? (
          <p className="rounded-sm border border-line bg-panel p-6 text-center text-muted">
            No shows on sale right now. Check back soon!
          </p>
        ) : (
          later.map((e) => {
            const cheapest = Math.min(...e.ticket_types.map((t) => t.price_cents));
            const open = salesOpen(e);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="flex overflow-hidden rounded-sm border border-line bg-panel transition hover:border-link"
              >
                <EventThumb imagePath={e.image_path} className="w-24 self-stretch sm:w-36" />
                <div className="flex-1 p-5">
                  <h2 className="font-display text-2xl font-bold">{e.name}</h2>
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
        <h2 className="font-display text-2xl font-bold">Support the Diatonics</h2>
        <p className="mt-2 text-muted">Every bit helps us keep singing.</p>
        <div className="mt-4">
          <DonateButton />
        </div>
      </section>
    </SiteChrome>
  );
}
