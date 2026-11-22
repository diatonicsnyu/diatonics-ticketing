import { SiteChrome } from "@/components/SiteChrome";
import { listPublicSupporters } from "@/lib/donations";
import { DonateForm } from "./DonateForm";

export const metadata = { title: "Donate" };
// The supporters list changes as people donate.
export const dynamic = "force-dynamic";

/** What donations pay for. Keep this list true: remove anything the group doesn't actually spend on. */
const FUNDING_NEEDS = [
  "Performance uniforms",
  "Venue rentals for our concerts",
  "Rehearsal space",
  "Microphones, cables and sound equipment",
  "Competition registration fees",
  "Travel to competitions and performances",
  "Recording and mixing our arrangements",
  "Sheet music and arrangement licensing",
  "Posters, flyers and printing",
  "Supplies for every event we host",
];

// Standalone donation page (spec §3.3, §12). Works even with zero events.
export default async function DonatePage() {
  // Only names people chose to show (D12). Never amounts or emails.
  const supporters = await listPublicSupporters();

  return (
    <SiteChrome>
      <h1 className="font-display text-4xl font-black sm:text-5xl">Support the Diatonics</h1>
      <p className="mt-2 text-lg text-muted">Help us keep the music going. 🎶</p>

      {/* Why donate: centered and prominent (spec §12). Never say "tax-deductible". */}
      <section className="mx-auto mt-8 max-w-5xl text-center" aria-labelledby="why-donate">
        <h2 id="why-donate" className="font-display text-3xl font-black sm:text-4xl">Why donate</h2>
        <p className="mx-auto mt-3 max-w-4xl text-lg leading-relaxed">
          The Diatonics are an independent a cappella group. We are not a recognized NYU Steinhardt
          student organization, so we receive no university funding of any kind. Every one of us is here
          purely for the love of the music, and everything it takes to put on a show is paid for by
          the group and its members. Every dollar goes straight back into the music.
        </p>
        <p className="mt-5 text-sm font-bold uppercase tracking-wider text-muted">Your donation helps cover</p>
        <ul className="mt-2 flex flex-wrap justify-center gap-2">
          {FUNDING_NEEDS.map((item) => (
            <li key={item} className="rounded-sm border border-edge bg-white px-3 py-1.5">{item}</li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-[1fr_16rem]">
        <section className="rounded-sm border border-edge bg-white p-5" aria-label="Donation form">
          <DonateForm />
        </section>

        <aside className="space-y-6">
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
