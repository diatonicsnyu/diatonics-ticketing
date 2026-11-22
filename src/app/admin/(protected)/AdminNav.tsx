"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Dashboard", match: (p: string) => p === "/admin" || p.startsWith("/admin/events") },
  { href: "/admin/expenses", label: "Expense log", match: (p: string) => p.startsWith("/admin/expenses") },
  { href: "/admin/buyers", label: "Buyers", match: (p: string) => p.startsWith("/admin/buyers") || p.startsWith("/admin/orders") },
  { href: "/admin/gift-tickets", label: "Gift tickets", match: (p: string) => p.startsWith("/admin/gift-tickets") },
  { href: "/admin/donations", label: "Donations", match: (p: string) => p.startsWith("/admin/donations") },
];

/** The admin menu: every item is a button-looking tab; the current page is filled in. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Admin">
      {ITEMS.map((it) => {
        const on = it.match(path);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-sm border px-3.5 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-none ${
              on ? "border-burgundy bg-burgundy text-white" : "border-edge bg-white text-ink hover:border-burgundy"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
