/**
 * Expense-log colors (SPEC D33): expenses red/pink, reimbursements green.
 * Soft tints so the admin stays light mode. Shared by server + client code,
 * so this file must NOT be server-only or "use client".
 */
export const EXPENSE_TONE = "border-[#f0b4c0] bg-[#fdeef1] text-[#8f1d33]";
export const REIMBURSE_TONE = "border-[#a9d8b6] bg-[#ebf7ee] text-[#1d6638]";
