import { SiteChrome } from "@/components/SiteChrome";
import { isDemo, DEMO_SUPPORTERS } from "@/lib/demo";
import { DonateForm } from "./DonateForm";

export const metadata = { title: "Donate" };

// Standalone donation page (spec §3.3, §12). Works even with zero events.
export default function DonatePage() {
  // Step 7 loads real opt-in names from the database.
  const supporters = isDemo() ? DEMO_SUPPORTERS : [];

  return (
    <SiteChrome>
      <h1 className="font-display text-4xl font-black sm:text-5xl">Support the Diatonics</h1>
      <p className="mt-2 text-lg text-muted">Help us keep the music going. 🎶</p>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_16rem]">
        <section className="rounded-sm border border-line bg-white p-5" aria-label="Donation form">
          <DonateForm />
        </section>

        <aside className="space-y-6">
          <section>
            <h2 className="font-display text-xl font-bold">Why donate</h2>
            {/* PLACEHOLDER TEXT: replace with the group's own words (spec §12). */}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Renting rehearsal and performance spaces</li>
              <li>Competition entry fees and travel</li>
              <li>Recording our arrangements</li>
            </ul>
          </section>

          {supporters.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold">Our supporters</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {supporters.map((n) => <li key={n}>💛 {n}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </SiteChrome>
  );
}
