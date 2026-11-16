/**
 * Order math, shared by the buy form (browser) and the server.
 * Pure functions only: no database, no secrets. All amounts in cents.
 */
import { SERVICE_FEE_CENTS } from "@/lib/money";

export const MAX_TICKETS_PER_ORDER = 10; // spec D5
export const DONATION_PRESETS_CENTS = [500, 1000, 2500]; // spec D10 (standalone Donate page)
/** Add-on at ticket checkout: adds a small $2 option (user's request). No "No thanks" chip; tap again to remove. */
export const ADDON_DONATION_PRESETS_CENTS = [200, ...DONATION_PRESETS_CENTS];
export const MAX_DONATION_CENTS = 100_000; // $1,000 sanity cap for a typo like "5000"

export type PricedLine = {
  ticketTypeId: string;
  name: string;
  quantity: number;
  priceCents: number; // face price, without fee
};

export type PricedOrder = {
  lines: PricedLine[];
  ticketCount: number;
  ticketsSubtotalCents: number;
  serviceFeeCents: number;
  donationCents: number;
  totalCents: number;
};

export function priceOrder(lines: PricedLine[], donationCents: number): PricedOrder {
  const kept = lines.filter((l) => l.quantity > 0);
  const ticketCount = kept.reduce((n, l) => n + l.quantity, 0);
  const ticketsSubtotalCents = kept.reduce((n, l) => n + l.quantity * l.priceCents, 0);
  const serviceFeeCents = ticketCount * SERVICE_FEE_CENTS;
  return {
    lines: kept,
    ticketCount,
    ticketsSubtotalCents,
    serviceFeeCents,
    donationCents,
    totalCents: ticketsSubtotalCents + serviceFeeCents + donationCents,
  };
}

/** Donation picker value -> cents. "" / "none" = 0. Returns null if invalid. */
export function parseDonation(choice: string, custom: string): number | null {
  if (!choice || choice === "none") return 0;
  if (choice !== "custom") {
    const c = Number(choice);
    return ADDON_DONATION_PRESETS_CENTS.includes(c) ? c : null;
  }
  const cleaned = custom.trim().replace(/^\$/, "");
  if (cleaned === "") return 0; // Custom picked but left blank = no donation
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  if (cents === 0) return 0; // custom $0 = no donation (the add-on has no "No thanks" chip)
  if (cents < 100 || cents > MAX_DONATION_CENTS) return null; // otherwise $1 minimum
  return cents;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
