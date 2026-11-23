"use client";

import { useActionState } from "react";
import { doorLogin, doorLoginAsAdmin, type DoorLoginState } from "./actions";

const INPUT = "w-full rounded-sm border border-edge bg-white px-3 py-3 text-lg text-ink";
const BIG_BUTTON =
  "font-display w-full rounded-sm bg-burgundy px-6 py-4 text-lg font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-burgundy-bright hover:shadow-md active:translate-y-0 disabled:opacity-60";

type Ev = { id: string; label: string };

function ShowPicker({ events }: { events: Ev[] }) {
  return events.length === 1 ? (
    <div>
      <input type="hidden" name="event_id" value={events[0].id} />
      <p className="mb-1 font-semibold">Show</p>
      <p className="rounded-sm border border-edge bg-page px-3 py-3 text-lg">{events[0].label}</p>
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
  );
}

/**
 * Door sign-in: your own username + PIN (volunteers and e-board). If you're
 * already logged in to admin, one button: "Scan as Rachel".
 */
export function DoorLogin({ events, adminName }: { events: Ev[]; adminName: string | null }) {
  const [state, action, pending] = useActionState<DoorLoginState, FormData>(doorLogin, {});

  return (
    <div className="space-y-6">
      {adminName && (
        <form action={doorLoginAsAdmin} className="space-y-3 rounded-sm border border-edge bg-page p-4">
          <p className="font-semibold">You&apos;re logged in to admin as {adminName}.</p>
          <ShowPicker events={events} />
          <button className={BIG_BUTTON}>Scan as {adminName.split(" ")[0]}</button>
        </form>
      )}

      <form action={action} className="space-y-4">
        {adminName && <p className="text-center text-sm text-muted">Or sign in as someone else:</p>}
        <ShowPicker events={events} />
        <label className="block">
          <span className="mb-1 block font-semibold">Username</span>
          <input
            name="username"
            required
            maxLength={40}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. rchen"
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">PIN</span>
          <input name="pin" type="password" required inputMode="numeric" pattern="\d{4,8}" maxLength={8} autoComplete="current-password" className={INPUT} />
        </label>
        {state.error && <p className="rounded-sm bg-red-600 p-3 font-semibold text-white" role="alert">{state.error}</p>}
        <button disabled={pending} className={BIG_BUTTON}>
          {pending ? "Checking…" : "Start scanning"}
        </button>
      </form>
    </div>
  );
}
