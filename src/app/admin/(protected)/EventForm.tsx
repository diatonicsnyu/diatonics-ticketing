"use client";

import { startTransition, useActionState, useState } from "react";
import type { EventFormState } from "./actions";

/** Values used to pre-fill the form (strings, exactly as the inputs show them). */
export type EventFormDefaults = {
  name: string;
  venue: string;
  description: string;
  starts_at: string; // "2026-12-05T19:00" (New York time)
  doors_at: string;
  sales_close_minutes: string;
  capacity: string;
  door_price: string;
  status: "draft" | "on_sale" | "closed";
  has_pin: boolean;
  image_url: string | null;
  ticket_types: { id: string; name: string; price: string; limit: string }[];
};

type Props = {
  action: (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
  defaults: EventFormDefaults;
  submitLabel: string;
};

const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5 text-ink";
const label = "mb-1 block font-semibold";
const hint = "mt-1 block text-sm text-muted";

let rowKey = 0; // gives each new ticket-type row a stable React key

export function EventForm({ action, defaults, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [rows, setRows] = useState(() => defaults.ticket_types.map((t) => ({ ...t, key: `r${rowKey++}` })));

  return (
    <form
      className="space-y-8"
      // Submitting this way (instead of action={...}) stops React from clearing
      // everything you typed when the server sends back an error message.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {/* ---------- basics ---------- */}
      <fieldset className="space-y-4 rounded-sm border border-line bg-panel p-5">
        <legend className="font-display px-1 font-bold">Event</legend>
        <label className="block">
          <span className={label}>Name</span>
          <input name="name" required defaultValue={defaults.name} className={input} />
        </label>
        <label className="block">
          <span className={label}>Venue</span>
          <input name="venue" required defaultValue={defaults.venue} className={input} placeholder="e.g. St. Mark's Church, 131 E 10th St" />
          <span className={hint}>Include the street address. It becomes a Google Maps link.</span>
        </label>
        <label className="block">
          <span className={label}>Description</span>
          <textarea name="description" rows={4} defaultValue={defaults.description} className={input} />
        </label>
        <label className="block">
          <span className={label}>Flyer (optional)</span>
          {defaults.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={defaults.image_url} alt="Current event image" className="mb-2 max-h-40 rounded-sm" />
          )}
          <input name="image" type="file" accept="image/*" className="block text-sm" />
          <span className={hint}>JPG or PNG, under 5 MB. A tall (portrait) flyer looks best. Buyers can tap it to see it full size.</span>
        </label>
        {defaults.image_url && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="remove_image" /> Remove current image
          </label>
        )}
      </fieldset>

      {/* ---------- timing ---------- */}
      <fieldset className="space-y-4 rounded-sm border border-line bg-panel p-5">
        <legend className="font-display px-1 font-bold">When (New York time)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Show starts</span>
            <input name="starts_at" type="datetime-local" required defaultValue={defaults.starts_at} className={input} />
          </label>
          <label className="block">
            <span className={label}>Doors open (optional)</span>
            <input name="doors_at" type="datetime-local" defaultValue={defaults.doors_at} className={input} />
          </label>
        </div>
        <label className="block">
          <span className={label}>Online sales close (minutes after show start)</span>
          <input name="sales_close_minutes" type="number" step={1} required defaultValue={defaults.sales_close_minutes} className={`${input} max-w-40`} />
          <span className={hint}>30 = sales stop at 7:30 for a 7:00 show. Use a negative number to close before the show.</span>
        </label>
      </fieldset>

      {/* ---------- tickets ---------- */}
      <fieldset className="space-y-4 rounded-sm border border-line bg-panel p-5">
        <legend className="font-display px-1 font-bold">Tickets</legend>
        <p className="text-sm text-muted">
          Enter the ticket price <strong>without</strong> the $0.50 service fee. Buyers see the all-in price (e.g. $5 → $5.50).
        </p>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-[1fr_6rem] gap-2 rounded-sm border border-line p-3 sm:grid-cols-[1fr_7rem_8rem_auto] sm:items-end">
              <input type="hidden" name="tt_id" value={row.id} />
              <label className="block">
                <span className="mb-1 block text-sm">Type name</span>
                <input name="tt_name" defaultValue={row.name} className={input} placeholder="General" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Price ($)</span>
                <input name="tt_price" inputMode="decimal" defaultValue={row.price} className={input} placeholder="5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Max (optional)</span>
                <input name="tt_limit" inputMode="numeric" defaultValue={row.limit} className={input} placeholder="no limit" />
              </label>
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
                className="rounded-sm border border-line px-3 py-2.5 text-sm hover:border-link disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows([...rows, { id: "", name: "", price: "", limit: "", key: `r${rowKey++}` }])}
          className="rounded-sm border border-link px-4 py-2 text-sm text-link"
        >
          + Add ticket type
        </button>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Capacity (optional)</span>
            <input name="capacity" inputMode="numeric" defaultValue={defaults.capacity} className={input} placeholder="unlimited" />
            <span className={hint}>Total online tickets across all types. Blank = unlimited.</span>
          </label>
          <label className="block">
            <span className={label}>Door price ($, optional)</span>
            <input name="door_price" inputMode="decimal" defaultValue={defaults.door_price} className={input} placeholder="8" />
            <span className={hint}>Display only: &ldquo;At the door $8, Venmo or cash&rdquo;. The site doesn&apos;t handle door sales.</span>
          </label>
        </div>
      </fieldset>

      {/* ---------- door + visibility ---------- */}
      <fieldset className="space-y-4 rounded-sm border border-line bg-panel p-5">
        <legend className="font-display px-1 font-bold">Door & visibility</legend>
        <label className="block">
          <span className={label}>Door PIN for volunteers</span>
          <input
            name="door_pin"
            inputMode="numeric"
            pattern="\d{4,8}"
            autoComplete="off"
            className={`${input} max-w-40`}
            placeholder={defaults.has_pin ? "•••• (set)" : "4–8 digits"}
          />
          <span className={hint}>
            {defaults.has_pin ? "A PIN is set. Leave blank to keep it, or type a new one to change it." : "Not set yet. Needed before the door app (Step 4)."}
          </span>
        </label>
        <label className="block">
          <span className={label}>Status</span>
          <select name="status" defaultValue={defaults.status} className={`${input} max-w-xs`}>
            <option value="draft">Draft (hidden from the public)</option>
            <option value="on_sale">On sale (public)</option>
            <option value="closed">Sales closed (public, no sales)</option>
          </select>
        </label>
      </fieldset>

      {state.error && (
        <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>
      )}

      <button
        disabled={pending}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
