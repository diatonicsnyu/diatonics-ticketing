import { TicketCard } from "@/components/TicketCard";
import type { ConfirmedOrder } from "@/lib/orders";

/** An order's tickets + the "at the door" tips (confirmation page and "view my tickets"). */
export function OrderTickets({ order }: { order: ConfirmedOrder }) {
  return (
    <>
      <div className="space-y-5">
        {order.tickets.map((t, i) => (
          <TicketCard
            key={t.id}
            qrText={t.qrToken}
            code={t.shortCode}
            typeName={t.typeName}
            eventName={order.event.name}
            startsAt={order.event.starts_at}
            venue={order.event.venue}
            holder={order.buyerName}
            index={i + 1}
            count={order.tickets.length}
            actions
            orderNo={order.orderNo}
          />
        ))}
      </div>

      <div className="mt-8 rounded-sm border border-edge bg-white p-5 text-sm">
        <p>📱 <strong>At the door:</strong> turn your screen brightness up and show the QR code. Each ticket gets one person in.</p>
        <p className="mt-2">Tip: tap <strong>Download</strong> to keep your ticket on your phone, in case there&apos;s no signal at the venue.</p>
      </div>
    </>
  );
}
