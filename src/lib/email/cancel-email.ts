import { formatCents } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";

/*
 * "The show is cancelled" email (D20). Paid orders were refunded in full;
 * gift tickets just stop working. Same look as the other emails.
 */

const C = { page: "#eef6fc", card: "#ffffff", line: "#d9e6f0", ink: "#1a1a1f", muted: "#545460", burgundy: "#7b1e2e" };
const SANS = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildCancelEmail(opts: {
  siteUrl: string;
  firstName: string;
  eventName: string;
  startsAt: string;
  orderNo: string;
  /** Amount refunded; 0 for gift tickets. */
  refundCents: number;
  testFor?: string | null;
}): { subject: string; html: string; text: string } {
  const { siteUrl, firstName, eventName, startsAt, orderNo, refundCents, testFor } = opts;
  const when = `${formatDate(startsAt)} at ${formatTime(startsAt)}`;
  const subject = `${testFor ? "[Test] " : ""}${eventName} is cancelled`;
  const money =
    refundCents > 0
      ? `We've refunded your <strong>${esc(formatCents(refundCents))}</strong> (order ${esc(orderNo)}) to the card or account you paid with. It can take 5–10 business days to show up. There's nothing you need to do.`
      : `Your tickets (order ${esc(orderNo)}) won't be used, so there's nothing you need to do.`;
  const moneyText =
    refundCents > 0
      ? `We've refunded your ${formatCents(refundCents)} (order ${orderNo}) to the card or account you paid with. It can take 5-10 business days to show up. There's nothing you need to do.`
      : `Your tickets (order ${orderNo}) won't be used, so there's nothing you need to do.`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:4px;border-collapse:separate">
  ${testFor ? `<tr><td style="background:#fff4d6;color:${C.ink};font-family:${SANS};font-size:13px;padding:10px 20px;border-radius:4px 4px 0 0">Test mode: this email was for <strong>${esc(testFor)}</strong>. Until diatonics.com is set up, every email comes to this inbox.</td></tr>` : ""}
  <tr><td align="center" style="padding:24px 20px 8px">
    <img src="${esc(siteUrl)}/logo.png" width="88" height="88" alt="Diatonics" style="display:block;width:88px;height:88px;border:0">
  </td></tr>
  <tr><td style="padding:8px 24px 24px;font-family:${SANS};color:${C.ink};font-size:15px;line-height:1.5">
    <p style="margin:0 0 8px;font-size:20px;font-weight:700">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 16px">We're so sorry: <strong>${esc(eventName)}</strong> on ${esc(when)} is cancelled.</p>
    <p style="margin:0 0 16px;padding:12px 16px;background:${C.page};border-radius:4px">${money}</p>
    <p style="margin:0 0 16px">We hope to sing for you soon. Keep an eye on <a href="${esc(siteUrl)}" style="color:${C.burgundy}">our upcoming shows</a>.</p>
    <p style="margin:0">💛 The Diatonics</p>
  </td></tr>
  <tr><td align="center" style="border-top:1px solid ${C.line};padding:14px 20px;font-family:${SANS};font-size:12px;color:${C.muted}">Diatonics A Cappella · New York City</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    testFor ? `[TEST MODE: this email was for ${testFor}]\n` : "",
    `Hi ${firstName},`,
    "",
    `We're so sorry: ${eventName} on ${when} is cancelled.`,
    "",
    moneyText,
    "",
    `We hope to sing for you soon. Upcoming shows: ${siteUrl}`,
    "",
    "The Diatonics",
  ].join("\n");

  return { subject, html, text };
}
