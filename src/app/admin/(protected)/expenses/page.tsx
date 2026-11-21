import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadLedger, balancesByMember, totalOwed, formatDay, firstName, type EboardMember, type LedgerEntry } from "@/lib/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { EXPENSE_TONE, REIMBURSE_TONE } from "@/lib/ledger-style";
import { formatCents } from "@/lib/money";
import { addEntry, updateEntry, deleteEntry, setReceived, addMember, setMemberActive } from "./actions";
import { AddEntry, EditEntry } from "./ExpenseForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

export const metadata = { title: "Admin · Expense log" };
export const dynamic = "force-dynamic";

const smallButton = "rounded-sm border border-line bg-white px-3 py-1 text-sm text-ink hover:border-link";

function Intro() {
  return (
    <>
      <h1 className="font-display text-3xl font-black">Expense log</h1>
      <p className="mt-2 text-muted">
        Spent your own money on the group? Log an <strong className="text-ink">Expense</strong>. Sent someone money back? Log a{" "}
        <strong className="text-ink">Reimbursement</strong>. Everyone on e-board sees the same log.
      </p>
    </>
  );
}

/** First names, unless two people share one (then full names). */
function nameLookup(members: EboardMember[]) {
  const firstCounts = new Map<string, number>();
  for (const m of members) firstCounts.set(firstName(m.name), (firstCounts.get(firstName(m.name)) ?? 0) + 1);
  const byId = new Map(members.map((m) => [m.id, (firstCounts.get(firstName(m.name)) ?? 0) > 1 ? m.name : firstName(m.name)]));
  return (id: string | null) => (id ? byId.get(id) ?? "Someone" : "Someone");
}

export default async function ExpenseLogPage(props: PageProps<"/admin/expenses">) {
  const me = await requireAdmin();
  const { member } = await props.searchParams;
  const filterId = typeof member === "string" ? member : undefined;
  const data = await loadLedger();

  if (data.status === "demo") {
    return (
      <>
        <Intro />
        <p className="mt-6 rounded-sm border border-line bg-panel p-4">The expense log works once the database is connected.</p>
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
            <code>supabase/migrations/0005_ledger.sql</code>, and click <strong>Run</strong>. Then refresh this page.
          </p>
        </div>
      </>
    );
  }

  const { members, entries } = data;
  const balances = balancesByMember(members, entries);
  const owed = totalOwed(balances);
  const nameOf = nameLookup(members);
  const activeMembers = members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }));
  const shown = filterId ? entries.filter((e) => e.member_id === filterId) : entries;
  const filterName = filterId ? members.find((m) => m.id === filterId)?.name : undefined;

  return (
    <>
      <Intro />

      {/* ---------- balances ---------- */}
      <section className="mt-6 rounded-sm border border-line bg-panel p-5">
        <p className="text-sm text-muted">E-board is owed</p>
        <p className="font-display text-3xl font-black">{formatCents(owed)}</p>
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
              {balances.map((b) => (
                <tr key={b.member.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/expenses?member=${b.member.id}`} className="text-link hover:underline">{b.member.name}</Link>
                    {!b.member.active && <span className="text-muted"> (former)</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCents(b.spent_cents)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCents(b.reimbursed_cents)}</td>
                  <td className={`py-2 text-right tabular-nums ${b.owed_cents > 0 ? "font-semibold" : "text-muted"}`}>
                    {b.owed_cents >= 0 ? formatCents(b.owed_cents) : `overpaid ${formatCents(-b.owed_cents)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- add ---------- */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Add to the log</h2>
        <div className="mt-3">
          <AddEntry action={addEntry} myName={me.name} members={activeMembers} categories={EXPENSE_CATEGORIES} />
        </div>
      </section>

      {/* ---------- shared log ---------- */}
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{filterName ? `${filterName}'s entries` : "The log"}</h2>
        {filterName && <Link href="/admin/expenses" className="text-sm text-link hover:underline">Show everyone</Link>}
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-muted">Nothing in the log yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((e) => (
            <LogRow key={e.id} e={e} me={me.memberId} nameOf={nameOf} members={activeMembers} />
          ))}
        </ul>
      )}

      {/* ---------- e-board list ---------- */}
      <details className="mt-10 rounded-sm border border-line bg-panel p-5">
        <summary className="cursor-pointer font-display font-bold">Edit the e-board list</summary>
        <p className="mt-2 text-sm text-muted">
          This is also who can log in to admin. Removing someone hides them and blocks their login; their past entries stay.
        </p>
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <span className={m.active ? "" : "text-muted line-through"}>{m.name}</span>
              {m.id !== me.memberId && (
                <form action={setMemberActive}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="active" value={m.active ? "no" : "yes"} />
                  <button className={smallButton}>{m.active ? "Remove" : "Restore"}</button>
                </form>
              )}
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

/** One line of the shared log, Venmo-style. */
function LogRow({
  e,
  me,
  nameOf,
  members,
}: {
  e: LedgerEntry;
  me: string;
  nameOf: (id: string | null) => string;
  members: { id: string; name: string }[];
}) {
  const isExpense = e.kind === "expense";
  const mine = e.entered_by_member_id === me;
  const who = nameOf(e.member_id);
  const amount = formatCents(e.amount_cents);

  return (
    <li className={`rounded-sm border p-4 ${isExpense ? EXPENSE_TONE : REIMBURSE_TONE}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            <span aria-hidden>{isExpense ? "🟥" : "🟩"} </span>
            {isExpense ? (
              <>{who} spent {amount}{e.description && <> ({e.description})</>}</>
            ) : (
              <>
                {who} received {amount}
                {e.note && <> {e.note}</>}
                {e.entered_by_member_id && <> (sent by {nameOf(e.entered_by_member_id)})</>}
              </>
            )}
          </p>
          <p className="text-sm text-ink/80">
            {formatDay(e.created_at)}
            {isExpense && e.category && <> · {e.category}</>}
            {!isExpense && e.description && <> · for {e.description}</>}
          </p>
          {isExpense && e.note && <p className="mt-1 break-words text-sm text-ink/80">{e.note}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The optional "I got it" (SPEC D33). Only the person paid back can tap it. */}
          {!isExpense && e.received_confirmed_at && (
            <span className="rounded-sm bg-white px-2 py-1 text-xs font-semibold">✓ {who} got it</span>
          )}
          {!isExpense && e.member_id === me && (
            <form action={setReceived}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="got" value={e.received_confirmed_at ? "no" : "yes"} />
              <button className={smallButton}>{e.received_confirmed_at ? "Undo “I got it”" : "I got it"}</button>
            </form>
          )}
          {mine && (
            <form action={deleteEntry}>
              <input type="hidden" name="id" value={e.id} />
              <ConfirmSubmit message="Delete this entry? This can't be undone." className={smallButton}>Delete</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {mine && (
        <div className="mt-2">
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
            members={members}
            categories={EXPENSE_CATEGORIES}
          />
        </div>
      )}
    </li>
  );
}
