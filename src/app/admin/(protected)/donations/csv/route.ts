import { requireAdmin } from "@/lib/auth";
import { donationsCsv, loadDonations } from "@/lib/donations";
import { csvResponse } from "@/lib/csv";
import { todayNy } from "@/lib/time";

export const dynamic = "force-dynamic";

/** CSV of every donation. Admins only. */
export async function GET() {
  await requireAdmin(); // not logged in -> sent to /admin/login
  const result = await loadDonations();
  if (result.status !== "ok") return new Response("Donations aren't available yet.", { status: 503 });
  return csvResponse(donationsCsv(result.rows), `diatonics-donations-${todayNy()}.csv`);
}
