import "server-only";
import { publicDb, adminDb } from "@/lib/supabase/clients";
import { env } from "@/lib/env";
import { isDemo, DEMO_EVENTS, DEMO_SOLD } from "@/lib/demo";

// ---------- types (mirror supabase/migrations/0001_events.sql) ----------

export type EventStatus = "draft" | "on_sale" | "closed" | "cancelled";

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  quantity_limit: number | null;
  sort_order: number;
};

export type EventRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  venue: string;
  starts_at: string;
  doors_at: string | null;
  capacity: number | null;
  sales_close_at: string;
  door_price_cents: number | null;
  image_path: string | null;
  status: EventStatus;
  ticket_types: TicketType[];
};

/** Admin-only extra field (never selected by public pages). */
export type AdminEventRow = EventRow & { door_pin_hash: string | null };

// Columns the public pages are allowed to load. door_pin_hash is left out.
const PUBLIC_COLUMNS =
  "id, name, slug, description, venue, starts_at, doors_at, capacity, sales_close_at, door_price_cents, image_path, status, ticket_types(id, event_id, name, price_cents, quantity_limit, sort_order)";

export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft (hidden)",
  on_sale: "On sale",
  closed: "Sales closed",
  cancelled: "Cancelled",
};

function sortTypes<T extends { ticket_types: TicketType[] }>(e: T): T {
  e.ticket_types.sort((a, b) => a.sort_order - b.sort_order);
  return e;
}

// Demo copies never include the door PIN hash (matches what public pages get).
const demoPublic = (e: AdminEventRow): EventRow => { const { door_pin_hash: _omit, ...rest } = e; void _omit; return rest; };

// ---------- public queries (RLS hides drafts automatically) ----------

/** Events for the home page: published, and not more than 6 hours in the past. */
export async function listUpcomingEvents(): Promise<EventRow[]> {
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
  if (isDemo()) return DEMO_EVENTS.filter((e) => e.status === "on_sale" || e.status === "closed").map(demoPublic);
  const { data, error } = await publicDb()
    .from("events")
    .select(PUBLIC_COLUMNS)
    .in("status", ["on_sale", "closed"])
    .gte("starts_at", sixHoursAgo)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data as EventRow[]).map(sortTypes);
}

export async function getPublicEventBySlug(slug: string): Promise<EventRow | null> {
  if (isDemo()) {
    const e = DEMO_EVENTS.find((d) => d.slug === slug && d.status !== "draft");
    return e ? demoPublic(e) : null;
  }
  const { data, error } = await publicDb()
    .from("events")
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? sortTypes(data as EventRow) : null;
}

/** True while online sales are open (status on_sale and before the cutoff). */
export function salesOpen(event: Pick<EventRow, "status" | "sales_close_at">, now = new Date()) {
  return event.status === "on_sale" && now < new Date(event.sales_close_at);
}

/** Public URL for an image stored in the event-images bucket. */
export function eventImageUrl(path: string | null): string | null {
  if (!path || isDemo()) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/event-images/${path}`;
}

// ---------- admin queries (call requireAdmin() first!) ----------

export async function listAllEventsForAdmin(): Promise<EventRow[]> {
  if (isDemo()) return [...DEMO_EVENTS].reverse().map(demoPublic);
  const { data, error } = await adminDb()
    .from("events")
    .select(PUBLIC_COLUMNS)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data as EventRow[]).map(sortTypes);
}

export async function getEventForAdmin(id: string): Promise<AdminEventRow | null> {
  if (isDemo()) return DEMO_EVENTS.find((d) => d.id === id) ?? null;
  const { data, error } = await adminDb()
    .from("events")
    .select(`${PUBLIC_COLUMNS}, door_pin_hash`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? sortTypes(data as AdminEventRow) : null;
}

/** Demo mode only: tickets left using the sample "sold" numbers. */
function demoTicketsRemaining(event: Pick<EventRow, "id" | "capacity">): number | null {
  if (event.capacity == null) return null;
  return Math.max(0, event.capacity - (DEMO_SOLD[event.id] ?? 0));
}

/**
 * Tickets still available online, or null if the event has no capacity
 * (unlimited). Counts paid tickets plus tickets held by people who are
 * paying right now (30-min holds). Door sales never count (D31).
 */
export async function getTicketsRemaining(event: Pick<EventRow, "id" | "capacity">): Promise<number | null> {
  if (event.capacity == null) return null;
  if (isDemo()) return demoTicketsRemaining(event);
  const { data, error } = await publicDb().rpc("tickets_left", { p_event_id: event.id });
  if (error) {
    // 0004_orders.sql not run yet: nothing can have sold, so show full capacity
    // instead of breaking the event page.
    if (error.code === "PGRST202" || error.code === "42883") return event.capacity;
    throw error;
  }
  return data as number | null;
}
