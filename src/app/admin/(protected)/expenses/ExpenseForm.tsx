"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ExpenseFormState } from "./actions";

type Props = {
  action: (prev: ExpenseFormState, formData: FormData) => Promise<ExpenseFormState>;
  members: { id: string; name: string }[];
  categories: readonly string[];
  today: string; // "2026-11-21", default for the date field
};

const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5 text-ink";
const label = "mb-1 block font-semibold";

export function ExpenseForm({ action, members, categories, today }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // After a successful save, clear the form for the next expense.
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  return (
    <form
      ref={formRef}
      className="space-y-4 rounded-sm border border-line bg-panel p-5"
      // Same as the event form: keeps what you typed if there's an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Who paid?</span>
          <select name="member_id" required defaultValue="" className={input}>
            <option value="" disabled>Choose…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Date paid</span>
          <input name="spent_on" type="date" required defaultValue={today} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>What was it for?</span>
          <input name="description" required className={input} placeholder="e.g. diatonics.com domain (1 year)" />
        </label>
        <label className="block">
          <span className={label}>Category</span>
          <select name="category" required defaultValue={categories[0]} className={input}>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Amount ($)</span>
          <input name="amount" inputMode="decimal" required className={input} placeholder="10.46" />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Notes (optional)</span>
          <input name="notes" className={input} placeholder="Receipt link, store, how they want to be paid back…" />
        </label>
      </div>

      {state.error && (
        <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>
      )}
      {state.savedAt && !state.error && !pending && (
        <p className="rounded-sm border border-link p-3" role="status">Expense added.</p>
      )}

      <button
        disabled={pending}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Saving…" : "Add expense"}
      </button>
    </form>
  );
}
