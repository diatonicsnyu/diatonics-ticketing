import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { getPublicEventBySlug, salesOpen, eventImageUrl } from "@/lib/events";
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
  const cheapest = Math.min(...event.ticket_types.map((t) => t.price_cents));

  return (
    <SiteChrome>
      <article>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="mb-6 aspect-video w-full rounded-xl object-cover" />
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
              <a href={mapUrl} target="_blank" rel="noreferrer" className="text-sky underline underline-offset-4">
                {event.venue}
              </a>
            </dd>
          </div>
        </dl>

        {event.description && (
          <p className="mt-6 whitespace-pre-line text-cream-dim">{event.description}</p>
        )}

        <section className="mt-8 rounded-xl border border-line bg-panel p-5" aria-label="Tickets">
          <h2 className="font-display text-xl font-bold">Tickets</h2>

          {event.status === "cancelled" ? (
            <p className="mt-3">This show has been cancelled.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-line">
                {event.ticket_types.map((t) => (
                  <li key={t.id} className="flex flex-wrap justify-between gap-2 py-3">
                    <span className="font-semibold">{t.name}</span>
                    {/* All-in price, required by NY law + FTC rule (spec D4). */}
                    <span>{allInLabel(t.price_cents)}</span>
                  </li>
                ))}
              </ul>

              {/* Display only. The site never sells or tracks door tickets. */}
              {event.door_price_cents != null && Number.isFinite(cheapest) && (
                <p className="mt-3 text-sm text-cream-dim">
                  Online {formatCents(allInCents(cheapest))} · At the door{" "}
                  {formatCents(event.door_price_cents)}, Venmo or cash
                </p>
              )}

              {open ? (
                // Step 2 replaces this with quantity pickers + Stripe Checkout.
                <button
                  type="button"
                  disabled
                  className="font-display mt-5 w-full rounded-full bg-sky px-6 py-3 font-bold text-ink opacity-60"
                >
                  Buy tickets (coming in Step 2)
                </button>
              ) : (
                <p className="mt-5 font-semibold">Online sales are closed for this show.</p>
              )}

              <p className="mt-4 text-sm text-cream-dim">No refunds. All sales final.</p>
            </>
          )}
        </section>
      </article>
    </SiteChrome>
  );
}
