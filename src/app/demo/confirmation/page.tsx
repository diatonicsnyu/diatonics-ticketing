import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { TicketCard } from "@/components/TicketCard";
import { isDemo } from "@/lib/demo";
import { decodeDemoOrder } from "@/lib/demo-order";
import { formatCents } from "@/lib/money";

export const metadata = { title: "You're going!", robots: { index: false } };

// DEMO version of the confirmation page (spec §12). Step 2/3 builds the real
// one from the saved order; the layout here is meant to carry over.
export default async function DemoConfirmationPage(props: PageProps<"/demo/confirmation">) {
  if (!isDemo()) notFound();
  const { o } = await props.searchParams;
  const order = decodeDemoOrder(o);
  if (!order || order.kind !== "tickets" || !order.event) notFound();
  const ev = order.event;

  return (
    <SiteChrome>
      <div className="text-center">
        <p className="text-5xl" aria-hidden>🎉</p>
        <h1 className="font-display mt-2 text-4xl font-black sm:text-5xl">You&apos;re going!</h1>
        <p className="mt-2 text-muted">
          Order {order.orderNo} · We also emailed your tickets to <strong className="text-ink">{order.buyer.email}</strong>.
        </p>
        {order.donationCents > 0 && (
          <p className="mt-2">Thank you for your {formatCents(order.donationCents)} donation! 💛</p>
        )}
      </div>

      <div className="mt-8 space-y-5">
        {order.tickets.map((t, i) => (
          <TicketCard
            key={t.code}
            qrText={`DEMO ${t.code}`}
            code={t.code}
            typeName={t.typeName}
            eventName={ev.name}
            startsAt={ev.startsAt}
            venue={ev.venue}
            holder={order.buyer.name}
            index={i + 1}
            count={order.tickets.length}
          />
        ))}
      </div>

      <div className="mt-8 rounded-sm border border-line bg-white p-5 text-sm">
        <p>📱 <strong>At the door:</strong> turn your screen brightness up and show the QR code. Each ticket gets one person in.</p>
        <p className="mt-2 text-muted">Lost this page? Use &ldquo;Lost your ticket?&rdquo; at the bottom of the site to get your tickets re-sent.</p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
        <Link href={`/demo/email?o=${o}`} className="text-link underline underline-offset-4">See the ticket email</Link>
        <Link href="/demo/door" className="text-link underline underline-offset-4">See what door volunteers see</Link>
        <Link href="/" className="text-link underline underline-offset-4">Back to shows</Link>
      </div>
    </SiteChrome>
  );
}
