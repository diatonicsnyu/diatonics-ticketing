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
      {/* Welcome band (SPEC §13: fuller, outlined boxes) */}
      <section className="flex flex-col items-center gap-4 rounded-sm border border-edge bg-gradient-to-b from-white to-[#ddeefa] px-6 py-10 text-center">
        <Image src={logo} alt="Diatonics logo" width={170} height={170} priority />
        <h1 className="font-display text-4xl font-black sm:text-5xl">Diatonics A Cappella</h1>
        <p className="max-w-2xl text-lg">An independent a cappella group from New York City. Come hear us live!</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {next && (
            <a href="#shows" className="font-display rounded-sm bg-burgundy px-6 py-3 font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-burgundy-bright hover:shadow-md">
              See upcoming shows
            </a>
          )}
          <Link href="/donate" className="font-display rounded-sm border border-edge bg-white px-6 py-3 font-bold text-ink shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md">
            Support us
          </Link>
        </div>
      </section>

      {/* The next show, big, with a Buy button (spec §12). */}
      {next && (
        <section id="shows" className="mt-8 flex scroll-mt-4 flex-col overflow-hidden rounded-sm border border-edge bg-panel shadow-sm sm:flex-row" aria-label="Next show">
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
          <p className="rounded-sm border border-edge bg-panel p-6 text-center text-muted">
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
                className="flex overflow-hidden rounded-sm border border-edge bg-panel transition hover:border-link"
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

      {/* How tickets work: facts the buyer needs, so nobody's surprised at the door */}
      <section className="mt-12" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-bold">How tickets work</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            ["1", "Buy online", "Pay by card, Apple Pay, Google Pay or Cash App. The price you see includes the fee."],
            ["2", "Check your email", "Your tickets arrive right away, each with its own QR code. Lost them? Get them re-sent anytime."],
            ["3", "Show the QR at the door", "General admission: first come, first served. Each ticket gets one person in."],
          ].map(([n, title, text]) => (
            <li key={n} className="flex gap-4 rounded-sm border border-edge bg-panel p-5">
              <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-sky text-xl font-black" aria-hidden>
                {n}
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid overflow-hidden rounded-sm border border-edge bg-panel md:grid-cols-[1fr_auto]">
        <div className="p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">Support the Diatonics</h2>
          <p className="mt-2 max-w-2xl">
            We&apos;re independent, so we get no university funding. Everything it takes to put on a show is paid for by the group and its members. Every bit helps us keep singing.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-line bg-[#fdf3f5] p-6 md:border-l md:border-t-0 md:px-10">
          <DonateButton />
          <Link href="/lost-ticket" className="rounded-sm border border-edge bg-white px-4 py-3 text-sm font-semibold shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md">
            Lost your ticket?
          </Link>
        </div>
      </section>
    </SiteChrome>
  );
}
