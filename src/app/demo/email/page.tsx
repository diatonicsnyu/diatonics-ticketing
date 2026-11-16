import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import logo from "../../../../public/logo.png";
import { TicketCard } from "@/components/TicketCard";
import { isDemo } from "@/lib/demo";
import { decodeDemoOrder } from "@/lib/demo-order";
import { formatDate, formatTime } from "@/lib/time";

export const metadata = { title: "Ticket email preview", robots: { index: false } };

// DEMO: a web preview of the ticket email's design (spec §3.4, §12).
// Step 3 turns this into a real email sent by Resend.
export default async function DemoEmailPage(props: PageProps<"/demo/email">) {
  if (!isDemo()) notFound();
  const { o } = await props.searchParams;
  const order = decodeDemoOrder(o);
  if (!order || order.kind !== "tickets" || !order.event) notFound();
  const ev = order.event;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue)}`;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <p className="mb-4 text-center text-sm text-muted">
        Preview of the email in {order.buyer.email}&apos;s inbox ·{" "}
        <Link href={`/demo/confirmation?o=${o}`} className="text-link underline">back</Link>
      </p>

      <div className="rounded-sm border border-line bg-white shadow-sm">
        <div className="border-b border-line px-6 py-3 text-sm text-muted">
          <p><strong className="text-ink">From:</strong> Diatonics Tickets</p>
          <p><strong className="text-ink">Subject:</strong> Your tickets for {ev.name} 🎶</p>
        </div>

        <div className="bg-page px-6 py-6 text-center">
          <Image src={logo} alt="Diatonics" width={88} height={88} className="mx-auto" />
        </div>

        <div className="space-y-4 px-6 py-6">
          <p className="text-lg">Hi {order.buyer.name.split(" ")[0]}, you&apos;re going! 🎉</p>
          <div className="rounded-sm bg-page p-4 text-sm">
            <p className="font-bold">{ev.name}</p>
            <p>{formatDate(ev.startsAt)} · Show {formatTime(ev.startsAt)}{ev.doorsAt && ` · Doors ${formatTime(ev.doorsAt)}`}</p>
            <p><a href={mapUrl} className="text-link underline">{ev.venue}</a></p>
            <p className="mt-1 text-muted">Order {order.orderNo}</p>
          </div>

          {order.tickets.map((t, i) => (
            <TicketCard key={t.code} qrText={`DEMO ${t.code}`} code={t.code} typeName={t.typeName}
              eventName={ev.name} startsAt={ev.startsAt} venue={ev.venue} holder={order.buyer.name}
              index={i + 1} count={order.tickets.length} />
          ))}

          <p className="text-sm">💡 <strong>Tip:</strong> turn your screen brightness up at the door so the QR scans fast.</p>
          <p className="text-center">
            <span className="font-display inline-block rounded-sm bg-burgundy px-6 py-3 font-bold text-white">View my tickets</span>
          </p>
          <p className="text-xs text-muted">All sales final. Lost this email? Visit &ldquo;Lost your ticket?&rdquo; on the site to re-send it.</p>
        </div>
      </div>
    </main>
  );
}
