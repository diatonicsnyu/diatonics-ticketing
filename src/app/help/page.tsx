import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";
import { HelpGuide, type HelpTopic } from "@/components/HelpGuide";
import { SERVICE_FEE_CENTS, formatCents } from "@/lib/money";
import { MAX_TICKETS_PER_ORDER } from "@/lib/order";

export const metadata = { title: "Help", description: "How buying tickets, getting in at the door and donating work." };

const fee = formatCents(SERVICE_FEE_CENTS);
const btn = "inline-block rounded-sm border border-edge bg-white px-4 py-2 font-semibold shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md";

/** Help for ticket buyers and donors (2026-11-22). Never mention taxes on donations (not a 501(c)(3)). */
const TOPICS: HelpTopic[] = [
  {
    id: "buying",
    title: "Buying tickets",
    body: (
      <>
        <ol>
          <li>On the home page, pick a show and press <strong>Get tickets</strong>.</li>
          <li>Choose how many (up to {MAX_TICKETS_PER_ORDER} per order) and press <strong>Continue</strong>.</li>
          <li>Add a donation if you&apos;d like (optional), then type your name and email. Your phone number is optional.</li>
          <li>Pay on the secure payment page: card, Apple Pay, Google Pay or Cash App.</li>
        </ol>
        <p>
          <strong>The price you see is the price you pay.</strong> It already includes the {fee} service fee per ticket. Nothing is added at the end.
        </p>
        <p>While you&apos;re paying, your tickets are held for 30 minutes. If you leave the payment page, they&apos;re released and you aren&apos;t charged.</p>
        <p>
          Online sales close shortly after the show starts. Some shows also sell tickets at the door (Venmo or cash) for a higher price, shown on the show&apos;s page.
        </p>
      </>
    ),
  },
  {
    id: "your-tickets",
    title: "Getting your tickets",
    body: (
      <>
        <p>
          Right after you pay, you see your tickets on screen, and we email them to you. Each ticket has its own <strong>QR code</strong> and a short code like{" "}
          <span className="font-mono">DIA-7K3F-Q9</span>.
        </p>
        <p>Don&apos;t see the email after a few minutes? Check your spam or promotions folder.</p>
        <p>
          The email has a <strong>View my tickets</strong> button. On that page, tap <strong>Download</strong> on each ticket to save it to your phone, so you have it
          even with no signal.
        </p>
      </>
    ),
  },
  {
    id: "lost",
    title: "Lost your tickets?",
    body: (
      <>
        <p>
          Go to <strong>Lost your ticket?</strong> and type the email you bought with. We&apos;ll send every ticket you have for upcoming shows to that email again.
        </p>
        <p>For privacy, the page looks the same whether or not that email has tickets, and tickets only ever go to the email they were bought with.</p>
        <Link href="/lost-ticket" className={btn}>Get my tickets again</Link>
      </>
    ),
  },
  {
    id: "door",
    title: "At the door",
    body: (
      <ul>
        <li>Open your ticket (the email, or the saved download) and show the QR code. Turn your screen brightness up so it scans fast.</li>
        <li><strong>Each ticket lets one person in, once.</strong> The first time a code is scanned, it&apos;s used.</li>
        <li>
          Coming with friends? You can buy all the tickets in one order and send each friend their own ticket. Don&apos;t send the same ticket to two people: only the
          first one gets in.
        </li>
        <li>Seating is <strong>general admission</strong>: first come, first served. Doors open at the time on the show&apos;s page.</li>
        <li>The venue might not have signal, so open your tickets (or download them) before you get there.</li>
        <li>We&apos;ll email you a reminder with your tickets before the show.</li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Refunds, changes and cancelled shows",
    body: (
      <>
        <p>
          <strong>All sales are final.</strong> We can&apos;t refund tickets if you can&apos;t make it.
        </p>
        <p>
          <strong>If we cancel a show,</strong> everyone is refunded in full automatically, to the card or account they paid with, and we email you. Refunds take 5–10
          business days to show up.
        </p>
        <p>
          <strong>If we move a show to a new date,</strong> your tickets still work for the new date. We&apos;ll email you the new date and time.
        </p>
      </>
    ),
  },
  {
    id: "donating",
    title: "Donating",
    body: (
      <>
        <p>
          The Diatonics are independent, so we get no university funding. You can support us anytime on the Donate page ($5, $10, $25 or any amount), or add a donation
          when you buy tickets.
        </p>
        <ul>
          <li>You pay exactly the amount you pick. We cover the card processing cost.</li>
          <li>You get a receipt by email.</li>
          <li>Check &ldquo;Thank me by name&rdquo; if you&apos;d like your name on our supporters list. It&apos;s off unless you choose it, and we never show amounts.</li>
        </ul>
        <Link href="/donate" className={btn}>Donate</Link>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Your payment and privacy",
    body: (
      <>
        <p>
          Payments are handled by Stripe, a secure payment company. <strong>We never see or store your card details.</strong>
        </p>
        <p>We keep your name, email and (if you give it) phone number so we can send your tickets and contact you about the show.</p>
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <SiteChrome>
      <h1 className="font-display text-4xl font-black">Help</h1>
      <p className="mt-2 max-w-2xl text-lg text-muted">How buying tickets, getting in at the door and donating work.</p>
      <div className="mt-6">
        <HelpGuide topics={TOPICS} />
      </div>
    </SiteChrome>
  );
}
