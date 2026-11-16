"use client";

import { formatCents } from "@/lib/money";
import { DONATION_PRESETS_CENTS } from "@/lib/order";

/**
 * $5 / $10 / $25 / Custom chips (spec D10). Used on the Donate page and as
 * the optional add-on at ticket checkout. Sends form fields:
 *   donation        = "none" | "500" | "1000" | "2500" | "custom"
 *   donation_custom = dollars typed in, when "custom"
 */
export function DonationPicker({
  choice,
  custom,
  onChange,
  allowNone,
}: {
  choice: string;
  custom: string;
  onChange: (choice: string, custom: string) => void;
  allowNone: boolean;
}) {
  const options = [
    ...(allowNone ? [{ value: "none", label: "No thanks" }] : []),
    ...DONATION_PRESETS_CENTS.map((c) => ({ value: String(c), label: formatCents(c).replace(".00", "") })),
    { value: "custom", label: "Custom" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-full border px-4 py-2 font-semibold transition ${
              choice === o.value ? "border-burgundy bg-burgundy text-white" : "border-line bg-white hover:border-burgundy"
            }`}
          >
            <input
              type="radio"
              name="donation"
              value={o.value}
              checked={choice === o.value}
              onChange={() => onChange(o.value, custom)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {choice === "custom" && (
        <label className="mt-3 flex max-w-48 items-center gap-2">
          <span className="text-lg font-semibold">$</span>
          <input
            name="donation_custom"
            inputMode="decimal"
            autoFocus
            value={custom}
            onChange={(e) => onChange("custom", e.target.value)}
            placeholder="20"
            aria-label="Custom donation amount in dollars"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5"
          />
        </label>
      )}
    </div>
  );
}

/** Mirrors parseDonation() for the live total (the server re-checks). */
export function donationPreviewCents(choice: string, custom: string): number {
  if (!choice || choice === "none") return 0;
  if (choice !== "custom") return Number(choice) || 0;
  const n = Number(custom.trim().replace(/^\$/, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
