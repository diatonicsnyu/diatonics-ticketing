import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/SiteChrome";
import { isDemo } from "@/lib/demo";
import { finalizeCheckoutSession, getDonationBySession } from "@/lib/orders";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Thank you!", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where Stripe sends donors after paying (spec §3.3). The link contains
 * Stripe's checkout id, which only the donor has.
 * Never says "tax-deductible": the group isn't a 501(c)(3).
 */
export default async function DonationThanksPage(props: PageProps<"/donate/thanks">) {
  if (isDemo()) notFound(); // the demo version is /demo/thanks
  const { session_id } = await props.searchParams;
  if (typeof session_id !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(session_id)) notFound();

  await finalizeCheckoutSession(session_id).catch((err) => console.error("finalize on thank-you page failed:", err));
  const d = await getDonationBySession(session_id);
  if (!d) notFound();

  if (d.status === "expired") {
    return (
      <SiteChrome>
        <div className="text-center">
          <h1 className="font-display text-4xl font-black">This checkout expired</h1>
          <p className="mt-3 text-muted">You weren&apos;t charged.</p>
          <Link href="/donate" className="mt-6 inline-block text-link underline underline-offset-4">Try again</Link>
        </div>
      </SiteChrome>
    );
  }

  if (d.status !== "paid") {
    return (
      <SiteChrome>
        {/* Reload every 3 seconds until Stripe confirms the payment. */}
        <meta httpEquiv="refresh" content="3" />
        <div className="text-center">
          <p className="text-5xl" aria-hidden>🎶</p>
          <h1 className="font-display mt-2 text-4xl font-black">Confirming your donation…</h1>
          <p className="mt-3 text-muted">This usually takes a few seconds. This page refreshes by itself.</p>
        </div>
      </SiteChrome>
    );
  }

  return (
    <SiteChrome>
      <div className="text-center">
        <p className="text-5xl" aria-hidden>💛</p>
        <h1 className="font-display mt-2 text-4xl font-black sm:text-5xl">Thank you!</h1>
        <p className="mt-2 text-lg">Your {formatCents(d.amountCents)} donation is music to our ears. 🎶</p>
        {d.recognize && d.displayName && (
          <p className="mt-2 text-muted">
            We&apos;ll thank you as <strong className="text-ink">{d.displayName}</strong> on our supporters list.
          </p>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-md rounded-sm border border-line bg-white p-5 text-sm">
        <p className="font-semibold">Receipt (also emailed to {d.email})</p>
        <dl className="mt-3 space-y-1">
          <div className="flex justify-between"><dt>Donation to the Diatonics</dt><dd>{formatCents(d.amountCents)}</dd></div>
          <div className="flex justify-between"><dt>Date</dt><dd>{formatDate(d.paidAt ?? d.createdAt)}</dd></div>
          <div className="flex justify-between"><dt>Reference</dt><dd className="font-mono">{d.orderNo}</dd></div>
        </dl>
        <p className="mt-3 text-muted">It goes straight to our uniforms, venues, mics and everything else that keeps the Diatonics singing.</p>
      </div>

      <p className="mt-6 text-center">
        <Link href="/" className="text-link underline underline-offset-4">See upcoming shows</Link>
      </p>
    </SiteChrome>
  );
}
