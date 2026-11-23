import Link from "next/link";
import { HelpGuide, type HelpTopic } from "@/components/HelpGuide";

export const metadata = { title: "Door guide" };

const chip = "rounded-sm px-2 py-0.5 font-bold";

/** The door volunteers' manual (2026-11-22). Short sentences: it's read on a phone, often right before doors open. */
const TOPICS: HelpTopic[] = [
  {
    id: "before",
    title: "Before doors open",
    body: (
      <ol>
        <li>Charge your phone. Bring a charger if you can.</li>
        <li>
          Open <strong>/door</strong> on this site. Add it to your home screen (iPhone: Share → Add to Home Screen) so it opens like an app.
        </li>
        <li>Sign in with your <strong>username</strong> (like <span className="font-mono">rchen</span>) and <strong>PIN</strong>, and pick the show.</li>
        <li>Allow the camera when your phone asks.</li>
        <li>
          <strong>While you still have signal</strong>, wait until the top says <strong>&ldquo;Ready offline: … tickets loaded&rdquo;</strong>. Now it keeps working
          even if the signal drops.
        </li>
      </ol>
    ),
  },
  {
    id: "scanning",
    title: "Scanning tickets",
    body: (
      <>
        <p>Hold each ticket&apos;s QR code up to the camera. No buttons needed. The whole screen changes color:</p>
        <ul>
          <li>
            <span className={`${chip} bg-green-600 text-white`}>GREEN ✓</span> Good ticket. Let them in.
          </li>
          <li>
            <span className={`${chip} bg-yellow-400`}>YELLOW !</span> Already used. It shows when and who scanned it. If it&apos;s the same person coming back in, let them
            in. If not, send them to the group leader.
          </li>
          <li>
            <span className={`${chip} bg-red-600 text-white`}>RED ✕</span> Not a ticket for this show (fake, cancelled, or for another show). Ask to see their ticket
            email, or send them to the group leader.
          </li>
          <li>
            <span className={`${chip} border border-edge bg-white`}>WHITE ⚠</span> &ldquo;Not found offline&rdquo;: they probably bought their ticket just now. Check
            their ticket email, or scan again once there&apos;s signal.
          </li>
        </ul>
        <p>The screen goes back to the camera by itself after a moment. Tap it to go back sooner.</p>
      </>
    ),
  },
  {
    id: "lookup",
    title: "No QR code? (Manual lookup)",
    body: (
      <>
        <p>
          Phone dead, or the code won&apos;t scan? Tap <strong>Manual lookup</strong> and search their name, email, order number (like KM47) or ticket code (like
          DIA-7K3F-Q9). Tap their ticket to check them in.
        </p>
        <p>
          <strong>See history</strong> shows every scan on your phone, newest first.
        </p>
      </>
    ),
  },
  {
    id: "door-sales",
    title: "People paying at the door",
    body: (
      <>
        <p>
          The site doesn&apos;t take door payments. Take Venmo or cash the way the group tells you. Then tap <strong>+</strong> under <strong>Door sales</strong> once per
          person, so they count in attendance. Tapped by mistake? Tap <strong>−</strong>.
        </p>
      </>
    ),
  },
  {
    id: "offline",
    title: "No signal (Offline)",
    body: (
      <ul>
        <li>
          If the top says <strong>Offline</strong>, keep scanning. It still works, using the guest list on your phone.
        </li>
        <li>
          Check-ins wait on your phone (&ldquo;3 waiting to sync&rdquo;) and are sent once there&apos;s signal again. <strong>Don&apos;t log out</strong> while any are
          waiting.
        </li>
        <li>If two phones are both offline, the same ticket could get in once on each. The app tells you afterwards (&ldquo;let in twice&rdquo;). Try to keep at least one phone online.</li>
      </ul>
    ),
  },
  {
    id: "problems",
    title: "Problems",
    body: (
      <ul>
        <li>
          <strong>Camera is black?</strong> Press <strong>Try again</strong>. If that doesn&apos;t work, allow the camera for this site in your phone&apos;s settings and
          reopen the app.
        </li>
        <li>
          <strong>Signed out?</strong> Sign in again with your username and PIN (you need signal for that).
        </li>
        <li>
          <strong>Scanned someone by mistake?</strong> Only an e-board member can undo a check-in, from admin. Tell the group leader.
        </li>
        <li>
          <strong>Forgot your PIN?</strong> Ask any e-board member for a new one.
        </li>
      </ul>
    ),
  },
  {
    id: "rules",
    title: "Rules",
    body: (
      <ul>
        <li>Each ticket lets one person in, once. The first scan wins: a screenshot or forwarded copy of a used ticket shows yellow.</li>
        <li>Seating is general admission: first come, first served.</li>
        <li>Don&apos;t share your PIN, and log out when your shift ends (after everything has synced).</li>
      </ul>
    ),
  },
];

export default function DoorHelpPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black">Door guide</h1>
        <Link href="/door" className="rounded-sm border border-edge bg-white px-4 py-2.5 font-semibold shadow-sm transition hover:border-burgundy">
          ← Back to the door app
        </Link>
      </div>
      <p className="mt-1 text-muted">Everything a door volunteer needs. Read it once before the show.</p>
      <div className="mt-6">
        <HelpGuide topics={TOPICS} />
      </div>
    </main>
  );
}
