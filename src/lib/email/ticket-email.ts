import { formatDate, formatTime } from "@/lib/time";
import { formatCents } from "@/lib/money";

/*
 * The ticket email (spec §3.4, §12 "Ticket email"). Plain HTML tables with
 * inline styles, because that's all email apps reliably understand. Light
 * colors only (§11). QR codes are HOSTED images (Gmail blocks inline
 * data: images), served by /api/qr/<token>.
 */

export type EmailTicket = { shortCode: string; typeName: string; qrToken: string };
export type EmailOrder = {
  orderNo: string;
  buyerName: string;
  event: { name: string; starts_at: string; doors_at: string | null; venue: string };
  tickets: EmailTicket[];
  viewUrl: string;
  /** Add-on donation at ticket checkout (thanked in the first email only). */
  donationCents?: number;
};

const C = {
  page: "#eef6fc",
  card: "#ffffff",
  line: "#d9e6f0",
  ink: "#1a1a1f",
  muted: "#545460",
  sky: "#a9d6f5",
  burgundy: "#7b1e2e",
};
const SANS = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Cinzel, Georgia, 'Times New Roman', serif";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function mapUrl(venue: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

function whenLine(ev: EmailOrder["event"]) {
  return `${formatDate(ev.starts_at)} · Show ${formatTime(ev.starts_at)}${ev.doors_at ? ` · Doors ${formatTime(ev.doors_at)}` : ""}`;
}

function ticketCard(siteUrl: string, order: EmailOrder, t: EmailTicket, i: number): string {
  const ev = order.event;
  const qr = `${siteUrl}/api/qr/${encodeURIComponent(t.qrToken)}`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:4px;border-collapse:separate;background:${C.card};margin:0 0 16px">
  <tr><td style="background:${C.burgundy};color:#ffffff;padding:12px 20px;border-radius:4px 4px 0 0">
    <div style="font-family:${SERIF};font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:16px">${esc(ev.name)}</div>
    <div style="font-family:${SANS};font-size:14px;opacity:.9">${esc(formatDate(ev.starts_at))} · ${esc(formatTime(ev.starts_at))}</div>
  </td></tr>
  <tr><td align="center" style="padding:20px 20px 8px">
    <img src="${esc(qr)}" width="220" height="220" alt="QR code for ticket ${esc(t.shortCode)}" style="display:block;width:220px;height:220px;border:0">
  </td></tr>
  <tr><td align="center" style="padding:0 20px 20px;font-family:${SANS};color:${C.ink}">
    <div style="font-size:13px;color:${C.muted}">Ticket ${i + 1} of ${order.tickets.length} · ${esc(t.typeName)} · Order <strong style="color:${C.ink}">${esc(order.orderNo)}</strong></div>
    <div style="font-family:Consolas,Menlo,'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:2px;margin:6px 0 2px">${esc(t.shortCode)}</div>
    <div style="font-size:14px">${esc(order.buyerName)}</div>
    <div style="display:inline-block;margin-top:10px;background:${C.sky};color:${C.ink};border-radius:4px;padding:5px 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">General admission: first come, first served</div>
  </td></tr>
</table>`;
}

function orderBlock(siteUrl: string, order: EmailOrder): string {
  const ev = order.event;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};border-radius:4px;margin:0 0 16px">
  <tr><td style="padding:14px 16px;font-family:${SANS};font-size:14px;color:${C.ink};line-height:1.5">
    <div style="font-weight:700;font-size:16px">${esc(ev.name)}</div>
    <div>${esc(whenLine(ev))}</div>
    <div><a href="${esc(mapUrl(ev.venue))}" style="color:${C.burgundy}">${esc(ev.venue)}</a></div>
    <div style="color:${C.muted};margin-top:4px">Order ${esc(order.orderNo)} · ${order.tickets.length} ticket${order.tickets.length === 1 ? "" : "s"}</div>
  </td></tr>
</table>
${order.tickets.map((t, i) => ticketCard(siteUrl, order, t, i)).join("")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr><td align="center">
  <a href="${esc(order.viewUrl)}" style="display:inline-block;background:${C.burgundy};color:#ffffff;text-decoration:none;border-radius:4px;padding:12px 24px;font-family:${SERIF};font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:15px">View my tickets</a>
</td></tr></table>`;
}

/**
 * Builds the email. kind "ticket" = right after buying (one order);
 * "resend" = "Lost your ticket?" (every upcoming order for that email).
 * testFor = the buyer's address when test mode redirected the email.
 */
export function buildTicketEmail(opts: {
  kind: "ticket" | "resend";
  siteUrl: string;
  firstName: string;
  orders: EmailOrder[];
  testFor?: string | null;
}): { subject: string; html: string; text: string } {
  const { kind, siteUrl, firstName, orders, testFor } = opts;
  const first = orders[0];
  const subject =
    (testFor ? "[Test] " : "") +
    (kind === "ticket" ? `Your tickets for ${first.event.name} 🎶` : "Your Diatonics tickets, re-sent 🎶");
  const hello =
    kind === "ticket"
      ? `Hi ${esc(firstName)}, you're going! 🎉`
      : `Hi ${esc(firstName)}, here are your tickets again 🎶`;
  const intro =
    kind === "ticket"
      ? "Thanks for getting tickets! Show the QR code at the door. Each ticket gets one person in."
      : `Someone (hopefully you) asked us to re-send your tickets. Show the QR code at the door. Each ticket gets one person in.`;

  // Never say "tax-deductible": the group isn't a 501(c)(3).
  const donation = kind === "ticket" ? (first.donationCents ?? 0) : 0;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:4px;border-collapse:separate">
  ${testFor ? `<tr><td style="background:#fff4d6;color:${C.ink};font-family:${SANS};font-size:13px;padding:10px 20px;border-radius:4px 4px 0 0">Test mode: this email was for <strong>${esc(testFor)}</strong>. Until diatonics.com is set up, every ticket email comes to this inbox.</td></tr>` : ""}
  <tr><td align="center" style="padding:24px 20px 8px">
    <img src="${esc(siteUrl)}/logo.png" width="88" height="88" alt="Diatonics" style="display:block;width:88px;height:88px;border:0">
  </td></tr>
  <tr><td style="padding:8px 24px 8px;font-family:${SANS};color:${C.ink}">
    <p style="margin:0 0 8px;font-size:20px;font-weight:700">${hello}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${intro}</p>
    ${donation ? `<p style="margin:0 0 16px;padding:12px 16px;border:1px solid ${C.burgundy};border-radius:4px;font-size:15px;line-height:1.5">💛 <strong>Thank you for your ${esc(formatCents(donation))} donation!</strong> It goes straight to our uniforms, venues, mics and everything else that keeps the Diatonics singing.</p>` : ""}
    ${orders.map((o) => orderBlock(siteUrl, o)).join("")}
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">💡 <strong>Tip:</strong> turn your screen brightness up at the door so the QR code scans fast. The venue might not have signal, so open this email (or tap <strong>View my tickets</strong> and then <strong>Download</strong>) before you go.</p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:${C.muted}">All sales final, no refunds. Lost this email? Go to <a href="${esc(siteUrl)}/lost-ticket" style="color:${C.burgundy}">Lost your ticket?</a> to get it again.</p>
  </td></tr>
  <tr><td align="center" style="border-top:1px solid ${C.line};padding:14px 20px;font-family:${SANS};font-size:12px;color:${C.muted}">Diatonics A Cappella · New York City</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    testFor ? `[TEST MODE: this email was for ${testFor}]\n` : "",
    kind === "ticket" ? `Hi ${firstName}, you're going!` : `Hi ${firstName}, here are your tickets again.`,
    "",
    donation ? `Thank you for your ${formatCents(donation)} donation!
` : "",
    ...orders.flatMap((o) => [
      o.event.name,
      whenLine(o.event),
      o.event.venue,
      `Order ${o.orderNo}`,
      ...o.tickets.map((t, i) => `  Ticket ${i + 1} of ${o.tickets.length} (${t.typeName}): ${t.shortCode}`),
      "GENERAL ADMISSION: first come, first served",
      `View your tickets (with QR codes): ${o.viewUrl}`,
      "",
    ]),
    "Tip: turn your screen brightness up at the door so the QR code scans fast.",
    "All sales final, no refunds.",
    `Lost this email? ${siteUrl}/lost-ticket`,
  ].join("\n");

  return { subject, html, text };
}
