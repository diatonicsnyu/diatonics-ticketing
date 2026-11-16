/**
 * DEMO MODE
 *
 * While Supabase isn't set up yet (no NEXT_PUBLIC_SUPABASE_URL in .env.local),
 * the site runs on the sample events below so it can be previewed and shown
 * to the group. Nothing can be saved in demo mode.
 *
 * As soon as the Supabase keys are added, demo mode switches off by itself
 * and the real database is used. Safe to delete this file once the site is
 * live (and remove the isDemo() checks).
 */
import type { AdminEventRow } from "@/lib/events";

export function isDemo(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

// Sample shows, placed a few weeks/months from "now" so they always look upcoming.
function daysFromNowAt(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  // hour is New York time; NY is UTC-5 in winter / UTC-4 in summer. Close
  // enough for sample data (real events use the proper time zone code).
  d.setUTCHours(hour + 5, minute, 0, 0);
  return d.toISOString();
}

function demoEvent(
  n: number,
  fields: Omit<AdminEventRow, "id" | "ticket_types" | "door_pin_hash" | "sales_close_at" | "image_path">,
  types: { name: string; price_cents: number }[],
): AdminEventRow {
  const id = `00000000-0000-4000-8000-00000000000${n}`;
  return {
    ...fields,
    id,
    image_path: null,
    door_pin_hash: null,
    sales_close_at: new Date(new Date(fields.starts_at).getTime() + 30 * 60000).toISOString(),
    ticket_types: types.map((t, i) => ({ id: `${id}-t${i}`, event_id: id, quantity_limit: null, sort_order: i, ...t })),
  };
}

export const DEMO_EVENTS: AdminEventRow[] = [
  demoEvent(
    1,
    {
      name: "Winter Concert",
      slug: "winter-concert-demo",
      description:
        "The Diatonics close out the year with an evening of a cappella favorites, new arrangements, and a few surprises.\n\nGeneral admission. Doors open 30 minutes before the show.",
      venue: "St. Mark's Church in-the-Bowery, 131 E 10th St, New York, NY",
      starts_at: daysFromNowAt(21, 19),
      doors_at: daysFromNowAt(21, 18, 30),
      capacity: 200,
      door_price_cents: 800,
      status: "on_sale",
    },
    [{ name: "General", price_cents: 500 }],
  ),
  demoEvent(
    2,
    {
      name: "Spring Showcase",
      slug: "spring-showcase-demo",
      description: "Our spring set, featuring this semester's new members.",
      venue: "The Cell Theatre, 338 W 23rd St, New York, NY",
      starts_at: daysFromNowAt(120, 19, 30),
      doors_at: null,
      capacity: null,
      door_price_cents: 800,
      status: "on_sale",
    },
    [{ name: "General", price_cents: 500 }],
  ),
  demoEvent(
    3,
    {
      name: "Secret Pop-Up (draft)",
      slug: "secret-pop-up-demo",
      description: "Drafts never appear on the public site.",
      venue: "TBD",
      starts_at: daysFromNowAt(60, 20),
      doors_at: null,
      capacity: null,
      door_price_cents: null,
      status: "draft",
    },
    [{ name: "General", price_cents: 500 }],
  ),
];
