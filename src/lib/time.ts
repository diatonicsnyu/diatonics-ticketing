import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/**
 * All shows are in New York. The database stores times in UTC; these helpers
 * convert to/from New York time so daylight saving is always handled right.
 */
export const TIME_ZONE = "America/New_York";

/** "2026-12-05T19:00" typed in the admin form (NY time) -> UTC ISO string. */
export function nyInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const local = new TZDate(y, mo - 1, d, h, mi, TIME_ZONE);
  return new Date(local.getTime()).toISOString();
}

/** UTC ISO string from the database -> "2026-12-05T19:00" for a form field. */
export function isoToNyInput(iso: string | null): string {
  if (!iso) return "";
  return format(new TZDate(iso, TIME_ZONE), "yyyy-MM-dd'T'HH:mm");
}

/** UTC ISO -> "2026-12-05" in NY time (used in event URLs). */
export function isoToNyDate(iso: string): string {
  return format(new TZDate(iso, TIME_ZONE), "yyyy-MM-dd");
}

/** Today's date in New York, e.g. "2026-11-21" (default for date fields). */
export function todayNy(): string {
  return format(new TZDate(Date.now(), TIME_ZONE), "yyyy-MM-dd");
}

/** "Saturday, December 5, 2026" */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/** "7:00 PM" */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Sat, Dec 5, 7:00 PM" */
export function formatShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Whole minutes from a to b (b - a). */
export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}
