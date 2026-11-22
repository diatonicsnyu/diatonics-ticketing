import Image from "next/image";
import Link from "next/link";
import logo from "../../public/logo.png";
import { isDemo } from "@/lib/demo";

/** Header + footer wrapped around every public page. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isDemo() && (
        <p className="bg-sky px-4 py-1.5 text-center text-sm font-semibold text-ink" role="note">
          Preview with sample data, no real payments.{" "}
          <span className="whitespace-nowrap">
            Try:{" "}
            <Link href="/events/winter-concert-demo" className="underline">buy tickets</Link> ·{" "}
            <Link href="/donate" className="underline">donate</Link> ·{" "}
            <Link href="/demo/door" className="underline">door scanner</Link>
          </span>
        </p>
      )}
      <header className="border-b border-edge bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3" aria-label="Diatonics home">
            <Image src={logo} alt="" width={48} height={48} priority />
            <span className="font-display text-xl font-bold">Diatonics</span>
          </Link>
          <DonateButton small />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-edge bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span className="flex flex-wrap gap-2">
            <Link href="/lost-ticket" className="rounded-sm border border-edge bg-white px-3 py-1.5 font-semibold text-ink shadow-sm transition hover:border-burgundy">
              Lost your ticket?
            </Link>
            <Link href="/donate" className="rounded-sm border border-edge bg-white px-3 py-1.5 font-semibold text-ink shadow-sm transition hover:border-burgundy">
              Donate
            </Link>
          </span>
          <span>Diatonics A Cappella · New York City</span>
        </div>
      </footer>
    </>
  );
}

/** Always-visible Donate button (spec D9). Burgundy fill with white text. */
export function DonateButton({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/donate"
      className={`font-display inline-block rounded-sm bg-burgundy font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-burgundy-bright hover:shadow-md ${
        small ? "px-4 py-2 text-sm" : "px-6 py-3 text-base"
      }`}
    >
      Donate
    </Link>
  );
}
