"use client";

import { useActionState } from "react";
import { requestResend, type LostTicketState } from "./actions";

export function LostTicketForm() {
  const [state, action, pending] = useActionState<LostTicketState, FormData>(requestResend, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-semibold">The email you used to buy tickets</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-sm border border-edge bg-white px-3 py-3 text-ink"
        />
      </label>
      {state.done && (
        <p className="rounded-sm border border-link bg-white p-3" role="status">✉️ {state.done}</p>
      )}
      {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}
      <button
        disabled={pending}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Sending…" : "Re-send my tickets"}
      </button>
    </form>
  );
}
