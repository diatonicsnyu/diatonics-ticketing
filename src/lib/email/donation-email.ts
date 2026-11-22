import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";

/*
 * Donation receipt (spec §3.3): thanks, amount, date, reference.
 * It must NEVER say or imply the donation is tax-deductible: the Diatonics
 * aren't a 501(c)(3). So it doesn't mention taxes at all.
 * Same look as the ticket email (light colors, table layout, inline styles).
 */

const C = { page: "#eef6fc", card: "#ffffff", line: "#d9e6f0", ink: "#1a1a1f", muted: "#545460", burgundy: "#7b1e2e" };
const SANS = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Cinzel, Georgia, 'Times New Roman', serif";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildDonationReceipt(opts: {
  siteUrl: string;
  firstName: string;
  amountCents: number;
  paidAt: string;
  reference: string;
  /** The name they asked to be thanked by, or "" if they didn't opt in. */
  displayName: string;
  testFor?: string | null;
}): { subject: string; html: string; text: string } {
  const { siteUrl, firstName, amountCents, paidAt, reference, displayName, testFor } = opts;
  const amount = formatCents(amountCents);
  const date = formatDate(paidAt);
  const subject = `${testFor ? "[Test] " : ""}Thank you for supporting the Diatonics 💛`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:${C.muted}">${label}</td><td align="right" style="padding:6px 0">${value}</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:4px;border-collapse:separate">
  ${testFor ? `<tr><td style="background:#fff4d6;color:${C.ink};font-family:${SANS};font-size:13px;padding:10px 20px;border-radius:4px 4px 0 0">Test mode: this email was for <strong>${esc(testFor)}</strong>. Until diatonics.com is set up, every email comes to this inbox.</td></tr>` : ""}
  <tr><td align="center" style="padding:24px 20px 8px">
    <img src="${esc(siteUrl)}/logo.png" width="88" height="88" alt="Diatonics" style="display:block;width:88px;height:88px;border:0">
  </td></tr>
  <tr><td style="padding:8px 24px 8px;font-family:${SANS};color:${C.ink}">
    <p style="margin:0 0 8px;font-size:20px;font-weight:700">Thank you, ${esc(firstName)}! 💛</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Your donation is music to our ears. 🎶 The Diatonics get no university funding, so gifts like yours pay for our uniforms, venues, mics and everything else that keeps us singing.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};border-radius:4px;margin:0 0 16px">
      <tr><td style="padding:14px 16px">
        <div style="font-family:${SERIF};font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:14px;color:${C.burgundy};margin-bottom:6px">Receipt</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};font-size:14px;color:${C.ink}">
          ${row("Donation to the Diatonics", `<strong>${esc(amount)}</strong>`)}
          ${row("Date", esc(date))}
          ${row("Reference", esc(reference))}
        </table>
      </td></tr>
    </table>
    ${displayName ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5">We'll thank you as <strong>${esc(displayName)}</strong> on our <a href="${esc(siteUrl)}/donate" style="color:${C.burgundy}">supporters list</a>.</p>` : ""}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.5">Come hear us at a show: <a href="${esc(siteUrl)}" style="color:${C.burgundy}">see what's coming up</a>.</p>
  </td></tr>
  <tr><td align="center" style="border-top:1px solid ${C.line};padding:14px 20px;font-family:${SANS};font-size:12px;color:${C.muted}">Diatonics A Cappella · New York City</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    testFor ? `[TEST MODE: this email was for ${testFor}]\n` : "",
    `Thank you, ${firstName}!`,
    "",
    "Your donation is music to our ears. The Diatonics get no university funding, so gifts like yours pay for our uniforms, venues, mics and everything else that keeps us singing.",
    "",
    "RECEIPT",
    `Donation to the Diatonics: ${amount}`,
    `Date: ${date}`,
    `Reference: ${reference}`,
    "",
    displayName ? `We'll thank you as ${displayName} on our supporters list: ${siteUrl}/donate\n` : "",
    `Upcoming shows: ${siteUrl}`,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  return { subject, html, text };
}
