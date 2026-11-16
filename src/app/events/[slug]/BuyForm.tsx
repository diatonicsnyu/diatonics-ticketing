"use client";

import { startTransition, useActionState, useState } from "react";
import { allInCents, allInLabel, formatCents, SERVICE_FEE_CENTS } from "@/lib/money";
import { MAX_TICKETS_PER_ORDER } from "@/lib/order";
import { DonationPicker, donationPreviewCents } from "@/components/DonationPicker";
import { BuyerFields } from "@/components/BuyerFields";
import type { CheckoutState } from "@/app/checkout/actions";

type Type = { id: string; name: string; price_cents: number; quantity_limit: number | null };

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
  const [donation, setDonation] = useState({ choice: "none", custom: "" });

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

  return (
    <form
      className="mt-4 space-y-6"
      onSubmit={(e) => {
        e.preventDefault(); // keeps typed info if the server sends back an error
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {/* ---- 1. how many ---- */}
      <ul className="divide-y divide-line">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{t.name}</p>
              {/* All-in price, required by NY law + FTC rule (spec D4). */}
              <p className="text-sm text-muted">{allInLabel(t.price_cents)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => change(t, -1)} aria-label={`One fewer ${t.name}`}
                className="h-11 w-11 rounded-sm border border-line bg-white text-xl font-bold hover:border-burgundy disabled:opacity-40"
                disabled={(qty[t.id] ?? 0) === 0}>−</button>
              <span className="w-6 text-center text-lg font-bold" aria-live="polite">{qty[t.id] ?? 0}</span>
              <button type="button" onClick={() => change(t, 1)} aria-label={`One more ${t.name}`}
                className="h-11 w-11 rounded-sm border border-line bg-white text-xl font-bold hover:border-burgundy disabled:opacity-40"
                disabled={count >= maxTotal}>+</button>
              <input type="hidden" name={`qty_${t.id}`} value={qty[t.id] ?? 0} />
            </div>
          </li>
        ))}
      </ul>
      {count >= maxTotal && (
        <p className="text-sm text-muted">
          {maxTotal === MAX_TICKETS_PER_ORDER ? `Max ${MAX_TICKETS_PER_ORDER} tickets per order.` : `That's all the tickets left!`}
        </p>
      )}

      {/* ---- 2. optional donation ---- */}
      <div>
        <p className="mb-2 font-semibold">Add a donation? <span className="font-normal text-muted">(optional)</span></p>
        <DonationPicker allowNone choice={donation.choice} custom={donation.custom}
          onChange={(choice, custom) => setDonation({ choice, custom })} />
      </div>

      {/* ---- 3. who ---- */}
      <BuyerFields />

      {/* ---- total ---- */}
      <div className="rounded-sm bg-page p-4">
        <dl className="space-y-1 text-sm">
          {types.filter((t) => qty[t.id]).map((t) => (
            <div key={t.id} className="flex justify-between">
              <dt>{qty[t.id]} × {t.name} ({formatCents(allInCents(t.price_cents))} each, incl. {formatCents(SERVICE_FEE_CENTS)} fee)</dt>
              <dd>{formatCents(qty[t.id] * allInCents(t.price_cents))}</dd>
            </div>
          ))}
          {donationCents > 0 && (
            <div className="flex justify-between"><dt>Donation 💛</dt><dd>{formatCents(donationCents)}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <dt>Total</dt><dd>{formatCents(total)}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-muted">No refunds. All sales final.</p>

      {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}

      <button disabled={pending || count === 0}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-4 text-lg font-bold text-white hover:bg-burgundy-bright disabled:opacity-60">
        {pending ? "One moment…" : `Continue to payment · ${formatCents(total)}`}
      </button>
    </form>
  );
}
