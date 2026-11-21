/**
 * Categories for the e-board expense tracker. Shared by the admin form
 * (browser) and the save action (server), so this file must NOT be
 * server-only. To add a category, just add it here.
 */
export const EXPENSE_CATEGORIES = [
  "Website & tech",
  "Venue",
  "Printing & flyers",
  "Supplies",
  "Food & drinks",
  "Travel",
  "Other",
] as const;
