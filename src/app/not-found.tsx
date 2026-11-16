import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <SiteChrome>
      <h1 className="font-display text-4xl font-black">Not found</h1>
      <p className="mt-4 text-muted">We couldn&apos;t find that page.</p>
      <Link href="/" className="mt-6 inline-block text-link underline underline-offset-4">
        Back to upcoming shows
      </Link>
    </SiteChrome>
  );
}
