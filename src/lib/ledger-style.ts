/**
 * Expense-log colors (SPEC D33): expenses red/pink, reimbursements green.
 * Soft tints so the admin stays light mode. Shared by server + client code,
 * so this file must NOT be server-only or "use client".
 */
export const EXPENSE_TONE = "border-[#f0b4c0] bg-[#fdeef1] text-[#8f1d33]";
export const REIMBURSE_TONE = "border-[#a9d8b6] bg-[#ebf7ee] text-[#1d6638]";

/*
 * The log feed (SPEC §13): clear red / green, like notifications.
 * A thick colored bar on the left, a light tint, and a solid amount badge
 * (white text: 4.5:1+ contrast on both).
 */
export const EXPENSE_FEED = "border-l-[6px] border-l-[#c62f45] bg-[#fdecef]";
export const REIMBURSE_FEED = "border-l-[6px] border-l-[#23864a] bg-[#e9f6ee]";
export const EXPENSE_BADGE = "bg-[#c62f45] text-white";
export const REIMBURSE_BADGE = "bg-[#23864a] text-white";
