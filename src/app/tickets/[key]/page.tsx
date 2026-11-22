import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { OrderTickets } from "@/components/OrderTickets";
import { isDemo } from "@/lib/demo";
import { getOrderById } from "@/lib/orders";
import { orderIdFromLinkKey } from "@/lib/ticket-token";
import { formatDate, formatTime } from "@/lib/time";

export const metadata = { title: "My tickets", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * "View my tickets" (spec §3.4): the link in the ticket email. The link is
 * signed (lib/ticket-token.ts), so it works without a login but can't be
 * guessed for someone else's order.
 */
export default async function MyTicketsPage(props: PageProps<"/tickets/[key]">) {
  if (isDemo()) notFound();
  const { key } = await props.params;
  const orderId = orderIdFromLinkKey(key);
  if (!orderId) notFound();
  const order = await getOrderById(orderId);
  if (!order) notFound();
  // Cancelled show (D20): say what happened instead of "not found".
  if (order.status === "refunded") {
    return (
      <SiteChrome>
        <div className="text-center">
          <h1 className="font-display text-4xl font-black">This show was cancelled</h1>
          <p className="mt-3 text-lg">{order.event.name} · {formatDate(order.event.starts_at)}</p>
          <p className="mt-3 text-muted">Order {order.orderNo} was refunded in full to the card or account you paid with. Refunds take 5–10 business days to show up.</p>
          <Link href="/" className="mt-6 inline-block text-link underline underline-offset-4">See upcoming shows</Link>
        </div>
      </SiteChrome>
    );
  }
  if (order.status !== "paid" && order.status !== "comp") notFound();

  return (
    <SiteChrome>
      <div className="text-center">
        <h1 className="font-display text-4xl font-black sm:text-5xl">Your tickets</h1>
        <p className="mt-2 text-muted">
          {order.event.name} · {formatDate(order.event.starts_at)} · {formatTime(order.event.starts_at)} · Order {order.orderNo}
        </p>
      </div>

      <div className="mt-8">
        {order.tickets.length > 0 ? (
          <OrderTickets order={order} />
        ) : (
          <p className="rounded-sm border border-edge bg-white p-5 text-center">This order has no active tickets.</p>
        )}
      </div>

      <div className="mt-6 flex justify-center text-sm">
        <Link href={`/events/${order.event.slug}`} className="text-link underline underline-offset-4">About the show</Link>
      </div>
    </SiteChrome>
  );
}
