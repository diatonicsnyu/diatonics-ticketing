import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadLedger, type EboardMember } from "@/lib/expenses";
import { btnSm, eyebrow, panel } from "@/lib/ui";
import { addPerson, setPersonActive, setPersonRole } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { AddPersonForm } from "./AddPersonForm";

export const metadata = { title: "Admin · Expense settings" };
export const dynamic = "force-dynamic";

/**
 * Expense log settings (SPEC §13): who's on the list. E-board can log in to
 * admin; spenders are in the log only. More settings may come later.
 */
export default async function ExpenseSettingsPage() {
  const me = await requireAdmin();
  const data = await loadLedger();

  return (
    <>
      <Link href="/admin/expenses" className={btnSm}>← Expense log</Link>
      <h1 className="font-display mt-3 text-3xl font-black">Expense log settings</h1>

      {data.status !== "ok" ? (
        <p className={`${panel} mt-6 p-4`}>Settings work once the expense log is set up.</p>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
          <PeopleList
            title="E-board"
            note="On the expense log, and can log in to admin."
            people={data.members.filter((m) => m.role === "eboard")}
            me={me.memberId}
          />
          <PeopleList
            title="Spenders"
            note="Club members who spend money for the group. On the expense log only; they can't log in."
            people={data.members.filter((m) => m.role === "spender")}
            me={me.memberId}
          />
          <section className={`${panel} p-5`}>
            <h2 className="font-display text-xl font-black">Add someone</h2>
            <div className="mt-3">
              <AddPersonForm action={addPerson} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PeopleList({ title, note, people, me }: { title: string; note: string; people: EboardMember[]; me: string }) {
  const active = people.filter((p) => p.active);
  const removed = people.filter((p) => !p.active);
  return (
    <section className={`${panel} p-5`}>
      <h2 className="font-display text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>
      {active.length === 0 && <p className="mt-4 text-sm text-muted">Nobody yet.</p>}
      <ul className="mt-4 space-y-2">
        {active.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-white p-3">
            <span className="font-semibold">
              {p.name}
              {p.id === me && <span className="font-normal text-muted"> (you)</span>}
            </span>
            {p.id !== me && (
              <span className="flex flex-wrap gap-2">
                <form action={setPersonRole}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="role" value={p.role === "eboard" ? "spender" : "eboard"} />
                  <ConfirmSubmit
                    message={p.role === "eboard" ? `Make ${p.name} a spender? They won't be able to log in to admin anymore.` : `Make ${p.name} e-board? They'll be able to log in to admin with the leadership PIN.`}
                    className={btnSm}
                  >
                    {p.role === "eboard" ? "Make spender" : "Make e-board"}
                  </ConfirmSubmit>
                </form>
                <form action={setPersonActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value="no" />
                  <ConfirmSubmit message={`Remove ${p.name}? Their past entries stay in the log.`} className={btnSm}>
                    Remove
                  </ConfirmSubmit>
                </form>
              </span>
            )}
          </li>
        ))}
      </ul>
      {removed.length > 0 && (
        <>
          <p className={`${eyebrow} mt-5`}>Removed</p>
          <ul className="mt-2 space-y-2">
            {removed.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-sm border border-line bg-page/60 p-3">
                <span className="text-muted">{p.name}</span>
                <form action={setPersonActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value="yes" />
                  <button className={btnSm}>Bring back</button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
