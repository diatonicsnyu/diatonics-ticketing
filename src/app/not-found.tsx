import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <SiteChrome>
      <h1 className="font-display text-3xl font-black">Not found</h1>
      <p className="mt-4 text-cream-dim">We couldn&apos;t find that page.</p>
      <Link href="/" className="mt-6 inline-block text-sky underline underline-offset-4">
        Back to upcoming shows
      </Link>
    </SiteChrome>
  );
}
