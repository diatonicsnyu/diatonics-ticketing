import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { OrderTickets } from "@/components/OrderTickets";
import { isDemo } from "@/lib/demo";
import { finalizeCheckoutSession, getOrderBySession } from "@/lib/orders";
import { formatCents } from "@/lib/money";
import { orderLinkKey } from "@/lib/ticket-token";

export const metadata = { title: "You're going!", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where Stripe sends buyers after paying (spec §12 "Confirmation page").
 * The link contains Stripe's checkout id, which only the buyer has.
 */
export default async function ConfirmedPage(props: PageProps<"/orders/confirmed">) {
  if (isDemo()) notFound();
  const { session_id } = await props.searchParams;
  if (typeof session_id !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(session_id)) notFound();

  // Usually Stripe's webhook has already created the tickets. If not (yet),
  // ask Stripe directly so the buyer never sees a blank page.
  await finalizeCheckoutSession(session_id).catch((err) => console.error("finalize on confirmation page failed:", err));
  const order = await getOrderBySession(session_id);
  if (!order) notFound();

  if (order.status === "expired") {
    return (
      <SiteChrome>
        <div className="text-center">
          <h1 className="font-display text-4xl font-black">This checkout expired</h1>
          <p className="mt-3 text-muted">You weren&apos;t charged. Your tickets were released, so you can try again.</p>
          <Link href={`/events/${order.event.slug}`} className="mt-6 inline-block text-link underline underline-offset-4">
            Back to {order.event.name}
          </Link>
        </div>
      </SiteChrome>
    );
  }

  if (order.status !== "paid") {
    return (
      <SiteChrome>
        {/* Reload every 3 seconds until Stripe confirms the payment. */}
        <meta httpEquiv="refresh" content="3" />
        <div className="text-center">
          <p className="text-5xl" aria-hidden>🎶</p>
          <h1 className="font-display mt-2 text-4xl font-black">Confirming your payment…</h1>
          <p className="mt-3 text-muted">This usually takes a few seconds. This page refreshes by itself.</p>
        </div>
      </SiteChrome>
    );
  }

  return (
    <SiteChrome>
      <div className="text-center">
        <p className="text-5xl" aria-hidden>🎉</p>
        <h1 className="font-display mt-2 text-4xl font-black sm:text-5xl">You&apos;re going!</h1>
        <p className="mt-2 text-muted">
          Order {order.orderNo} · Your tickets are below. Tap <strong className="text-ink">Download</strong> on each one to keep it on your phone.
        </p>
        {order.donationCents > 0 && (
          <div className="mt-6 rounded-sm border border-burgundy bg-white px-6 py-4">
            <p className="font-display text-2xl font-black text-burgundy">
              Thank you for your {formatCents(order.donationCents)} donation! 💛
            </p>
            <p className="mt-1 text-balance text-lg">
              It goes straight to our uniforms, venues, mics and everything else that keeps the Diatonics singing.
            </p>
            {order.recognize && order.displayName && (
              <p className="mt-2 text-muted">
                We&apos;ll add <strong className="text-ink">{order.displayName}</strong> to our supporters list.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8">
        <OrderTickets order={order} />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        We also emailed them to {order.buyerEmail}. To see them again later, use the link in that email, or open{" "}
        <Link href={`/tickets/${orderLinkKey(order.id)}`} className="text-link underline underline-offset-4">your tickets page</Link> and bookmark it.
      </p>

      <div className="mt-6 flex justify-center text-sm">
        <Link href="/" className="text-link underline underline-offset-4">Back to shows</Link>
      </div>
    </SiteChrome>
  );
}
