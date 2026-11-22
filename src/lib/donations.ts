import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo, DEMO_SUPPORTERS } from "@/lib/demo";
import { csvMoney, csvText, csvWhen } from "@/lib/csv";

/*
 * Donations (SPEC D9–D12, §3.3, step 7). Two kinds, both counted:
 *  - from the Donate page: an order with kind = 'donation' (no event, no tickets)
 *  - the add-on at ticket checkout: donation_cents on a ticket order
 * Only PAID orders count. The group absorbs Stripe's fee (D11).
 */

export type DonationRow = {
  orderNo: string;
  paidAt: string;
  firstName: string;
  lastName: string;
  email: string;
  amountCents: number;
  /** "Donate page", or the show it was added to at ticket checkout. */
  source: string;
  standalone: boolean;
  /** Opt-in name to thank (D12), or "". */
  supporterName: string;
  /** Stripe's fee for the whole payment (a ticket order's fee also covers its tickets). */
  stripeFeeCents: number | null;
};

type Row = {
  order_no: string;
  kind: "tickets" | "donation";
  paid_at: string | null;
  created_at: string;
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_email: string;
  donation_cents: number;
  recognize: boolean;
  display_name: string;
  stripe_fee_cents: number | null;
  events: { name: string } | null;
};

export type DonationsResult = { status: "demo" } | { status: "setup_needed" } | { status: "ok"; rows: DonationRow[] };

/** Every paid donation, newest first. Call requireAdmin() first. */
export async function loadDonations(): Promise<DonationsResult> {
  if (isDemo()) return { status: "demo" };
  const { data, error } = await adminDb()
    .from("orders")
    .select("order_no, kind, paid_at, created_at, buyer_first_name, buyer_last_name, buyer_email, donation_cents, recognize, display_name, stripe_fee_cents, events(name)")
    .eq("status", "paid")
    .gt("donation_cents", 0)
    .order("paid_at", { ascending: false, nullsFirst: false });
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return { status: "setup_needed" };
  if (error) throw error;
  return {
    status: "ok",
    rows: (data as unknown as Row[]).map((o) => ({
      orderNo: o.order_no,
      paidAt: o.paid_at ?? o.created_at,
      firstName: o.buyer_first_name,
      lastName: o.buyer_last_name,
      email: o.buyer_email,
      amountCents: o.donation_cents,
      source: o.kind === "donation" ? "Donate page" : `With tickets: ${o.events?.name ?? "a show"}`,
      standalone: o.kind === "donation",
      supporterName: o.recognize ? o.display_name.trim() : "",
      stripeFeeCents: o.stripe_fee_cents,
    })),
  };
}

/** Opt-in names, each once (first time they gave), newest first. */
export function supporterNames(rows: Pick<DonationRow, "supporterName">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = r.supporterName.toLowerCase();
    if (!r.supporterName || seen.has(key)) continue;
    seen.add(key);
    out.push(r.supporterName);
  }
  return out;
}

/**
 * The public supporters list on the Donate page (D12): ONLY names people
 * chose to show. Never emails or amounts.
 */
export async function listPublicSupporters(): Promise<string[]> {
  if (isDemo()) return DEMO_SUPPORTERS;
  const { data, error } = await adminDb()
    .from("orders")
    .select("display_name")
    .eq("status", "paid")
    .eq("recognize", true)
    .gt("donation_cents", 0)
    .neq("display_name", "")
    .order("paid_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("supporters list failed:", error.message);
    return [];
  }
  return supporterNames((data as { display_name: string }[]).map((d) => ({ supporterName: d.display_name.trim() })));
}

export function donationsCsv(rows: DonationRow[]): string {
  return csvText(
    ["Reference", "Date (NY time)", "First name", "Last name", "Email", "Donation $", "Where", "Thank by name"],
    rows.map((r) => [r.orderNo, csvWhen(r.paidAt), r.firstName, r.lastName, r.email, csvMoney(r.amountCents), r.source, r.supporterName]),
  );
}

/** Donor-recognition list (SPEC §3.8): opted-in names only, with their total. */
export function supportersCsv(rows: DonationRow[]): string {
  const totals = new Map<string, { name: string; cents: number; count: number; last: string }>();
  for (const r of rows) {
    if (!r.supporterName) continue;
    const key = r.supporterName.toLowerCase();
    const t = totals.get(key) ?? { name: r.supporterName, cents: 0, count: 0, last: r.paidAt };
    t.cents += r.amountCents;
    t.count += 1;
    if (r.paidAt > t.last) t.last = r.paidAt;
    totals.set(key, t);
  }
  return csvText(
    ["Name to thank", "Donations", "Total $", "Most recent (NY time)"],
    [...totals.values()].sort((a, b) => b.last.localeCompare(a.last)).map((t) => [t.name, t.count, csvMoney(t.cents), csvWhen(t.last)]),
  );
}
