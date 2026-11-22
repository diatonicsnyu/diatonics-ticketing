import type { LedgerEntry } from "@/lib/expenses";
import { formatDay } from "@/lib/expenses";
import { formatCents } from "@/lib/money";
import { EXPENSE_BADGE, EXPENSE_FEED, REIMBURSE_BADGE, REIMBURSE_FEED } from "@/lib/ledger-style";

/**
 * One expense-log entry as a notification ("Callum spent $20 on posters"),
 * clear red for expenses and green for reimbursements (SPEC §13). The
 * expense page adds its buttons (edit, delete, "I got it") as children.
 */
export function FeedLine({
  e,
  nameOf,
  compact = false,
  children,
}: {
  e: LedgerEntry;
  nameOf: (id: string | null) => string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const isExpense = e.kind === "expense";
  const who = nameOf(e.member_id);
  const by = e.entered_by_member_id && e.entered_by_member_id !== e.member_id ? nameOf(e.entered_by_member_id) : null;
  const initial = who.trim()[0]?.toUpperCase() ?? "?";

  return (
    <li className={`rounded-sm border border-line ${isExpense ? EXPENSE_FEED : REIMBURSE_FEED} ${compact ? "p-2.5" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-sm font-bold ${isExpense ? EXPENSE_BADGE : REIMBURSE_BADGE} ${compact ? "h-8 w-8 text-sm" : "h-10 w-10"}`}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className={compact ? "text-sm" : ""}>
            <strong>{who}</strong> {isExpense ? "spent" : "got paid back"}{" "}
            <span className={`whitespace-nowrap rounded-sm px-1.5 py-0.5 font-bold tabular-nums ${isExpense ? EXPENSE_BADGE : REIMBURSE_BADGE}`}>
              {isExpense ? "−" : "+"}
              {formatCents(e.amount_cents)}
            </span>
            {e.description && <> {isExpense ? "on" : "for"} {e.description}</>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDay(e.created_at)}
            {isExpense && e.category && <> · {e.category}</>}
            {by && <> · {isExpense ? "logged" : "sent"} by {by}</>}
            {!isExpense && e.received_confirmed_at && <> · ✓ {who} got it</>}
          </p>
          {!compact && e.note && <p className="mt-1 break-words text-sm">{e.note}</p>}
          {children}
        </div>
      </div>
    </li>
  );
}
