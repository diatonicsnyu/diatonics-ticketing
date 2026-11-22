import { doorSessionOr401, doorStats } from "@/lib/door";

export const dynamic = "force-dynamic";

/** "142 / 180 checked in" + door-sale counts, polled by the scanner. */
export async function GET() {
  const s = await doorSessionOr401();
  if (s instanceof Response) return s;
  try {
    return Response.json(await doorStats(s));
  } catch (err) {
    console.error("door stats failed:", err);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
