import "server-only";

/**
 * DEMO ONLY. In demo mode there is no database or Stripe, so a "pretend
 * order" travels between the demo pages inside the URL (?o=...).
 * Steps 2/3/7 replace this with real orders saved in Supabase.
 */
export type DemoOrder = {
  kind: "tickets" | "donation";
  orderNo: string;
  createdAt: string;
  event?: { name: string; slug: string; startsAt: string; doorsAt: string | null; venue: string };
  lines: { name: string; quantity: number; priceCents: number }[];
  serviceFeeCents: number;
  donationCents: number;
  totalCents: number;
  buyer: { name: string; email: string; phone: string };
  recognize: boolean;
  displayName: string;
  tickets: { code: string; typeName: string }[];
};

export function encodeDemoOrder(o: DemoOrder): string {
  return Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
}

export function decodeDemoOrder(s: unknown): DemoOrder | null {
  if (typeof s !== "string" || s.length > 8000) return null;
  try {
    const o = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    return o && (o.kind === "tickets" || o.kind === "donation") ? (o as DemoOrder) : null;
  } catch {
    return null;
  }
}
