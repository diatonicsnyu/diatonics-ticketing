/*
 * Shared button and panel styles (SPEC §13). Everything you can click in
 * admin must LOOK clickable: a border, a fill, a hover lift and a pressed
 * state. No text links as actions (e-board and volunteers aren't technical).
 * Small 4px corners only (no pills).
 * Plain class strings, usable from server and client components.
 */

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm border font-semibold shadow-sm transition " +
  "hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-none disabled:pointer-events-none disabled:opacity-60";

/** Main action: burgundy fill. */
export const btnPrimary = `${base} border-burgundy bg-burgundy px-5 py-2.5 text-white hover:bg-burgundy-bright`;
/** Everything else: white with a gray outline, burgundy outline on hover. */
export const btn = `${base} border-edge bg-white px-4 py-2 text-ink hover:border-burgundy hover:bg-[#f6fafd]`;
/** Small version for rows and toolbars. */
export const btnSm = `${base} border-edge bg-white px-3 py-1.5 text-sm text-ink hover:border-burgundy hover:bg-[#f6fafd]`;
/** Danger (cancel a show, delete). */
export const btnDanger = `${base} border-burgundy bg-white px-4 py-2 text-burgundy hover:bg-[#fdeef1]`;

/** A white box with a visible gray outline. */
export const panel = "rounded-sm border border-edge bg-panel";
/** A whole clickable card (an event, a person): looks and feels like a big button. */
export const cardButton =
  "block rounded-sm border border-edge bg-panel p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md active:translate-y-0 active:shadow-none";

/** Small caps label above a number or a section. */
export const eyebrow = "text-xs font-bold uppercase tracking-wider text-muted";
