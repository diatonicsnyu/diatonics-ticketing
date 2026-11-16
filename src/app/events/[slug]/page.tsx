import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { getPublicEventBySlug, salesOpen, eventImageUrl, ticketsRemaining } from "@/lib/events";
import { startTicketCheckout } from "@/app/checkout/actions";
import { BuyForm } from "./BuyForm";
import { formatDate, formatTime } from "@/lib/time";
import { allInCents, allInLabel, formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

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
      <article>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="mb-6 aspect-video w-full rounded-sm object-cover" />
        )}

        <h1 className="font-display text-3xl font-black sm:text-4xl">{event.name}</h1>

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

        <section className="mt-8 rounded-sm border border-line bg-panel p-5" aria-label="Tickets">
          <h2 className="font-display text-xl font-bold">Tickets</h2>

          {event.status === "cancelled" ? (
            <p className="mt-3">This show has been cancelled.</p>
          ) : (
            <>
              <p className="mt-2 font-semibold text-burgundy">General admission: first come, first served</p>
              {left != null && open && (
                <p className="mt-1 text-sm text-muted">{left === 0 ? "Sold out online" : `${left} left`}</p>
              )}

              {/* Display only. The site never sells or tracks door tickets (D31). */}
              {event.door_price_cents != null && Number.isFinite(cheapest) && (
                <p className="mt-1 text-sm text-muted">
                  Online {formatCents(allInCents(cheapest))} · At the door{" "}
                  {formatCents(event.door_price_cents)}, Venmo or cash
                </p>
              )}

              {open && left !== 0 ? (
                <BuyForm
                  types={event.ticket_types}
                  remaining={left}
                  action={startTicketCheckout.bind(null, event.slug)}
                />
              ) : (
                <>
                  <ul className="mt-3 divide-y divide-line">
                    {event.ticket_types.map((t) => (
                      <li key={t.id} className="flex flex-wrap justify-between gap-2 py-3">
                        <span className="font-semibold">{t.name}</span>
                        <span>{allInLabel(t.price_cents)}</span>
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
