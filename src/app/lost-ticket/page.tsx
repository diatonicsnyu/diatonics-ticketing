import { SiteChrome } from "@/components/SiteChrome";

export const metadata = { title: "Lost your ticket?" };

// Placeholder. The real re-send form is built in Step 3.
export default function LostTicketPage() {
  return (
    <SiteChrome>
      <h1 className="font-display text-4xl font-black">Lost your ticket?</h1>
      <p className="mt-4 text-muted">Self-service ticket re-sending is coming soon.</p>
    </SiteChrome>
  );
}
