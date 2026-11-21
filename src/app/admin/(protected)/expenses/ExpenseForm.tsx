"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { EntryFormState } from "./actions";
import { EXPENSE_TONE, REIMBURSE_TONE } from "@/lib/ledger-style";

type Action = (prev: EntryFormState, formData: FormData) => Promise<EntryFormState>;
type Member = { id: string; name: string };

const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5 text-ink";
const label = "mb-1 block font-semibold";

/**
 * Venmo-style "add an entry": tap Expense or Reimbursement, then fill in the
 * amount and what it was for. The name comes from the login (no name box).
 */
export function AddEntry({
  action,
  myName,
  members,
  categories,
}: {
  action: Action;
  myName: string;
  members: Member[];
  categories: readonly string[];
}) {
  const [kind, setKind] = useState<"expense" | "reimbursement" | null>(null);
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [justSaved, setJustSaved] = useState(false);

  // After a successful save: clear and close the form, show "Added".
  useEffect(() => {
    if (!state.savedAt) return;
    formRef.current?.reset();
    setKind(null);
    setJustSaved(true);
  }, [state.savedAt]);

  function pick(k: "expense" | "reimbursement") {
    setKind(kind === k ? null : k);
    setJustSaved(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => pick("expense")}
          aria-pressed={kind === "expense"}
          className={`rounded-sm border-2 p-4 text-left ${EXPENSE_TONE} ${kind === "expense" ? "border-[#c23a55]" : ""}`}
        >
          <span className="font-display block text-xl font-bold">Expense</span>
          <span className="block text-sm">I spent my own money on the group</span>
        </button>
        <button
          type="button"
          onClick={() => pick("reimbursement")}
          aria-pressed={kind === "reimbursement"}
          className={`rounded-sm border-2 p-4 text-left ${REIMBURSE_TONE} ${kind === "reimbursement" ? "border-[#2f8a4f]" : ""}`}
        >
          <span className="font-display block text-xl font-bold">Reimbursement</span>
          <span className="block text-sm">I sent money back to someone</span>
        </button>
      </div>

      {justSaved && !kind && (
        <p className="rounded-sm border border-link bg-white p-3" role="status">Added to the log.</p>
      )}

      {kind && (
        <form
          ref={formRef}
          className={`space-y-4 rounded-sm border p-5 ${kind === "expense" ? EXPENSE_TONE : REIMBURSE_TONE}`}
          onSubmit={(e) => {
            e.preventDefault(); // keeps what you typed if there's an error
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <input type="hidden" name="kind" value={kind} />
          <div className="grid gap-4 text-ink sm:grid-cols-2">
            {kind === "expense" ? (
              <p className="sm:col-span-2">
                Logged as <strong>{myName}</strong>
              </p>
            ) : (
              <label className="block sm:col-span-2">
                <span className={label}>Who did you pay back?</span>
                <select name="member_id" required defaultValue="" className={input}>
                  <option value="" disabled>Choose…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-sm text-muted">Sent by {myName}</span>
              </label>
            )}
            <label className="block">
              <span className={label}>Amount ($)</span>
              <input name="amount" inputMode="decimal" required className={input} placeholder="20" />
            </label>
            {kind === "expense" && (
              <label className="block">
                <span className={label}>Category</span>
                <select name="category" required defaultValue={categories[0]} className={input}>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className={label}>{kind === "expense" ? "What was it for?" : "What was it for? (optional)"}</span>
              <input name="description" required={kind === "expense"} className={input} placeholder="e.g. posters" />
            </label>
            <label className="block sm:col-span-2">
              <span className={label}>Note (optional)</span>
              <input
                name="note"
                className={input}
                defaultValue={kind === "reimbursement" ? "from ticket sale funds" : ""}
                placeholder={kind === "expense" ? "Receipt link, store…" : ""}
              />
            </label>
          </div>

          {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              disabled={pending}
              className="font-display rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60"
            >
              {pending ? "Saving…" : kind === "expense" ? "Add expense" : "Add reimbursement"}
            </button>
            <button type="button" onClick={() => setKind(null)} className="rounded-sm border border-line bg-white px-4 py-3 text-ink">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** "Edit" for your own entries: opens a small form under the entry. */
export function EditEntry({
  action,
  kind,
  defaults,
  members,
  categories,
}: {
  action: Action;
  kind: "expense" | "reimbursement";
  defaults: { member_id: string; amount: string; description: string; category: string; note: string };
  members: Member[];
  categories: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.savedAt && detailsRef.current) detailsRef.current.open = false;
  }, [state.savedAt]);

  return (
    <details ref={detailsRef} className="text-ink">
      <summary className="cursor-pointer text-sm text-link underline-offset-4 hover:underline">Edit</summary>
      <form
        className="mt-3 grid gap-3 rounded-sm border border-line bg-white p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {kind === "reimbursement" && (
          <label className="block sm:col-span-2">
            <span className={label}>Paid back to</span>
            <select name="member_id" defaultValue={defaults.member_id} className={input}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className={label}>Amount ($)</span>
          <input name="amount" inputMode="decimal" required defaultValue={defaults.amount} className={input} />
        </label>
        {kind === "expense" && (
          <label className="block">
            <span className={label}>Category</span>
            <select name="category" defaultValue={defaults.category || categories[0]} className={input}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className={label}>What was it for?</span>
          <input name="description" required={kind === "expense"} defaultValue={defaults.description} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Note</span>
          <input name="note" defaultValue={defaults.note} className={input} />
        </label>
        {state.error && <p className="rounded-sm bg-burgundy p-3 text-white sm:col-span-2" role="alert">{state.error}</p>}
        <div className="sm:col-span-2">
          <button disabled={pending} className="rounded-sm bg-burgundy px-5 py-2 font-bold text-white hover:bg-burgundy-bright disabled:opacity-60">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </details>
  );
}
