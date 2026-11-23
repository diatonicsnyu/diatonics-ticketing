"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { EntryFormState } from "./actions";
import { EXPENSE_BADGE, EXPENSE_FEED, REIMBURSE_BADGE, REIMBURSE_FEED } from "@/lib/ledger-style";
import { btn, btnPrimary, btnSm } from "@/lib/ui";

type Action = (prev: EntryFormState, formData: FormData) => Promise<EntryFormState>;
type Person = { id: string; name: string; role: "eboard" | "spender" | "volunteer" };

const input = "w-full rounded-sm border border-edge bg-white px-3 py-2.5 text-ink";
const label = "mb-1 block text-sm font-semibold";

/** Pick list with e-board and spenders in separate groups. */
function PersonOptions({ people }: { people: Person[] }) {
  const eboard = people.filter((p) => p.role === "eboard");
  const spenders = people.filter((p) => p.role === "spender");
  return (
    <>
      <optgroup label="E-board">
        {eboard.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
      {spenders.length > 0 && (
        <optgroup label="Spenders">
          {spenders.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
      )}
    </>
  );
}

/**
 * The right panel of the expense log (SPEC §13): two big buttons, then the
 * form for the one you picked.
 */
export function AddEntry({
  action,
  myId,
  people,
  categories,
  start,
}: {
  action: Action;
  myId: string;
  people: Person[];
  categories: readonly string[];
  /** Open with this form showing (from the dashboard's "+ Expense"). */
  start?: "expense" | "reimbursement";
}) {
  const [picked, setPicked] = useState<"expense" | "reimbursement" | null>(start ?? null);
  const [state, formAction, pending] = useActionState(action, {});
  // Which save we'd seen when the form was opened. A newer save means "done":
  // the form closes and "Added" shows (no effect needed).
  const [openedAt, setOpenedAt] = useState<number | undefined>(undefined);
  const savedSinceOpen = state.savedAt !== undefined && state.savedAt !== openedAt;
  const kind = savedSinceOpen ? null : picked;

  function pick(k: "expense" | "reimbursement") {
    setOpenedAt(state.savedAt);
    setPicked(kind === k ? null : k);
  }

  const choice = (k: "expense" | "reimbursement", title: string, sub: string) => {
    const on = kind === k;
    const tone = k === "expense" ? EXPENSE_FEED : REIMBURSE_FEED;
    return (
      <button
        type="button"
        onClick={() => pick(k)}
        aria-pressed={on}
        className={`w-full rounded-sm border-2 p-4 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-none ${tone} ${
          on ? (k === "expense" ? "border-[#c62f45]" : "border-[#23864a]") : "border-edge hover:border-burgundy"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-sm text-lg font-black ${k === "expense" ? EXPENSE_BADGE : REIMBURSE_BADGE}`} aria-hidden>
            {k === "expense" ? "−" : "+"}
          </span>
          <span className="font-display text-lg font-bold">{title}</span>
        </span>
        <span className="mt-1 block text-sm">{sub}</span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {choice("expense", "Add expense", "Someone spent their own money on the group")}
      {choice("reimbursement", "Add reimbursement", "Money was sent back to someone")}

      {savedSinceOpen && !kind && (
        <p className="rounded-sm border border-[#23864a] bg-[#e9f6ee] p-3 font-semibold" role="status">Added to the log.</p>
      )}

      {kind && (
        <form
          key={`${kind}-${openedAt ?? 0}`}
          className={`space-y-3 rounded-sm border border-edge p-4 ${kind === "expense" ? EXPENSE_FEED : REIMBURSE_FEED}`}
          onSubmit={(e) => {
            e.preventDefault(); // keeps what you typed if there's an error
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <input type="hidden" name="kind" value={kind} />
          <label className="block">
            <span className={label}>{kind === "expense" ? "Who spent the money?" : "Who did you pay back?"}</span>
            <select name="member_id" required defaultValue={kind === "expense" ? myId : ""} className={input}>
              {kind === "reimbursement" && <option value="" disabled>Choose…</option>}
              <PersonOptions people={people} />
            </select>
          </label>
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
          <label className="block">
            <span className={label}>{kind === "expense" ? "What was it for?" : "What was it for? (optional)"}</span>
            <input name="description" required={kind === "expense"} className={input} placeholder="e.g. posters" />
          </label>
          <label className="block">
            <span className={label}>{kind === "expense" ? "Note (required)" : "Note"}</span>
            <input
              name="note"
              required={kind === "expense"}
              className={input}
              defaultValue={kind === "reimbursement" ? "from ticket sale funds" : ""}
              placeholder={kind === "expense" ? "Store, receipt link, or why it was needed" : ""}
            />
          </label>

          {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}

          <div className="flex flex-wrap gap-2">
            <button disabled={pending} className={btnPrimary}>
              {pending ? "Saving…" : kind === "expense" ? "Add expense" : "Add reimbursement"}
            </button>
            <button type="button" onClick={() => setPicked(null)} className={btn}>
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
  people,
  categories,
}: {
  action: Action;
  kind: "expense" | "reimbursement";
  defaults: { member_id: string; amount: string; description: string; category: string; note: string };
  people: Person[];
  categories: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.savedAt && detailsRef.current) detailsRef.current.open = false;
  }, [state.savedAt]);

  return (
    <details ref={detailsRef} className="group text-ink">
      <summary className={`${btnSm} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">Edit</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <form
        className="mt-3 grid gap-3 rounded-sm border border-edge bg-white p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        <label className="block sm:col-span-2">
          <span className={label}>{kind === "expense" ? "Who spent the money?" : "Paid back to"}</span>
          <select name="member_id" defaultValue={defaults.member_id} className={input}>
            <PersonOptions people={people} />
          </select>
        </label>
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
          <span className={label}>{kind === "expense" ? "Note (required)" : "Note"}</span>
          <input name="note" required={kind === "expense"} defaultValue={defaults.note} className={input} />
        </label>
        {state.error && <p className="rounded-sm bg-burgundy p-3 text-white sm:col-span-2" role="alert">{state.error}</p>}
        <div className="sm:col-span-2">
          <button disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </details>
  );
}
