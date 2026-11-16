import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { isDemo } from "@/lib/demo";
import { decodeDemoOrder } from "@/lib/demo-order";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Thank you!", robots: { index: false } };

// DEMO donation thank-you + receipt preview (spec §3.3).
// The receipt must NEVER say "tax-deductible": the group isn't a 501(c)(3).
export default async function DemoThanksPage(props: PageProps<"/demo/thanks">) {
  if (!isDemo()) notFound();
  const { o } = await props.searchParams;
  const order = decodeDemoOrder(o);
  if (!order || order.kind !== "donation") notFound();

  return (
    <SiteChrome>
      <div className="text-center">
        <p className="text-5xl" aria-hidden>💛</p>
        <h1 className="font-display mt-2 text-4xl font-black">Thank you!</h1>
        <p className="mt-2 text-lg">Your {formatCents(order.donationCents)} donation is music to our ears. 🎶</p>
        {order.recognize && (
          <p className="mt-2 text-muted">We&apos;ll thank you as <strong className="text-ink">{order.displayName}</strong> on our supporters list.</p>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-md rounded-sm border border-line bg-white p-5 text-sm">
        <p className="font-semibold">Receipt (also emailed to {order.buyer.email})</p>
        <dl className="mt-3 space-y-1">
          <div className="flex justify-between"><dt>Donation to the Diatonics</dt><dd>{formatCents(order.donationCents)}</dd></div>
          <div className="flex justify-between"><dt>Date</dt><dd>{formatDate(order.createdAt)}</dd></div>
          <div className="flex justify-between"><dt>Reference</dt><dd>{order.orderNo}</dd></div>
        </dl>
        <p className="mt-3 text-muted">Thank you for helping the Diatonics keep singing!</p>
      </div>

      <p className="mt-6 text-center">
        <Link href="/" className="text-link underline underline-offset-4">Back to shows</Link>
      </p>
    </SiteChrome>
  );
}
