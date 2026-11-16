"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { sent: false });

  if (state.sent) {
    return (
      <p className="rounded-xl border border-line bg-panel p-5" role="status">
        If that&apos;s the admin email, a login link is on its way. Open it <strong>in this same browser</strong>.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-semibold">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-cream"
        />
      </label>
      {state.error && <p className="text-red-300" role="alert">{state.error}</p>}
      <button
        disabled={pending}
        className="font-display w-full rounded-full bg-sky px-6 py-3 font-bold text-ink hover:bg-sky-dim disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a login link"}
      </button>
    </form>
  );
}
