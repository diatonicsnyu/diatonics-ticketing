"use client";

import { useActionState } from "react";
import type { PeopleFormState } from "../actions";
import { btnPrimary } from "@/lib/ui";

type Action = (prev: PeopleFormState, formData: FormData) => Promise<PeopleFormState>;

/** Add a person: full name + e-board or spender. */
export function AddPersonForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Full name</span>
        <input name="name" required maxLength={80} placeholder="First and last name" className="w-full rounded-sm border border-edge bg-white px-3 py-2.5 text-ink" />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">What are they?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-sm border border-edge bg-white p-3 shadow-sm transition hover:border-burgundy has-[:checked]:border-burgundy has-[:checked]:ring-1 has-[:checked]:ring-burgundy">
            <input type="radio" name="role" value="eboard" defaultChecked className="mt-1" />
            <span>
              <span className="block font-semibold">E-board</span>
              <span className="block text-sm text-muted">In the expense log, and can log in to admin with the leadership PIN.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-sm border border-edge bg-white p-3 shadow-sm transition hover:border-burgundy has-[:checked]:border-burgundy has-[:checked]:ring-1 has-[:checked]:ring-burgundy">
            <input type="radio" name="role" value="spender" className="mt-1" />
            <span>
              <span className="block font-semibold">Spender</span>
              <span className="block text-sm text-muted">A club member who spends money for the group. In the expense log only; can&apos;t log in.</span>
            </span>
          </label>
        </div>
      </fieldset>
      {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}
      {state.ok && <p className="rounded-sm border border-[#23864a] bg-[#e9f6ee] p-3 font-semibold" role="status">{state.ok}</p>}
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}
