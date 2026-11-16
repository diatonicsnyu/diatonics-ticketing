import { SiteChrome } from "@/components/SiteChrome";

export const metadata = { title: "Donate" };

// Placeholder. The real donation form is built in Step 7.
export default function DonatePage() {
  return (
    <SiteChrome>
      <h1 className="font-display text-3xl font-black">Donate</h1>
      <p className="mt-4 text-muted">Online donations are coming soon. Thank you for supporting the Diatonics!</p>
    </SiteChrome>
  );
}
