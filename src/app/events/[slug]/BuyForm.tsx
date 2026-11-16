"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import { allInCents, allInLabel, formatCents, SERVICE_FEE_CENTS } from "@/lib/money";
import { ADDON_DONATION_PRESETS_CENTS, MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { DonationPicker, donationPreviewCents } from "@/components/DonationPicker";
import { BuyerFields } from "@/components/BuyerFields";
import type { CheckoutState } from "@/app/checkout/actions";

type Type = { id: string; name: string; price_cents: number; quantity_limit: number | null };
type StepNo = 1 | 2 | 3;

/**
 * Three collapsible steps: 1 Tickets -> 2 Donation (optional) -> 3 Your info + pay.
 * Finishing a step opens the next one. Every field stays mounted while its
 * step is collapsed (just hidden), so the whole form still submits together.
 */
export function BuyForm({
  types,
  remaining,
  action,
}: {
  types: Type[];
  remaining: number | null; // null = unlimited
  action: (prev: CheckoutState, fd: FormData) => Promise<CheckoutState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(types.map((t, i) => [t.id, i === 0 ? 1 : 0])),
  );
  // $2 is picked by default (user's request). It's shown in step 2 and itemized in the total.
  const [donation, setDonation] = useState({ choice: "200", custom: "" });
  const [recognize, setRecognize] = useState(false);
  const [open, setOpen] = useState<StepNo>(1);
  const [reached, setReached] = useState<StepNo>(1);

  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const maxTotal = Math.min(MAX_TICKETS_PER_ORDER, remaining ?? Infinity);
  const ticketsCents = types.reduce((sum, t) => sum + (qty[t.id] ?? 0) * allInCents(t.price_cents), 0);
  const donationCents = donationPreviewCents(donation.choice, donation.custom);
  const total = ticketsCents + donationCents;

  function change(t: Type, delta: number) {
    const next = (qty[t.id] ?? 0) + delta;
    if (next < 0) return;
    if (delta > 0 && count >= maxTotal) return;
    if (t.quantity_limit != null && next > t.quantity_limit) return;
    setQty({ ...qty, [t.id]: next });
  }

  function goTo(step: StepNo) {
    setOpen(step);
    if (step > reached) setReached(step);
  }

  const ticketSummary =
    types
      .filter((t) => qty[t.id])
      .map((t) => `${qty[t.id]} × ${t.name}`)
      .join(", ") + ` · ${formatCents(ticketsCents)}`;
  const donationSummary = donationCents > 0 ? `${formatCents(donationCents)} donation` : "No donation";

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault(); // keeps typed info if the server sends back an error
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {/* ---- 1. how many ---- */}
      <Step n={1} title="Tickets" open={open} reached={reached} summary={count > 0 ? ticketSummary : undefined} onOpen={setOpen}>
        <ul className="space-y-3">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-page p-4">
              <div>
                <p className="text-lg font-semibold">{t.name}</p>
                {/* All-in price, required by NY law + FTC rule (spec D4). */}
                <p className="text-muted">{allInLabel(t.price_cents)}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => change(t, -1)} aria-label={`One fewer ${t.name}`}
                  className="h-12 w-12 rounded-sm border border-line bg-white text-2xl font-bold hover:border-burgundy disabled:opacity-40"
                  disabled={(qty[t.id] ?? 0) === 0}>−</button>
                <span className="w-8 text-center text-2xl font-bold tabular-nums" aria-live="polite">{qty[t.id] ?? 0}</span>
                <button type="button" onClick={() => change(t, 1)} aria-label={`One more ${t.name}`}
                  className="h-12 w-12 rounded-sm border border-line bg-white text-2xl font-bold hover:border-burgundy disabled:opacity-40"
                  disabled={count >= maxTotal}>+</button>
                <input type="hidden" name={`qty_${t.id}`} value={qty[t.id] ?? 0} />
              </div>
            </li>
          ))}
        </ul>
        {count >= maxTotal && (
          <p className="mt-3 text-sm text-muted">
            {maxTotal === MAX_TICKETS_PER_ORDER ? `Max ${MAX_TICKETS_PER_ORDER} tickets per order.` : `That's all the tickets left!`}
          </p>
        )}
        <NextButton disabled={count === 0} onClick={() => goTo(2)}>Continue</NextButton>
      </Step>

      {/* ---- 2. optional donation ---- */}
      <Step n={2} title="Add a donation" note="optional" open={open} reached={reached}
        summary={reached > 2 || open !== 2 ? donationSummary : undefined} onOpen={setOpen}>
        <p className="mb-3 text-sm text-muted">Helps cover venues and competitions. Totally up to you.</p>
        <DonationPicker presets={ADDON_DONATION_PRESETS_CENTS} compact choice={donation.choice} custom={donation.custom}
          onChange={(choice, custom) => setDonation({ choice, custom })} />
        {/* Continue + a small opt-in recognition checkbox on one row (spec D12). It's always
            there (greyed out with no donation), so nothing jumps around when an amount is picked.
            The name shown is the first + last name from step 3. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <NextButton className="" onClick={() => goTo(3)}>Continue</NextButton>
          <label className={`flex items-center gap-2 text-sm ${donationCents > 0 ? "cursor-pointer" : "opacity-50"}`}>
            <input type="checkbox" name="recognize" checked={recognize && donationCents > 0} disabled={donationCents === 0}
              onChange={(e) => setRecognize(e.target.checked)} className="h-4 w-4 accent-burgundy" />
            Thank me by name on our supporters list
          </label>
        </div>
      </Step>

      {/* ---- 3. who + pay ---- */}
      <Step n={3} title="Your info" open={open} reached={reached} onOpen={setOpen}>
        <BuyerFields />

        <div className="mt-5 rounded-sm bg-page p-4">
          <dl className="space-y-1 text-sm">
            {types.filter((t) => qty[t.id]).map((t) => (
              <div key={t.id} className="flex justify-between gap-3">
                <dt>{qty[t.id]} × {t.name} ({formatCents(allInCents(t.price_cents))} each, incl. {formatCents(SERVICE_FEE_CENTS)} fee)</dt>
                <dd className="tabular-nums">{formatCents(qty[t.id] * allInCents(t.price_cents))}</dd>
              </div>
            ))}
            {donationCents > 0 && (
              <div className="flex justify-between"><dt>Donation 💛</dt><dd className="tabular-nums">{formatCents(donationCents)}</dd></div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>Total</dt><dd className="tabular-nums">{formatCents(total)}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-3 text-xs text-muted">No refunds. All sales final.</p>

        {state.error && <p className="mt-3 rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}

        {/* Only rendered on step 3, so the browser never blocks on a hidden required field. */}
        {open === 3 && (
          <button disabled={pending || count === 0}
            className="font-display mt-4 w-full rounded-sm bg-burgundy px-6 py-4 text-lg font-bold text-white hover:bg-burgundy-bright disabled:opacity-60">
            {pending ? "One moment…" : `Continue to payment · ${formatCents(total)}`}
          </button>
        )}
      </Step>
    </form>
  );
}

function Step({
  n,
  title,
  note,
  open,
  reached,
  summary,
  onOpen,
  children,
}: {
  n: StepNo;
  title: string;
  note?: string;
  open: StepNo;
  reached: StepNo;
  summary?: string;
  onOpen: (n: StepNo) => void;
  children: ReactNode;
}) {
  const isOpen = open === n;
  const canOpen = n <= reached;
  return (
    <section className={`rounded-sm border bg-white ${isOpen ? "border-burgundy" : "border-line"}`}>
      <button
        type="button"
        onClick={() => canOpen && onOpen(n)}
        disabled={!canOpen}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-default"
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-bold ${
          canOpen ? "bg-burgundy text-white" : "bg-page text-muted"}`}>{n}</span>
        <span className="min-w-0 flex-1">
          <span className={`font-display block text-xl font-bold ${canOpen ? "" : "text-muted"}`}>
            {title} {note && <span className="font-sans text-sm font-normal normal-case tracking-normal text-muted">({note})</span>}
          </span>
          {!isOpen && summary && <span className="block truncate text-sm text-muted">{summary}</span>}
        </span>
        {canOpen && (
          <span aria-hidden className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
        )}
      </button>
      <div hidden={!isOpen} className="border-t border-line p-4">
        {children}
      </div>
    </section>
  );
}

function NextButton({ onClick, disabled, children, className = "mt-4" }: { onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`font-display w-full rounded-sm bg-burgundy px-6 py-3 font-bold text-white hover:bg-burgundy-bright disabled:opacity-50 sm:w-auto ${className}`}>
      {children}
    </button>
  );
}
