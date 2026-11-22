/*
 * Who gets a reminder today (SPEC §3.6, D21). Pure functions, no database,
 * so the split can be tested with made-up numbers.
 *
 * Resend's free plan sends 100 emails a day. Reminders get at most 80 of
 * them, so ~20 stay free for new orders and re-sends that day.
 *  - If everyone fits in one day's reminder budget: all go 1 day before.
 *  - If not: the earliest half (by purchase time) go 2 days before, the
 *    rest 1 day before. Anyone the budget missed gets it the morning of
 *    the show.
 * [assumed] The spec says "more than 100"; the real limit is the 80-a-day
 * reminder budget, so the split starts above 80.
 */

export const RESEND_DAILY_LIMIT = 100;
/** Most reminder emails in one day. */
export const REMINDER_DAILY_MAX = 80;
/** Always left free for ticket emails and "Lost your ticket?" (reminders and show-change emails stop here). */
export const RESERVE_FOR_ORDERS = 20;

export type ReminderRecipient = {
  email: string; // lower-case
  firstPaidAt: string; // ISO; their earliest order for this show
};

/** Calendar days from today to the show, in New York time (0 = show day). */
export function nyDaysUntil(showIso: string, now: Date): number {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d); // YYYY-MM-DD
  return Math.round((Date.parse(day(new Date(showIso))) - Date.parse(day(now))) / 86_400_000);
}

/** "today" / "tomorrow" / "in 2 days", for the subject line. */
export function whenWord(daysAway: number): string {
  return daysAway <= 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
}

/**
 * Today's batch for one show.
 * @param all       everyone with tickets (including people already reminded)
 * @param reminded  emails already reminded for this show date
 * @param daysAway  nyDaysUntil(show)
 * @param budget    reminder emails still allowed today
 */
export function planReminders(all: ReminderRecipient[], reminded: Set<string>, daysAway: number, budget: number): ReminderRecipient[] {
  if (budget <= 0 || daysAway < 0 || daysAway > 2) return [];
  const sorted = [...all].sort((a, b) => a.firstPaidAt.localeCompare(b.firstPaidAt) || a.email.localeCompare(b.email));
  const pending = sorted.filter((r) => !reminded.has(r.email));

  if (daysAway === 2) {
    if (sorted.length <= REMINDER_DAILY_MAX) return []; // everyone fits tomorrow
    // The earliest half, so tomorrow has room for the rest (and late buyers).
    const earliest = new Set(sorted.slice(0, Math.ceil(sorted.length / 2)).map((r) => r.email));
    return pending.filter((r) => earliest.has(r.email)).slice(0, budget);
  }
  // 1 day before: everyone left. Show day: anyone the budget missed.
  return pending.slice(0, budget);
}
