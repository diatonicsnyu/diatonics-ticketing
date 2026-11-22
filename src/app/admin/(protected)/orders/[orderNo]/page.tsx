import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadAdminOrder, type AdminTicket } from "@/lib/admin-orders";
import { formatCents } from "@/lib/money";
import { formatShort } from "@/lib/time";
import { ConfirmSubmit } from "../../expenses/ConfirmSubmit";
import { sendTicketEmailAction, undoCheckInAction } from "./actions";
import { btn, btnDanger, btnSm } from "@/lib/ui";

export const metadata = { title: "Admin · Order" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  undo_ok: "Check-in undone. That ticket will scan 🟩 again (door phones pick this up within a minute).",
  undo_not_checked_in: "That ticket wasn't checked in, so there was nothing to undo.",
  undo_not_found: "Couldn't find that ticket.",
  undo_setup_needed: "Run supabase/migrations/0009_admin_tools.sql in Supabase first.",
  email_sent: "Ticket email sent.",
  email_already: "The ticket email already went out, so it wasn't sent again. The buyer can use “Lost your ticket?” to get another copy.",
  email_failed: "The email didn't go through. Try again in a few minutes.",
  email_skipped: "This order has no tickets to send.",
  gift_sent: "Gift tickets sent.",
  gift_email_failed: "Gift tickets created, but the email didn't go through. Use “Send the ticket email” below to try again.",
  not_found: "Couldn't find that order.",
};

const STATUS: Record<string, string> = {
  paid: "Paid",
  comp: "Gift tickets (free)",
  pending: "Checkout not finished",
  expired: "Checkout abandoned",
  refunded: "Refunded",
};

/** One order: buyer, amounts, every ticket with its check-in history (SPEC §3.8 master list). */
export default async function AdminOrderPage(props: PageProps<"/admin/orders/[orderNo]">) {
  await requireAdmin();
  const { orderNo } = await props.params;
  const { msg } = await props.searchParams;
  const order = await loadAdminOrder(orderNo.toUpperCase());
  if (!order) notFound();

  const checkedIn = order.tickets.filter((t) => t.status === "checked_in").length;
  const emailOk = order.ticketEmail?.status === "sent" || order.ticketEmail?.status === "sending";
  const canEmail = (order.status === "paid" || order.status === "comp") && order.tickets.some((t) => t.status !== "void") && !emailOk;

  return (
    <>
      <p className="text-sm">
        <Link href="/admin/buyers" className={btnSm}>← Buyers</Link>
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-black">
          {order.firstName} {order.lastName}
        </h1>
        <p className="font-mono text-lg">Order {order.orderNo}</p>
      </div>
      <p className="mt-1 text-muted">
        {STATUS[order.status] ?? order.status}
        {order.event && ` · ${order.event.name} · ${formatShort(order.event.startsAt)}`}
      </p>

      {typeof msg === "string" && MESSAGES[msg] && (
        <p className="mt-4 rounded-sm border border-link bg-panel p-3" role="status">{MESSAGES[msg]}</p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-sm border border-line bg-panel p-4">
          <h2 className="font-display text-lg font-bold">Buyer</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Email" value={<span className="break-all">{order.email}</span>} />
            <Row label="Phone" value={order.phone || "—"} />
            <Row label={order.status === "comp" ? "Given" : "Bought"} value={formatShort(order.paidAt ?? order.createdAt)} />
            {order.status === "comp" && <Row label="Given by" value={order.compBy || "—"} />}
            {order.compNote && <Row label="Note" value={order.compNote} />}
            {order.supporterName && <Row label="Supporter name" value={`💛 ${order.supporterName}`} />}
            <Row
              label="Ticket email"
              value={
                order.ticketEmail
                  ? order.ticketEmail.status === "sent"
                    ? `Sent ${formatShort(order.ticketEmail.at)}`
                    : order.ticketEmail.status === "sending"
                      ? "Sending…"
                      : "Failed"
                  : "Not sent"
              }
            />
          </dl>
          {canEmail && (
            <form action={sendTicketEmailAction.bind(null, order.orderNo)} className="mt-3">
              <button className={btn}>Send the ticket email</button>
            </form>
          )}
        </section>

        <section className="rounded-sm border border-line bg-panel p-4">
          <h2 className="font-display text-lg font-bold">Amounts</h2>
          <dl className="mt-2 space-y-1 text-sm">
            {order.lines.map((l) => (
              <Row key={l.typeName} label={`${l.quantity} × ${l.typeName}`} value={order.status === "comp" ? "Free" : formatCents(l.quantity * l.priceCents)} />
            ))}
            <Row label="Service fees" value={formatCents(order.serviceFeeCents)} />
            {order.donationCents > 0 && <Row label="Donation" value={formatCents(order.donationCents)} />}
            <Row label="Total paid" value={<strong>{formatCents(order.totalCents)}</strong>} />
            {order.stripeFeeCents != null && <Row label="Stripe kept" value={formatCents(order.stripeFeeCents)} />}
          </dl>
        </section>
      </div>

      <h2 className="font-display mt-8 text-2xl font-black">
        Tickets <span className="text-base font-semibold text-muted">· {checkedIn} of {order.tickets.length} checked in</span>
      </h2>
      {order.tickets.length === 0 ? (
        <p className="mt-3 text-muted">No tickets (the checkout wasn&apos;t finished).</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {order.tickets.map((t) => (
            <TicketItem key={t.id} t={t} orderNo={order.orderNo} />
          ))}
        </ul>
      )}
    </>
  );
}

function TicketItem({ t, orderNo }: { t: AdminTicket; orderNo: string }) {
  const badge =
    t.status === "checked_in"
      ? "bg-[#d8f3dc] text-[#1b4332]"
      : t.status === "void"
        ? "bg-[#fde2e4] text-[#7a1020]"
        : "border border-line";
  return (
    <li className="rounded-sm border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono font-semibold">{t.shortCode}</p>
          <p className="text-sm text-muted">{t.typeName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${badge}`}>
            {t.status === "checked_in" ? `Checked in${t.checkedInAt ? ` ${formatShort(t.checkedInAt)}` : ""}` : t.status === "void" ? "Void" : "Not scanned yet"}
          </span>
          {t.status === "checked_in" && (
            <form action={undoCheckInAction.bind(null, orderNo, t.id)}>
              <ConfirmSubmit
                message={`Undo the check-in for ${t.shortCode}? It will scan green again at the door.`}
                className={btnDanger}
              >
                Undo check-in
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
      {t.history.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-muted">
          {t.history.map((h, i) => (
            <li key={i}>
              {formatShort(h.at)} ·{" "}
              {h.action === "undo"
                ? `Check-in undone by ${h.deviceName.replace(/^Admin: /, "")}`
                : `${h.conflict ? "⚠️ Scanned again (offline) " : "Checked in "}${h.method === "lookup" ? "by lookup " : ""}on ${h.deviceName || "a door phone"}`}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
