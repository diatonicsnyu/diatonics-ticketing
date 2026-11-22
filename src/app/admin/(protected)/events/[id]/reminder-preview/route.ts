import { requireAdmin } from "@/lib/auth";
import { previewReminder } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/** Shows the reminder email the first buyer would get (admins only). */
export async function GET(_request: Request, ctx: RouteContext<"/admin/events/[id]/reminder-preview">) {
  await requireAdmin();
  const { id } = await ctx.params;
  const html = await previewReminder(id).catch(() => null);
  if (!html) return new Response("No preview yet: nobody has tickets for this show.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
