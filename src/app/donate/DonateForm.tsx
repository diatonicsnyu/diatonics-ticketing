"use client";

import { startTransition, useActionState, useState } from "react";
import { DonationPicker, donationPreviewCents } from "@/components/DonationPicker";
import { BuyerFields } from "@/components/BuyerFields";
import { formatCents } from "@/lib/money";
import { startDonationCheckout, type CheckoutState } from "@/app/checkout/actions";

export function DonateForm() {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(startDonationCheckout, {});
  const [donation, setDonation] = useState({ choice: "1000", custom: "" });
  const [recognize, setRecognize] = useState(false);
  const amount = donationPreviewCents(donation.choice, donation.custom);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <div>
        <p className="mb-2 font-semibold">Amount</p>
        <DonationPicker allowNone={false} choice={donation.choice} custom={donation.custom}
          onChange={(choice, custom) => setDonation({ choice, custom })} />
        <p className="mt-2 text-sm text-muted">You pay exactly this amount, no added fees. We cover the card processing cost.</p>
      </div>

      <BuyerFields showPhone={false} />

      <div className="rounded-sm bg-page p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="recognize" checked={recognize} onChange={(e) => setRecognize(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>
            <span className="font-semibold">Thank me by name</span>
            <span className="block text-sm text-muted">Add me to the supporters list on this page.</span>
          </span>
        </label>
        {recognize && (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold">Name to display</span>
            <input name="display_name" maxLength={60} placeholder="e.g. The Chen Family" className="w-full rounded-sm border border-line bg-white px-3 py-2.5" />
          </label>
        )}
      </div>

      {state.error && <p className="rounded-sm bg-burgundy p-3 text-white" role="alert">{state.error}</p>}

      <button disabled={pending || amount === 0}
        className="font-display w-full rounded-sm bg-burgundy px-6 py-4 text-lg font-bold text-white hover:bg-burgundy-bright disabled:opacity-60">
        {pending ? "One moment…" : `Donate ${amount ? formatCents(amount) : ""}`}
      </button>
    </form>
  );
}
