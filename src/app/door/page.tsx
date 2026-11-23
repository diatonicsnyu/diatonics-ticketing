import Image from "next/image";
import { notFound } from "next/navigation";
import logo from "../../../public/logo.png";
import { isDemo } from "@/lib/demo";
import Link from "next/link";
import { doorStats, getDoorSession, listDoorEvents } from "@/lib/door";
import { getAdminSession } from "@/lib/auth";
import { formatShort } from "@/lib/time";
import { DoorClient } from "./DoorClient";
import { DoorLogin } from "./DoorLogin";

export const dynamic = "force-dynamic";

/** Door app (spec §3.7): sign in with your own username + PIN, pick the show, then scan. */
export default async function DoorPage() {
  if (isDemo()) notFound(); // the demo scanner is at /demo/door

  const session = await getDoorSession();
  if (session) {
    const stats = await doorStats(session).catch(() => ({ sold: 0, checkedIn: 0, doorSales: 0, doorSalesMine: 0 }));
    return <DoorClient eventId={session.eventId} eventName={session.eventName} deviceName={session.deviceName} initialStats={stats} />;
  }

  const [list, admin] = await Promise.all([listDoorEvents(), getAdminSession().catch(() => null)]);
  const events = list.map((e) => ({ id: e.id, label: `${e.name} · ${formatShort(e.starts_at)}` }));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <div className="text-center">
        <Image src={logo} alt="" width={72} height={72} className="mx-auto" priority />
        <h1 className="font-display mt-3 text-3xl font-black">Door check-in</h1>
        <p className="mt-1 text-muted">For volunteers at the door.</p>
      </div>
      <div className="mt-6 rounded-sm border border-edge bg-white p-5">
        {events.length === 0 ? (
          <p className="text-center">No shows coming up in the next two weeks. The door app opens for a show once it&apos;s on sale.</p>
        ) : (
          <DoorLogin events={events} adminName={admin?.name ?? null} />
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Tip: add this page to your home screen (Share → Add to Home Screen) so it opens like an app.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/door/help" className="rounded-sm border border-edge bg-white px-4 py-2.5 font-semibold shadow-sm transition hover:border-burgundy">
          How the door works
        </Link>
        {admin && (
          <Link href="/admin" className="rounded-sm border border-edge bg-white px-4 py-2.5 font-semibold shadow-sm transition hover:border-burgundy">
            ← Back to admin
          </Link>
        )}
      </div>
    </main>
  );
}
