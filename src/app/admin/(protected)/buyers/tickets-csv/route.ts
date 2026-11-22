import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ticketsCsv } from "@/lib/buyers";
import { todayNy } from "@/lib/time";

export const dynamic = "force-dynamic";

/** CSV download: one row per ticket, with check-in status. Admins only. */
export async function GET(request: NextRequest) {
  await requireAdmin(); // not logged in -> sent to /admin/login
  const eventId = request.nextUrl.searchParams.get("event") || undefined;
  const csv = await ticketsCsv(eventId);
  if (csv == null) return new Response("The ticket list isn't available yet.", { status: 503 });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="diatonics-tickets-${todayNy()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
