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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3" aria-label="Diatonics home">
            <Image src={logo} alt="" width={48} height={48} priority />
            <span className="font-display text-lg font-bold">Diatonics</span>
          </Link>
          <DonateButton small />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-3 px-4 py-6 text-sm text-muted">
          <Link href="/lost-ticket" className="underline-offset-4 hover:underline">
            Lost your ticket?
          </Link>
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
      className={`font-display inline-block rounded-sm bg-burgundy font-bold text-white hover:bg-burgundy-bright ${
        small ? "px-4 py-2 text-sm" : "px-6 py-3 text-base"
      }`}
    >
      Donate
    </Link>
  );
}
