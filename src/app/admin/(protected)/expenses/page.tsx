import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadLedger, balancesByMember, totalOwed, nameLookup, type EboardMember, type LedgerEntry } from "@/lib/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { formatCents } from "@/lib/money";
import { btn, btnSm, eyebrow, panel } from "@/lib/ui";
import { FeedLine } from "@/components/admin/FeedLine";
import { addEntry, updateEntry, deleteEntry, setReceived } from "./actions";
import { AddEntry, EditEntry } from "./ExpenseForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

export const metadata = { title: "Admin · Expense log" };
export const dynamic = "force-dynamic";

type Person = { id: string; name: string; role: EboardMember["role"] };

/**
 * Expense log (SPEC D33, §13), three panels:
 *  left   = a button per person (click to see only theirs)
 *  middle = the full log, newest on top, like a notification feed
 *  right  = add an expense / reimbursement, and Settings
 */
export default async function ExpenseLogPage(props: PageProps<"/admin/expenses">) {
  const me = await requireAdmin();
  const sp = await props.searchParams;
  const filterId = typeof sp.member === "string" ? sp.member : undefined;
  const start = sp.add === "expense" || sp.add === "reimbursement" ? sp.add : undefined;
  const data = await loadLedger();

  if (data.status !== "ok") {
    return (
      <>
        <h1 className="font-display text-3xl font-black">Expense log</h1>
        {data.status === "demo" ? (
          <p className={`${panel} mt-6 p-4`}>The expense log works once the database is connected.</p>
        ) : (
          <div className={`${panel} mt-6 space-y-2 p-4`}>
            <p className="font-semibold">One-time setup needed</p>
            <p>
              In Supabase, open <strong>SQL Editor → New query</strong>, paste everything from <code>supabase/migrations/0005_ledger.sql</code>, and click{" "}
              <strong>Run</strong>. Then refresh this page.
            </p>
          </div>
        )}
      </>
    );
  }

  const { members, entries } = data;
  // Door volunteers aren't part of the expense log (unless they somehow have entries).
  const balances = balancesByMember(members, entries).filter((b) => b.member.role !== "volunteer" || b.spent_cents > 0 || b.reimbursed_cents > 0);
  const owed = totalOwed(balances);
  const nameOf = nameLookup(members);
  const people: Person[] = members.filter((m) => m.active && m.role !== "volunteer").map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const shown = filterId ? entries.filter((e) => e.member_id === filterId) : entries;
  const filterName = filterId ? members.find((m) => m.id === filterId)?.name : undefined;
  const filterBalance = filterId ? balances.find((b) => b.member.id === filterId) : undefined;
  // Edit lists must include the entry's own person, even if they were removed since.
  const peopleFor = (e: LedgerEntry): Person[] => {
    if (people.some((p) => p.id === e.member_id)) return people;
    const m = members.find((x) => x.id === e.member_id);
    return m ? [...people, { id: m.id, name: `${m.name} (removed)`, role: m.role }] : people;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Expense log</h1>
          <p className="mt-1 text-muted">Everyone on e-board sees the same log. Red = someone spent money. Green = someone was paid back.</p>
        </div>
        <Link href="/admin/settings" className={btn}>
          ⚙️ Settings
        </Link>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        {/* ---------- left: people ---------- */}
        <aside className={`${panel} p-4`} aria-label="People">
          <h2 className="font-display text-lg font-black">People</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <PersonButton href="/admin/expenses" on={!filterId} title="Everyone" sub={`${formatCents(owed)} owed in total`} />
            </li>
            {balances.map((b) => (
              <li key={b.member.id}>
                <PersonButton
                  href={`/admin/expenses?member=${b.member.id}`}
                  on={filterId === b.member.id}
                  title={b.member.name}
                  tag={!b.member.active ? "removed" : b.member.role === "spender" ? "spender" : undefined}
                  sub={b.owed_cents > 0 ? `Owed ${formatCents(b.owed_cents)}` : b.owed_cents < 0 ? `Overpaid ${formatCents(-b.owed_cents)}` : "All square"}
                  owed={b.owed_cents > 0}
                />
              </li>
            ))}
          </ul>
        </aside>

        {/* ---------- middle: the feed ---------- */}
        <section className="min-w-0" aria-label="Log">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-black">{filterName ? `${filterName}'s activity` : "All activity"}</h2>
            {filterBalance && (
              <p className="text-sm">
                Spent {formatCents(filterBalance.spent_cents)} · paid back {formatCents(filterBalance.reimbursed_cents)} ·{" "}
                <strong>{filterBalance.owed_cents >= 0 ? `still owed ${formatCents(filterBalance.owed_cents)}` : `overpaid ${formatCents(-filterBalance.owed_cents)}`}</strong>
              </p>
            )}
          </div>
          {shown.length === 0 ? (
            <p className={`${panel} mt-3 p-6 text-center text-muted`}>{filterName ? `Nothing for ${filterName} yet.` : "Nothing in the log yet. Add the first expense on the right."}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shown.map((e) => (
                <FeedLine key={e.id} e={e} nameOf={nameOf}>
                  <EntryButtons e={e} me={me.memberId} people={peopleFor(e)} />
                </FeedLine>
              ))}
            </ul>
          )}
          {shown.length > 0 && <p className="mt-3 text-center text-xs text-muted">That&apos;s everything, oldest at the bottom.</p>}
        </section>

        {/* ---------- right: add ---------- */}
        <aside className={`${panel} p-4 lg:col-span-2 xl:col-span-1`} aria-label="Add to the log">
          <div className="mb-4 rounded-sm border border-line bg-page/60 p-3">
            <p className={eyebrow}>E-board is owed</p>
            <p className="text-3xl font-black tabular-nums">{formatCents(owed)}</p>
          </div>
          <AddEntry action={addEntry} myId={me.memberId} people={people} categories={EXPENSE_CATEGORIES} start={start} />
        </aside>
      </div>
    </>
  );
}

function PersonButton({ href, on, title, sub, tag, owed }: { href: string; on: boolean; title: string; sub: string; tag?: string; owed?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`block rounded-sm border p-3 shadow-sm transition hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-none ${
        on ? "border-burgundy bg-burgundy text-white" : "border-edge bg-white hover:border-burgundy"
      }`}
    >
      <span className="block font-semibold">
        {title}
        {tag && <span className={`ml-1 text-xs font-normal ${on ? "text-white/80" : "text-muted"}`}>({tag})</span>}
      </span>
      <span className={`block text-sm tabular-nums ${on ? "text-white/90" : owed ? "font-semibold text-[#a3243a]" : "text-muted"}`}>{sub}</span>
    </Link>
  );
}

/** Edit / Delete for your own entries; "I got it" for the person paid back. */
function EntryButtons({ e, me, people }: { e: LedgerEntry; me: string; people: Person[] }) {
  const isExpense = e.kind === "expense";
  const mine = e.entered_by_member_id === me;
  const paidMe = !isExpense && e.member_id === me;
  if (!mine && !paidMe) return null;
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      {paidMe && (
        <form action={setReceived}>
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="got" value={e.received_confirmed_at ? "no" : "yes"} />
          <button className={btnSm}>{e.received_confirmed_at ? "Undo “I got it”" : "✓ I got it"}</button>
        </form>
      )}
      {mine && (
        <>
          <EditEntry
            action={updateEntry.bind(null, e.id)}
            kind={e.kind}
            defaults={{
              member_id: e.member_id,
              amount: (e.amount_cents / 100).toFixed(2),
              description: e.description,
              category: e.category ?? "",
              note: e.note,
            }}
            people={people}
            categories={EXPENSE_CATEGORIES}
          />
          <form action={deleteEntry}>
            <input type="hidden" name="id" value={e.id} />
            <ConfirmSubmit message="Delete this entry? This can't be undone." className={btnSm}>
              Delete
            </ConfirmSubmit>
          </form>
        </>
      )}
    </div>
  );
}
