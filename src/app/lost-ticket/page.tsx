import { SiteChrome } from "@/components/SiteChrome";
import { LostTicketForm } from "./LostTicketForm";

export const metadata = { title: "Lost your ticket?" };

/**
 * Buyers re-send their own tickets (spec §3.5, D22), so door volunteers
 * never have to. Tickets go to the email on file only, never on screen.
 */
export default function LostTicketPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-4xl font-black sm:text-5xl">Lost your ticket?</h1>
        <p className="mt-4 text-lg">
          No problem. Type the email you bought them with and we&apos;ll send your tickets there again.
        </p>
        <div className="mt-6 rounded-sm border border-line bg-white p-5">
          <LostTicketForm />
        </div>
        <p className="mt-4 text-sm text-muted">
          For your privacy, tickets are only ever sent to the email they were bought with. They&apos;re never shown on
          this page.
        </p>
      </div>
    </SiteChrome>
  );
}
