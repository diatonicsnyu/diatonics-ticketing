import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin } from "@/lib/events";
import { cancelProgress, showSummary } from "@/lib/show-changes";
import { formatCents } from "@/lib/money";
import { formatShort, isoToNyInput, nyInputToIso } from "@/lib/time";
import { confirmShowChange, finishCancellationAction } from "./actions";

export const metadata = { title: "Admin · Cancel or move a show" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "That isn't the show's name. Type it exactly as shown.",
  date: "Pick a valid new date and time.",
  past: "The new date is in the past.",
  doors: "Doors have to open before the show starts.",
  same_time: "That's the same date and time it already has.",
  not_open: "Only a show that's on sale (or has sales closed) can be cancelled or moved.",
  not_found: "Couldn't find that show.",
};

const box = "rounded-sm border border-line bg-panel p-5";
const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5 text-ink";
const primary = "font-display rounded-sm bg-burgundy px-5 py-2.5 font-bold text-white hover:bg-burgundy-bright";
const secondary = "rounded-sm border border-line bg-white px-4 py-2.5 hover:border-link";

/**
 * Cancel (refund everyone) or reschedule a show, D20 / §3.8. Three steps:
 * (1) choose, (2) review what will happen, (3) type the show's name.
 * Steps 1 and 2 only look: backing out anywhere changes nothing.
 */
export default async function ChangeShowPage(props: PageProps<"/admin/events/[id]/change">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const event = await getEventForAdmin(id);
  if (!event) notFound();
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const error = ERRORS[str("error")];
  const neverMind = (
    <Link href={`/admin/events/${id}`} className="py-2.5 text-link hover:underline">
      Never mind, change nothing
    </Link>
  );
  const header = (
    <>
      <Link href={`/admin/events/${id}`} className="text-sm text-link hover:underline">← {event.name}</Link>
      <h1 className="font-display mt-2 text-3xl font-black">Cancel or move this show</h1>
      <p className="mt-1 text-muted">{event.name} · {formatShort(event.starts_at)}</p>
      {error && <p className="mt-4 rounded-sm border border-burgundy bg-white p-3 text-burgundy" role="alert">{error}</p>}
    </>
  );

  // ---------- after cancelling: where refunds and emails stand ----------
  if (event.status === "cancelled") {
    const p = await cancelProgress(id);
    const errors = Number(str("errors")) || 0;
    const unfinished = p.toRefund > 0 || p.emailsLeft > 0;
    return (
      <>
        {header}
        <section className={`${box} mt-6`}>
          <h2 className="font-display text-2xl font-black">{str("done") === "refund" ? "Done: the show is cancelled" : "This show is cancelled"}</h2>
          <ul className="mt-3 space-y-1">
            <li>✅ Refunded <strong>{p.refunded}</strong> order{p.refunded === 1 ? "" : "s"} ({formatCents(p.refundedCents)}). Refunds take 5–10 business days to reach buyers.</li>
            {p.toRefund > 0 && <li>⏳ <strong>{p.toRefund}</strong> still to refund.</li>}
            <li>✉️ Emailed <strong>{p.emailsSent}</strong> buyer{p.emailsSent === 1 ? "" : "s"}{p.emailsLeft > 0 && <>; <strong>{p.emailsLeft}</strong> still to go</>}.</li>
            <li>🎟️ Every ticket for this show is cancelled and will scan 🟥 at the door.</li>
          </ul>
          {errors > 0 && (
            <p className="mt-3 rounded-sm border border-burgundy bg-white p-3 text-sm text-burgundy">
              {errors} refund{errors === 1 ? "" : "s"} didn&apos;t go through. Press <strong>Keep going</strong> to try again. If it keeps failing, check the payment in Stripe.
            </p>
          )}
          {unfinished && (
            <>
              <p className="mt-3 text-sm text-muted">
                Anything left finishes by itself the next morning (emails are limited to 100 a day), or press Keep going now.
              </p>
              <form action={finishCancellationAction.bind(null, id)} className="mt-3">
                <button className={primary}>Keep going</button>
              </form>
            </>
          )}
        </section>
      </>
    );
  }

  // ---------- after rescheduling ----------
  if (str("done") === "reschedule") {
    const left = Number(str("left")) || 0;
    return (
      <>
        {header}
        <section className={`${box} mt-6`}>
          <h2 className="font-display text-2xl font-black">Done: the show is moved</h2>
          <ul className="mt-3 space-y-1">
            <li>📅 New date: <strong>{formatShort(event.starts_at)}</strong>. It&apos;s updated on the site already.</li>
            <li>🎟️ Every ticket still works. Nobody needs a new one.</li>
            <li>
              ✉️ Emailed {str("sent") || "0"} buyer{str("sent") === "1" ? "" : "s"} the new date
              {left > 0 && <>; {left} more go out tomorrow morning (emails are limited to 100 a day)</>}.
            </li>
            <li>🔔 Reminders will go out again before the new date.</li>
          </ul>
          <Link href={`/admin/events/${id}`} className="mt-4 inline-block text-link hover:underline">Back to the show</Link>
        </section>
      </>
    );
  }

  if (event.status !== "on_sale" && event.status !== "closed") {
    return (
      <>
        {header}
        <p className={`${box} mt-6`}>Only a show that&apos;s on sale (or has sales closed) can be cancelled or moved. A draft can just be edited.</p>
      </>
    );
  }

  const step = str("step") === "3" ? 3 : str("step") === "2" ? 2 : 1;
  const action = str("action") === "refund" || str("action") === "reschedule" ? str("action") : "";
  const starts = str("starts");
  const doors = str("doors");
  const startsIso = nyInputToIso(starts);
  const doorsIso = doors ? nyInputToIso(doors) : null;
  const stepLabel = (n: number) => <p className="mt-6 text-sm font-bold uppercase tracking-wider text-muted">Step {n} of 3</p>;

  // ---------- step 1: choose ----------
  if (step === 1 || !action || (action === "reschedule" && !startsIso)) {
    return (
      <>
        {header}
        {stepLabel(1)}
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <section className={box}>
            <h2 className="font-display text-xl font-black">Cancel the show and refund everyone</h2>
            <p className="mt-2 text-sm">Every paid order gets its money back through Stripe, every ticket stops working, and every buyer is emailed. Stripe keeps its fees.</p>
            <Link href={`?action=refund&step=2`} className={`${primary} mt-4 inline-block`}>Continue</Link>
          </section>
          <section className={box}>
            <h2 className="font-display text-xl font-black">Move it to a new date</h2>
            <p className="mt-2 text-sm">Tickets carry over to the new date, and every buyer is emailed it.</p>
            <form className="mt-3 space-y-3">
              <input type="hidden" name="action" value="reschedule" />
              <input type="hidden" name="step" value="2" />
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">New show date and time</span>
                <input type="datetime-local" name="starts" required defaultValue={starts || isoToNyInput(event.starts_at)} className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">
                  Doors open <span className="font-normal text-muted">(optional)</span>
                </span>
                <input type="datetime-local" name="doors" defaultValue={doors || isoToNyInput(event.doors_at)} className={input} />
              </label>
              <button className={primary}>Continue</button>
            </form>
          </section>
        </div>
        <p className="mt-6">{neverMind}</p>
      </>
    );
  }

  const params = `action=${action}&starts=${encodeURIComponent(starts)}&doors=${encodeURIComponent(doors)}`;
  const s = await showSummary(id);
  const salesCloseNew = startsIso ? new Date(Date.parse(event.sales_close_at) + Date.parse(startsIso) - Date.parse(event.starts_at)).toISOString() : null;

  const summary =
    action === "refund" ? (
      <ul className="mt-3 space-y-1">
        <li>Refund <strong>{s.paidOrders}</strong> paid order{s.paidOrders === 1 ? "" : "s"}: <strong>{formatCents(s.paidCents)}</strong> back to buyers (tickets, fees and any donations added at checkout).</li>
        <li>Stripe keeps its fees: about <strong>{formatCents(s.stripeFeesCents)}</strong> the group loses.</li>
        {s.giftOrders > 0 && <li>Cancel <strong>{s.giftOrders}</strong> gift ticket order{s.giftOrders === 1 ? "" : "s"}.</li>}
        <li>All <strong>{s.tickets}</strong> ticket{s.tickets === 1 ? "" : "s"} stop working at the door.</li>
        <li>Email every buyer that the show is cancelled.</li>
        <li>The show page says &ldquo;cancelled&rdquo; and sales stop{s.checkingOut > 0 && <>; {s.checkingOut} checkout{s.checkingOut === 1 ? "" : "s"} in progress get closed</>}.</li>
        <li className="font-semibold text-burgundy">This can&apos;t be undone.</li>
      </ul>
    ) : (
      <ul className="mt-3 space-y-1">
        <li>Move from <strong>{formatShort(event.starts_at)}</strong> to <strong>{formatShort(startsIso!)}</strong>{doorsIso && <> (doors {formatShort(doorsIso)})</>}.</li>
        <li>All <strong>{s.tickets}</strong> ticket{s.tickets === 1 ? "" : "s"} stay valid. Nobody needs new ones.</li>
        <li>Email the new date to <strong>{s.paidOrders + s.giftOrders}</strong> order{s.paidOrders + s.giftOrders === 1 ? "" : "s"}.</li>
        {salesCloseNew && <li>Online sales close {formatShort(salesCloseNew)}{event.status === "closed" && " (sales are closed right now and stay closed)"}.</li>}
        <li>No refunds. Reminders go out again before the new date.</li>
      </ul>
    );

  // ---------- step 2: review ----------
  if (step === 2) {
    return (
      <>
        {header}
        {stepLabel(2)}
        <section className={`${box} mt-2`}>
          <h2 className="font-display text-xl font-black">{action === "refund" ? "This will cancel the show and:" : "This will:"}</h2>
          {summary}
        </section>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link href={`?${params}&step=3`} className={primary}>Continue</Link>
          <Link href={`?${params}&step=1`} className={secondary}>Back</Link>
          {neverMind}
        </div>
      </>
    );
  }

  // ---------- step 3: type the name ----------
  return (
    <>
      {header}
      {stepLabel(3)}
      <section className={`${box} mt-2`}>
        <h2 className="font-display text-xl font-black">{action === "refund" ? "Last check: cancel and refund everyone?" : "Last check: move the show?"}</h2>
        {summary}
        <form action={confirmShowChange.bind(null, id)} className="mt-5 space-y-3">
          <input type="hidden" name="action" value={action} />
          <input type="hidden" name="starts" value={starts} />
          <input type="hidden" name="doors" value={doors} />
          <label className="block">
            <span className="mb-1 block font-semibold">
              Type the show&apos;s name to confirm: <span className="font-mono">{event.name}</span>
            </span>
            <input name="confirm_name" required autoComplete="off" className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button className={primary}>{action === "refund" ? "Cancel the show and refund everyone" : "Move the show"}</button>
            <Link href={`?${params}&step=2`} className={secondary}>Back</Link>
            {neverMind}
          </div>
        </form>
      </section>
    </>
  );
}
