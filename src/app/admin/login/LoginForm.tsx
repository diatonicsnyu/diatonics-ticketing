"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const INPUT = "w-full rounded-sm border border-line bg-white px-3 py-3 text-ink";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-semibold">Your name</span>
        <input name="name" type="text" required autoComplete="name" className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">PIN</span>
        <input
          name="pin"
          type="password"
          required
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={8}
          className={INPUT}
        />
      </label>
      {state.error && <p className="text-red-700" role="alert">{state.error}</p>}
      <button
        disabled={pending}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
