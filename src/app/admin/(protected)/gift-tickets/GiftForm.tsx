"use client";

import { useActionState, useState } from "react";
import type { GiftFormState } from "./actions";
import { MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { btnPrimary } from "@/lib/ui";

type Action = (prev: GiftFormState, formData: FormData) => Promise<GiftFormState>;
export type GiftEvent = { id: string; label: string; left: number | null; types: { id: string; name: string }[] };

const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5 text-ink";
const label = "mb-1 block font-semibold";

/** Gift (free) tickets for one person: emailed like a normal order, counted against capacity. */
export function GiftForm({ action, events }: { action: Action; events: GiftEvent[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const event = events.find((e) => e.id === eventId);
  const maxQty = Math.max(1, Math.min(MAX_TICKETS_PER_ORDER, event?.left ?? MAX_TICKETS_PER_ORDER));

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>Show</span>
          <select name="event_id" value={eventId} onChange={(e) => setEventId(e.target.value)} className={input} required>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          {event && (
            <span className="mt-1 block text-sm text-muted">
              {event.left == null ? "No capacity limit." : event.left === 0 ? "This show is full: no tickets left to give." : `${event.left} ticket${event.left === 1 ? "" : "s"} left.`}
            </span>
          )}
        </label>
        <label className="block">
          <span className={label}>Ticket type</span>
          {/* key: reset the choice when the show changes */}
          <select key={eventId} name="ticket_type_id" defaultValue={event?.types[0]?.id} className={input} required>
            {event?.types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>How many</span>
          <select key={`q-${eventId}`} name="quantity" defaultValue="1" className={input}>
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>First name</span>
          <input name="first_name" required maxLength={50} autoComplete="off" className={input} />
        </label>
        <label className="block">
          <span className={label}>Last name</span>
          <input name="last_name" required maxLength={50} autoComplete="off" className={input} />
        </label>
        <label className="block">
          <span className={label}>Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={input} />
          <span className="mt-1 block text-sm text-muted">The tickets get emailed here.</span>
        </label>
        <label className="block">
          <span className={label}>
            Phone <span className="font-normal text-muted">(optional)</span>
          </span>
          <input name="phone" type="tel" maxLength={30} autoComplete="off" className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>
            Note <span className="font-normal text-muted">(optional, only admins see it)</span>
          </span>
          <input name="note" maxLength={200} placeholder="e.g. guest performer, photographer, family" className={input} />
        </label>
      </div>

      {state.error && (
        <p className="rounded-sm border border-burgundy bg-white p-3 text-burgundy" role="alert">{state.error}</p>
      )}

      <button
        disabled={pending || event?.left === 0}
        className={`${btnPrimary} font-display w-full py-3 text-lg sm:w-auto sm:px-8`}
      >
        {pending ? "Sending…" : "Give tickets"}
      </button>
    </form>
  );
}
