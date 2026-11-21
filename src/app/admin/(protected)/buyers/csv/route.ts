import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadBuyers, buyersCsv } from "@/lib/buyers";
import { todayNy } from "@/lib/time";

export const dynamic = "force-dynamic";

/** CSV download of the buyer list (SPEC D19). Admins only. */
export async function GET(request: NextRequest) {
  await requireAdmin(); // not logged in -> sent to /admin/login
  const eventId = request.nextUrl.searchParams.get("event") || undefined;
  const result = await loadBuyers({ eventId });
  if (result.status !== "ok") return new Response("The buyer list isn't available yet.", { status: 503 });

  return new Response(buyersCsv(result.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="diatonics-buyers-${todayNy()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
