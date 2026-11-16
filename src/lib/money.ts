/**
 * All money is stored and calculated in CENTS (whole numbers) to avoid
 * rounding errors. Only convert to dollars for display.
 */

/** Flat service fee per ticket, paid by the buyer (spec D3). */
export const SERVICE_FEE_CENTS = 50;

/** 550 -> "$5.50" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** What the buyer actually pays per ticket: face price + service fee. */
export function allInCents(priceCents: number): number {
  return priceCents + SERVICE_FEE_CENTS;
}

/** "$5.50 (includes $0.50 service fee)" - required all-in display (spec D4). */
export function allInLabel(priceCents: number): string {
  return `${formatCents(allInCents(priceCents))} (includes ${formatCents(SERVICE_FEE_CENTS)} service fee)`;
}

/** "5" or "5.5" typed in a form -> 500 / 550. Returns null if invalid. */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
