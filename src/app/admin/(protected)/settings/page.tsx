import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/clients";
import { isDemo } from "@/lib/demo";
import { btnSm, eyebrow, panel } from "@/lib/ui";
import { ConfirmSubmit } from "../expenses/ConfirmSubmit";
import { addPerson, resetPin, setActive, setRole } from "./actions";
import { AddPersonForm, PersonControls } from "./PeopleForms";

export const metadata = { title: "Admin · Settings" };
export const dynamic = "force-dynamic";

type Person = { id: string; name: string; role: "eboard" | "volunteer" | "spender"; active: boolean; username: string | null; has_pin: boolean };

async function loadPeople(): Promise<Person[] | "setup_needed"> {
  if (isDemo()) return [];
  const { data, error } = await adminDb().from("eboard_members").select("id, name, role, active, username, pin_hash").order("sort_order").order("name");
  if (error) {
    if (error.code === "42703") return "setup_needed";
    throw error;
  }
  return (data as (Omit<Person, "has_pin"> & { pin_hash: string | null })[]).map(({ pin_hash, ...p }) => ({ ...p, has_pin: !!pin_hash }));
}

/**
 * Settings (SPEC §13): people and their logins. More settings may be added later.
 *   E-board         = admin + door app + expense log
 *   Door volunteers = door app only
 *   Spenders        = expense log only (no login)
 */
export default async function SettingsPage() {
  const me = await requireAdmin();
  const people = await loadPeople();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Settings</h1>
          <p className="mt-1 text-muted">Who&apos;s in the group&apos;s tools, and their logins. Everyone signs in with their own username and PIN.</p>
        </div>
        <Link href="/admin/help#people" className={btnSm}>Help with this page</Link>
      </div>

      {people === "setup_needed" ? (
        <p className={`${panel} mt-6 p-4`}>
          Run <code>supabase/migrations/0013_personal_logins.sql</code> in Supabase first.
        </p>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
          <Group title="E-board" note="Admin, the door app and the expense log." people={people.filter((p) => p.role === "eboard")} me={me.memberId} />
          <div className="space-y-6">
            <Group title="Door volunteers" note="The door app only. They can't see money or emails." people={people.filter((p) => p.role === "volunteer")} me={me.memberId} />
            <Group title="Spenders" note="Club members who spend money for the group. On the expense log only; no login." people={people.filter((p) => p.role === "spender")} me={me.memberId} />
          </div>
          <section className={`${panel} p-5 lg:col-span-2 xl:col-span-1`}>
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

function Group({ title, note, people, me }: { title: string; note: string; people: Person[]; me: string }) {
  const active = people.filter((p) => p.active);
  const removed = people.filter((p) => !p.active);
  return (
    <section className={`${panel} p-5`}>
      <h2 className="font-display text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>
      {active.length === 0 && <p className="mt-4 text-sm text-muted">Nobody yet.</p>}
      <ul className="mt-4 space-y-2">
        {active.map((p) => (
          <li key={p.id} className="rounded-sm border border-line bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {p.name}
                  {p.id === me && <span className="font-normal text-muted"> (you)</span>}
                </p>
                {p.role !== "spender" && (
                  <p className="text-sm text-muted">
                    {p.username ? (
                      <>
                        Username <span className="font-mono text-ink">{p.username}</span>
                        {!p.has_pin && " · no PIN yet"}
                      </>
                    ) : (
                      "No login yet: press New PIN"
                    )}
                  </p>
                )}
              </div>
              {p.id !== me && (
                <form action={setActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value="no" />
                  <ConfirmSubmit message={`Remove ${p.name}? They can't sign in anymore. Their past expense entries stay.`} className={btnSm}>
                    Remove
                  </ConfirmSubmit>
                </form>
              )}
            </div>
            <div className="mt-2">
              <PersonControls
                role={p.role}
                isMe={p.id === me}
                roleAction={setRole.bind(null, p.id)}
                pinAction={p.role === "spender" ? null : resetPin.bind(null, p.id)}
              />
            </div>
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
                <form action={setActive}>
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
