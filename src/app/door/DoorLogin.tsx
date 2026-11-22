"use client";

import { useActionState } from "react";
import { doorLogin, type DoorLoginState } from "./actions";

const INPUT = "w-full rounded-sm border border-line bg-white px-3 py-3 text-lg text-ink";

export function DoorLogin({ events }: { events: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<DoorLoginState, FormData>(doorLogin, {});

  return (
    <form action={action} className="space-y-4">
      {events.length === 1 ? (
        <div>
          <input type="hidden" name="event_id" value={events[0].id} />
          <p className="mb-1 font-semibold">Show</p>
          <p className="rounded-sm border border-line bg-page px-3 py-3 text-lg">{events[0].label}</p>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block font-semibold">Show</span>
          <select name="event_id" required defaultValue={events[0]?.id} className={INPUT}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block font-semibold">Your first name</span>
        <input name="name" required maxLength={30} autoComplete="given-name" className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">Door PIN</span>
        <input name="pin" type="password" required inputMode="numeric" pattern="\d{4,8}" maxLength={8} autoComplete="off" className={INPUT} />
      </label>
      {state.error && <p className="rounded-sm bg-red-600 p-3 font-semibold text-white" role="alert">{state.error}</p>}
      <button
        disabled={pending}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-4 text-lg font-bold text-white hover:bg-burgundy-bright disabled:opacity-60"
      >
        {pending ? "Checking…" : "Start scanning"}
      </button>
    </form>
  );
}
