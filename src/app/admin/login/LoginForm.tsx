"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { btnPrimary } from "@/lib/ui";

const INPUT = "w-full rounded-sm border border-edge bg-white px-3 py-3 text-ink";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-semibold">Username</span>
        <input
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. rchen"
          className={INPUT}
        />
        <span className="mt-1 block text-sm text-muted">First letter of your first name + your last name.</span>
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">PIN</span>
        <input name="pin" type="password" required inputMode="numeric" autoComplete="current-password" maxLength={8} className={INPUT} />
      </label>
      {state.error && <p className="rounded-sm bg-burgundy p-3 font-semibold text-white" role="alert">{state.error}</p>}
      <button disabled={pending} className={`${btnPrimary} font-display w-full px-6 py-3`}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
