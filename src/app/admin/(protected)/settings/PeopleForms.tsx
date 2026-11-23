"use client";

import { useActionState } from "react";
import type { NewLogin, PeopleState } from "./actions";
import { btnPrimary, btnSm } from "@/lib/ui";

type FormAction = (prev: PeopleState, formData: FormData) => Promise<PeopleState>;
type ButtonAction = (prev: PeopleState) => Promise<PeopleState>;
type Role = "eboard" | "volunteer" | "spender";

const ROLE_INFO: { value: Role; title: string; text: string }[] = [
  { value: "eboard", title: "E-board", text: "Admin, the door app and the expense log." },
  { value: "volunteer", title: "Door volunteer", text: "The door app only. Can't see money or emails." },
  { value: "spender", title: "Spender", text: "A club member who spends money for the group. Expense log only; no login." },
];

/** The new username + PIN, shown once to pass on privately. */
export function LoginReveal({ login }: { login: NewLogin }) {
  return (
    <div className="rounded-sm border-2 border-[#23864a] bg-[#e9f6ee] p-3" role="status">
      <p className="font-semibold">Give this to {login.name} privately (text or in person):</p>
      <p className="mt-1 text-lg">
        Username <strong className="font-mono">{login.username}</strong> · PIN <strong className="font-mono tracking-widest">{login.pin}</strong>
      </p>
      <p className="mt-1 text-sm text-muted">It won&apos;t be shown again. Forgot it later? Press &ldquo;New PIN&rdquo;.</p>
    </div>
  );
}

function Messages({ state }: { state: PeopleState }) {
  return (
    <>
      {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}
      {state.ok && !state.login && <p className="rounded-sm border border-[#23864a] bg-[#e9f6ee] p-3 font-semibold" role="status">{state.ok}</p>}
      {state.login && <LoginReveal login={state.login} />}
    </>
  );
}

export function AddPersonForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Full name</span>
        <input name="name" required maxLength={80} placeholder="First and last name" className="w-full rounded-sm border border-edge bg-white px-3 py-2.5 text-ink" />
        <span className="mt-1 block text-xs text-muted">Their username is made from it: Rachel Chen → rchen.</span>
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">What are they?</legend>
        <div className="space-y-2">
          {ROLE_INFO.map((r, i) => (
            <label
              key={r.value}
              className="flex cursor-pointer items-start gap-2 rounded-sm border border-edge bg-white p-3 shadow-sm transition hover:border-burgundy has-[:checked]:border-burgundy has-[:checked]:ring-1 has-[:checked]:ring-burgundy"
            >
              <input type="radio" name="role" value={r.value} defaultChecked={i === 0} className="mt-1" />
              <span>
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-muted">{r.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Messages state={state} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}

/** One person's buttons: change role, new PIN. (Remove is a plain form beside it.) */
export function PersonControls({
  role,
  isMe,
  roleAction,
  pinAction,
}: {
  role: Role;
  isMe: boolean;
  roleAction: FormAction;
  pinAction: ButtonAction | null;
}) {
  const [roleState, roleFormAction, rolePending] = useActionState(roleAction, {});
  const [pinState, pinFormAction, pinPending] = useActionState(pinAction ?? (async () => ({})), {});
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isMe && (
          <form action={roleFormAction} className="flex items-center gap-2">
            <select name="role" defaultValue={role} aria-label="Role" className="rounded-sm border border-edge bg-white px-2 py-1.5 text-sm">
              {ROLE_INFO.map((r) => (
                <option key={r.value} value={r.value}>{r.title}</option>
              ))}
            </select>
            <button disabled={rolePending} className={btnSm}>Change</button>
          </form>
        )}
        {pinAction && (
          <form action={pinFormAction}>
            <button
              disabled={pinPending}
              className={btnSm}
              onClick={(e) => {
                if (!window.confirm("Make a new PIN? Their old PIN stops working right away.")) e.preventDefault();
              }}
            >
              {pinPending ? "Making…" : "New PIN"}
            </button>
          </form>
        )}
      </div>
      <Messages state={roleState} />
      <Messages state={pinState} />
    </div>
  );
}
