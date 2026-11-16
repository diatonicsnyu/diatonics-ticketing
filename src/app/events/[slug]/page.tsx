import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { getPublicEventBySlug, salesOpen, eventImageUrl, ticketsRemaining } from "@/lib/events";
import { startTicketCheckout } from "@/app/checkout/actions";
import { BuyForm } from "./BuyForm";
import { formatDate, formatTime } from "@/lib/time";
import { allInCents, allInLabel, formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Show the "X / Y left" count only once this share of capacity has sold [assumed: 10%]. */
const SHOW_COUNT_AFTER_SOLD = 0.1;

export async function generateMetadata(props: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const event = await getPublicEventBySlug(slug);
  return { title: event?.name ?? "Event not found" };
}

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  // Uses the public (RLS) client, so draft events simply aren't found -> 404.
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const img = eventImageUrl(event.image_path);
  const open = salesOpen(event);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`;
  const left = ticketsRemaining(event);
  const cheapest = Math.min(...event.ticket_types.map((t) => t.price_cents));

  return (
    <SiteChrome>
      {/* Phone: one column. Laptop: details on the left (2/5), tickets on the right (3/5). */}
      <article className="grid gap-8 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-2">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="mb-6 aspect-video w-full rounded-sm object-cover" />
        )}

        <h1 className="font-display text-4xl font-black sm:text-5xl">{event.name}</h1>

        <dl className="mt-4 space-y-1 text-lg">
          <div>
            <dt className="sr-only">Date</dt>
            <dd>{formatDate(event.starts_at)}</dd>
          </div>
          <div>
            <dt className="sr-only">Time</dt>
            <dd>
              Show {formatTime(event.starts_at)}
              {event.doors_at && <> · Doors {formatTime(event.doors_at)}</>}
            </dd>
          </div>
          <div>
            <dt className="sr-only">Venue</dt>
            <dd>
              <a href={mapUrl} target="_blank" rel="noreferrer" className="text-link underline underline-offset-4">
                {event.venue}
              </a>
            </dd>
          </div>
        </dl>

        {event.description && (
          <p className="mt-6 whitespace-pre-line text-muted">{event.description}</p>
        )}

        </div>

        <section className="rounded-sm border border-line bg-panel p-5 sm:p-8 lg:col-span-3" aria-label="Tickets">
          <h2 className="font-display text-3xl font-black">Tickets</h2>

          {event.status === "cancelled" ? (
            <p className="mt-3">This show has been cancelled.</p>
          ) : (
            <>
              {/* Key facts, each in its own box. GA must sit near the price (spec §12). */}
              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
                <InfoBox label="Seating" value="General admission" sub="First come, first served" accent />
                {Number.isFinite(cheapest) && (
                  <InfoBox
                    label="Price"
                    value={`${event.ticket_types.length > 1 ? "From" : "Online"} ${formatCents(allInCents(cheapest))}`}
                    // Door price is display only. The site never sells or tracks door tickets (D31).
                    sub={
                      event.door_price_cents != null
                        ? `At the door ${formatCents(event.door_price_cents)}, Venmo or cash`
                        : "Includes the service fee"
                    }
                  />
                )}
                {/* Always the true count (no padding). It stays hidden until 10% have sold,
                    so early buyers don't see a full count. Admin always sees real numbers. */}
                {left != null && event.capacity != null && open && (
                  left === 0 ? (
                    <InfoBox label="Tickets left" value="Sold out online" />
                  ) : event.capacity - left >= Math.ceil(event.capacity * SHOW_COUNT_AFTER_SOLD) ? (
                    <InfoBox label="Tickets left" value={String(left)} />
                  ) : (
                    <InfoBox label="Tickets" value="On sale now" sub="Grab yours early" />
                  )
                )}
              </div>

              {open && left !== 0 ? (
                <BuyForm
                  types={event.ticket_types}
                  remaining={left}
                  action={startTicketCheckout.bind(null, event.slug)}
                />
              ) : (
                <>
                  <ul className="mt-4 space-y-3">
                    {event.ticket_types.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-page p-4">
                        <span className="text-lg font-semibold">{t.name}</span>
                        <span className="text-muted">{allInLabel(t.price_cents)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 font-semibold">
                    {left === 0 ? "Sold out online." : "Online sales are closed for this show."}
                  </p>
                  <p className="mt-2 text-xs text-muted">No refunds. All sales final.</p>
                </>
              )}
            </>
          )}
        </section>
      </article>
    </SiteChrome>
  );
}

function InfoBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-sm border border-line bg-page p-4">
      <p className="text-sm font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-burgundy" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-base text-muted">{sub}</p>}
    </div>
  );
}
