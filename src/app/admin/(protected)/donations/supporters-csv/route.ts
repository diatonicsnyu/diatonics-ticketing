import { requireAdmin } from "@/lib/auth";
import { loadDonations, supportersCsv } from "@/lib/donations";
import { csvResponse } from "@/lib/csv";
import { todayNy } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Donor-recognition list (SPEC §3.8): opted-in names only. Admins only. */
export async function GET() {
  await requireAdmin();
  const result = await loadDonations();
  if (result.status !== "ok") return new Response("Donations aren't available yet.", { status: 503 });
  return csvResponse(supportersCsv(result.rows), `diatonics-supporters-${todayNy()}.csv`);
}
