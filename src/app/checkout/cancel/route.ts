import { NextResponse, type NextRequest } from "next/server";
import { cancelPendingOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Stripe sends buyers here when they click "back" on the payment page.
 * Frees their held tickets right away, then returns them to the event page.
 */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("order") ?? "";
  const slug = await cancelPendingOrder(orderId).catch(() => null);
  return NextResponse.redirect(new URL(slug ? `/events/${slug}?cancelled=1` : "/", request.url));
}
