import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { decodeDemoOrder } from "@/lib/demo-order";
import { allInCents, formatCents, SERVICE_FEE_CENTS } from "@/lib/money";

export const metadata = { title: "Demo checkout", robots: { index: false } };

/**
 * DEMO ONLY: stands in for Stripe's hosted checkout page.
 * Deliberately NOT styled like Stripe, and the card fields are read-only
 * placeholders: nothing typed here goes anywhere. In the real site
 * (Step 2) the buyer is sent to Stripe's own secure page instead.
 */
export default async function DemoCheckoutPage(props: PageProps<"/demo/checkout">) {
  if (!isDemo()) notFound();
  const { o } = await props.searchParams;
  const order = decodeDemoOrder(o);
  if (!order) notFound();

  const next = order.kind === "tickets" ? `/demo/confirmation?o=${o}` : `/demo/thanks?o=${o}`;
  const back = order.kind === "tickets" && order.event ? `/events/${order.event.slug}` : "/donate";
  const field = "w-full rounded-sm border border-line bg-gray-50 px-3 py-2.5 text-muted";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <p className="mb-4 rounded-sm border-2 border-dashed border-burgundy bg-white p-3 text-center text-sm font-semibold">
        Demo checkout: no card is charged. On the real site this step is Stripe&apos;s secure checkout page
        (cards, Apple Pay, Google Pay, Cash App Pay).
      </p>

      <div className="rounded-sm border border-line bg-white p-6 shadow-sm">
        <p className="text-sm text-muted">Pay Diatonics</p>
        <p className="text-3xl font-bold">{formatCents(order.totalCents)}</p>

        <ul className="mt-4 space-y-2 border-b border-line pb-4 text-sm">
          {order.lines.map((l) => (
            <li key={l.name} className="flex justify-between gap-3">
              <span>
                {l.name} ticket × {l.quantity}
                <span className="block text-muted">{formatCents(allInCents(l.priceCents))} each, includes {formatCents(SERVICE_FEE_CENTS)} service fee</span>
              </span>
              <span>{formatCents(l.quantity * allInCents(l.priceCents))}</span>
            </li>
          ))}
          {order.donationCents > 0 && (
            <li className="flex justify-between"><span>Donation to the Diatonics</span><span>{formatCents(order.donationCents)}</span></li>
          )}
        </ul>
        {order.kind === "tickets" && <p className="mt-3 text-xs text-muted">No refunds. All sales final.</p>}

        <div className="mt-5 space-y-3" aria-label="Card details (demo, not editable)">
          <p className="text-sm text-muted">Paying as {order.buyer.name} · {order.buyer.email}</p>
          <input className={field} value="4242 4242 4242 4242 (test card)" readOnly tabIndex={-1} aria-label="Card number (demo)" />
          <div className="grid grid-cols-2 gap-3">
            <input className={field} value="12 / 34" readOnly tabIndex={-1} aria-label="Expiry (demo)" />
            <input className={field} value="123" readOnly tabIndex={-1} aria-label="CVC (demo)" />
          </div>
        </div>

        <Link href={next} className="font-display mt-6 block w-full rounded-sm bg-burgundy px-6 py-4 text-center text-lg font-bold text-white hover:bg-burgundy-bright">
          Pay {formatCents(order.totalCents)} (demo)
        </Link>
        <Link href={back} className="mt-3 block text-center text-sm text-link underline underline-offset-4">Cancel and go back</Link>
      </div>
    </main>
  );
}
