import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { HelpGuide, type HelpTopic } from "@/components/HelpGuide";
import { btnSm } from "@/lib/ui";

export const metadata = { title: "Admin · Help" };

/** The e-board's manual for admin (2026-11-22). Plain words: most of e-board isn't technical. */
const TOPICS: HelpTopic[] = [
  {
    id: "login",
    title: "Logging in",
    body: (
      <>
        <p>
          Your <strong>username</strong> is the first letter of your first name + your last name, all lower case (Rachel Chen → <span className="font-mono">rchen</span>).
          Your <strong>PIN</strong> is 6 digits and only yours.
        </p>
        <ul>
          <li>The same username and PIN work for admin and for the door scanner.</li>
          <li>Never share your PIN. Forgot it? Any e-board member can make you a new one in Settings.</li>
          <li>After 5 wrong tries, that device has to wait 15 minutes.</li>
          <li>You stay logged in for 7 days on that device. Press <strong>Log out</strong> on a shared computer.</li>
        </ul>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "The dashboard",
    body: (
      <>
        <p>The four numbers at the top are for all shows together (see Money words below). Under them:</p>
        <ul>
          <li><strong>Left:</strong> every show. Press one to open it.</li>
          <li><strong>Middle:</strong> the current show (the next one coming up): tickets sold, money, check-ins, a chart of tickets sold per day, and reminder emails.</li>
          <li><strong>Right:</strong> the expense log: what e-board is owed and the latest entries.</li>
        </ul>
      </>
    ),
  },
  {
    id: "shows",
    title: "Making and editing a show",
    body: (
      <>
        <p>
          Press <strong>+ New show</strong> on the dashboard. Fill in the name, venue, date and time (New York time), and the ticket types with their prices. The price you
          type is <em>before</em> the $0.50 fee; buyers see it with the fee included.
        </p>
        <ul>
          <li><strong>Capacity</strong>: how many tickets can be sold online in total. Leave it blank for no limit.</li>
          <li><strong>Sales close</strong>: minutes after the show starts that online sales stop (30 by default).</li>
          <li><strong>Door price</strong>: only shown on the page (&ldquo;At the door $8, Venmo or cash&rdquo;). The site doesn&apos;t sell door tickets.</li>
          <li>
            <strong>Status</strong>: <em>Draft</em> is hidden from the public. <em>On sale</em> is public and buyable. <em>Sales closed</em> is public, but nobody can buy.
          </li>
        </ul>
        <p>
          To change a show later, open it and press the <strong>Edit</strong> tab, then <strong>Save changes</strong> at the bottom. The <strong>Overview</strong> tab
          has all of that show&apos;s numbers.
        </p>
        <p className="rounded-sm border border-burgundy bg-[#fdf3f5] p-3">
          <strong>Moving the date after tickets are sold?</strong> Don&apos;t change it in Edit. Use <strong>Cancel or move this show</strong> (see below) so every buyer
          gets an email.
        </p>
      </>
    ),
  },
  {
    id: "reminders",
    title: "Reminder emails",
    body: (
      <>
        <p>
          <strong>They go out by themselves</strong> the morning of the day before the show, with each buyer&apos;s tickets. You don&apos;t have to do anything.
        </p>
        <p>
          On a show&apos;s Overview you can press <strong>Preview the email</strong> to see one, or <strong>Send now</strong> to send them early. Our email plan allows
          100 emails a day, so with lots of buyers they&apos;re split over two days automatically.
        </p>
      </>
    ),
  },
  {
    id: "door",
    title: "Running the door",
    body: (
      <>
        <p>
          Press <strong>📷 Door scanner</strong> at the top of admin. Since you&apos;re logged in to admin, just pick the show and press <strong>Scan as [your name]</strong>.
          Door volunteers sign in at the same page with their own username and PIN.
        </p>
        <p>
          The door scanner has its own guide (the <strong>?</strong> button inside it, and the page below). Only an admin can undo a check-in (see Buyers and orders).
        </p>
        <Link href="/door/help" className={btnSm}>Open the door guide</Link>
      </>
    ),
  },
  {
    id: "buyers",
    title: "Buyers and orders",
    body: (
      <>
        <p>
          <strong>Buyers</strong> lists every order. Search by name, email or order number (like KM47), pick a show, and sort. <strong>Download CSV</strong> opens in
          Google Sheets or Excel; there&apos;s also a CSV with one row per ticket.
        </p>
        <p>Press an order number to open the order. There you can:</p>
        <ul>
          <li>see every ticket and when (and on whose phone) it was scanned;</li>
          <li>
            <strong>Undo check-in</strong>, if someone was scanned by mistake. Their ticket scans green again;
          </li>
          <li>
            <strong>Send the ticket email</strong>, if it never went out. A buyer who lost their email can also get it again themselves at &ldquo;Lost your ticket?&rdquo; on
            the site.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "gifts",
    title: "Gift tickets",
    body: (
      <>
        <p>Free tickets for guests: performers, photographers, family. Pick the show, the ticket type, how many, and their name and email. They&apos;re emailed like normal tickets.</p>
        <p>Gift tickets use up seats. You can still give them after online sales close, as long as tickets are left.</p>
      </>
    ),
  },
  {
    id: "donations",
    title: "Donations",
    body: (
      <>
        <p>
          <strong>Donations</strong> shows every donation, from the Donate page and from ticket checkout. Donors pay exactly what they pick; the group covers Stripe&apos;s fee.
        </p>
        <p>
          The <strong>supporters list</strong> only has people who checked &ldquo;Thank me by name&rdquo;. Download it with <strong>Supporters CSV</strong>.
        </p>
        <p className="rounded-sm border border-line bg-page p-3">
          Never tell donors a donation is &ldquo;tax-deductible&rdquo;. We&apos;re not a registered nonprofit.
        </p>
      </>
    ),
  },
  {
    id: "expenses",
    title: "The expense log",
    body: (
      <>
        <ul>
          <li>
            <strong>Add expense</strong> (red): someone spent their own money on the group. Pick who spent it, the amount, what it was for, a category, and a note (the
            store, a receipt link, or why). The note is required.
          </li>
          <li>
            <strong>Add reimbursement</strong> (green): money was sent back to someone. Pick who you paid back.
          </li>
          <li>Press a person on the left to see only their entries and what they&apos;re still owed.</li>
          <li>You can edit or delete entries you added. Someone paid back can press <strong>✓ I got it</strong> (optional).</li>
        </ul>
      </>
    ),
  },
  {
    id: "people",
    title: "People and logins (Settings)",
    body: (
      <>
        <ul>
          <li><strong>E-board</strong>: admin, the door scanner and the expense log.</li>
          <li><strong>Door volunteers</strong>: the door scanner only. They can&apos;t see money or emails.</li>
          <li><strong>Spenders</strong>: club members who spend money for the group. They&apos;re on the expense log, with no login.</li>
        </ul>
        <p>
          <strong>Add someone</strong> with their full name. E-board and volunteers get a username and PIN shown <strong>once</strong>: text it to them privately. If
          someone forgets their PIN, press <strong>New PIN</strong> (their old one stops working right away).
        </p>
        <p>
          <strong>Remove</strong> stops someone from signing in right away; their past expense entries stay. You can bring them back later. You can&apos;t remove yourself.
        </p>
      </>
    ),
  },
  {
    id: "cancel",
    title: "Cancelling or moving a show",
    body: (
      <>
        <p>
          Open the show → <strong>Edit</strong> tab → <strong>Cancel or move this show</strong>. It takes 3 steps, and nothing happens until the last one, where you type
          the show&apos;s name. You can back out at any step.
        </p>
        <ul>
          <li>
            <strong>Cancel and refund everyone</strong>: every buyer gets all their money back and an email, and every ticket stops working. Stripe keeps its fees (the
            group pays those). <strong>This can&apos;t be undone.</strong>
          </li>
          <li>
            <strong>Move it to a new date</strong>: tickets keep working, and every buyer is emailed the new date.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "money",
    title: "Money words",
    body: (
      <ul>
        <li><strong>Total revenue</strong>: everything buyers and donors paid (tickets + service fees + donations).</li>
        <li><strong>Net profit</strong>: revenue minus what Stripe keeps.</li>
        <li><strong>Total spent</strong>: everything in the expense log.</li>
        <li><strong>Current balance</strong>: net profit minus total spent. What the group has to spend.</li>
        <li><strong>E-board is owed</strong>: expenses not paid back yet.</li>
      </ul>
    ),
  },
  {
    id: "stuck",
    title: "Stuck?",
    body: (
      <p>
        Ask Rachel Chen, who set up the site. Something look wrong with money? Stripe has the official record of every payment.
      </p>
    ),
  },
];

export default async function AdminHelpPage() {
  await requireAdmin();
  return (
    <>
      <h1 className="font-display text-3xl font-black">Help</h1>
      <p className="mt-1 text-muted">How to use admin. Press a topic.</p>
      <div className="mt-6">
        <HelpGuide topics={TOPICS} />
      </div>
    </>
  );
}
