import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadExpenseData, totalsByMember, formatDay } from "@/lib/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { formatCents } from "@/lib/money";
import { todayNy, isoToNyDate } from "@/lib/time";
import { addExpense, setReimbursed, deleteExpense, addMember, setMemberActive } from "./actions";
import { ExpenseForm } from "./ExpenseForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

export const metadata = { title: "Admin · Expenses" };
export const dynamic = "force-dynamic";

const smallButton = "rounded-sm border border-line px-3 py-1 text-sm hover:border-link";

function Intro() {
  return (
    <>
      <h1 className="font-display text-3xl font-black">E-board expenses</h1>
      <p className="mt-2 text-muted">
        Log anything an e-board member paid for out of their own pocket, so the group can pay them back.
      </p>
    </>
  );
}

export default async function ExpensesPage(props: PageProps<"/admin/expenses">) {
  await requireAdmin();
  const { member } = await props.searchParams;
  const filterId = typeof member === "string" ? member : undefined;
  const data = await loadExpenseData();

  if (data.status === "demo") {
    return (
      <>
        <Intro />
        <p className="mt-6 rounded-sm border border-line bg-panel p-4">The expense tracker works once the database is connected.</p>
      </>
    );
  }

  if (data.status === "setup_needed") {
    return (
      <>
        <Intro />
        <div className="mt-6 space-y-2 rounded-sm border border-line bg-panel p-4">
          <p className="font-semibold">One-time setup needed</p>
          <p>
            In Supabase, open <strong>SQL Editor → New query</strong>, paste everything from{" "}
            <code>supabase/migrations/0002_expenses.sql</code>, and click <strong>Run</strong>. Then refresh this page.
          </p>
        </div>
      </>
    );
  }

  const { members, expenses } = data;
  const totals = totalsByMember(members, expenses);
  const totalOwed = totals.reduce((s, t) => s + t.owed_cents, 0);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const activeMembers = members.filter((m) => m.active);
  const shown = filterId ? expenses.filter((e) => e.member_id === filterId) : expenses;
  const filterName = filterId ? nameOf.get(filterId) : undefined;

  return (
    <>
      <Intro />

      {/* ---------- summary ---------- */}
      <section className="mt-6 rounded-sm border border-line bg-panel p-5">
        <p className="text-sm text-muted">Still owed to the e-board</p>
        <p className="font-display text-3xl font-black">{formatCents(totalOwed)}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Person</th>
                <th className="py-2 pr-3 text-right font-semibold">Spent</th>
                <th className="py-2 pr-3 text-right font-semibold">Paid back</th>
                <th className="py-2 text-right font-semibold">Still owed</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.member.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/expenses?member=${t.member.id}`} className="text-link hover:underline">
                      {t.member.name}
                    </Link>
                    {!t.member.active && <span className="text-muted"> (former)</span>}
                  </td>
                  <td className="py-2 pr-3 text-right">{formatCents(t.spent_cents)}</td>
                  <td className="py-2 pr-3 text-right">{formatCents(t.reimbursed_cents)}</td>
                  <td className={`py-2 text-right ${t.owed_cents > 0 ? "font-semibold" : ""}`}>{formatCents(t.owed_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- add ---------- */}
      <h2 className="font-display mt-10 text-xl font-bold">Add an expense</h2>
      <div className="mt-3">
        <ExpenseForm
          action={addExpense}
          members={activeMembers.map((m) => ({ id: m.id, name: m.name }))}
          categories={EXPENSE_CATEGORIES}
          today={todayNy()}
        />
      </div>

      {/* ---------- list ---------- */}
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{filterName ? `${filterName}'s expenses` : "All expenses"}</h2>
        {filterName && (
          <Link href="/admin/expenses" className="text-sm text-link hover:underline">Show everyone</Link>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-muted">No expenses yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-panel p-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {e.description} <span className="font-normal">· {formatCents(e.amount_cents)}</span>
                </p>
                <p className="text-sm text-muted">
                  {nameOf.get(e.member_id) ?? "Unknown"} paid · {formatDay(e.spent_on)} · {e.category}
                </p>
                {e.notes && <p className="mt-1 break-words text-sm text-muted">{e.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {e.reimbursed_at ? (
                  <span className="rounded-sm bg-sky px-3 py-1 text-xs font-semibold text-ink">
                    Paid back {formatDay(isoToNyDate(e.reimbursed_at))}
                  </span>
                ) : (
                  <span className="rounded-sm border border-burgundy px-3 py-1 text-xs font-semibold text-link">Owed</span>
                )}
                <form action={setReimbursed}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="paid" value={e.reimbursed_at ? "no" : "yes"} />
                  <button className={smallButton}>{e.reimbursed_at ? "Undo" : "Mark paid back"}</button>
                </form>
                <form action={deleteExpense}>
                  <input type="hidden" name="id" value={e.id} />
                  <ConfirmSubmit message={`Delete "${e.description}" (${formatCents(e.amount_cents)})? This can't be undone.`} className={smallButton}>
                    Delete
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- e-board list ---------- */}
      <details className="mt-10 rounded-sm border border-line bg-panel p-5">
        <summary className="cursor-pointer font-display font-bold">Edit the e-board list</summary>
        <p className="mt-2 text-sm text-muted">
          Removing someone only hides them from &ldquo;Who paid?&rdquo;. Their past expenses stay.
        </p>
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <span className={m.active ? "" : "text-muted line-through"}>{m.name}</span>
              <form action={setMemberActive}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="active" value={m.active ? "no" : "yes"} />
                <button className={smallButton}>{m.active ? "Remove" : "Restore"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addMember} className="mt-4 flex flex-wrap gap-2">
          <input name="name" required placeholder="New member's full name" className="min-w-0 flex-1 rounded-sm border border-line bg-white px-3 py-2 text-ink" />
          <button className="rounded-sm border border-link px-4 py-2 text-sm text-link">+ Add</button>
        </form>
      </details>
    </>
  );
}
