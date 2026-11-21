import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/*
 * SIGNED TICKETS (spec §4).
 *
 * The QR code on each ticket holds "D1.<ticket id>.<signature>". The
 * signature is an HMAC made with a key for THAT EVENT only, which comes from
 * TICKET_SECRET. Nobody without the key can make a code that passes, so the
 * door app can reject fake codes even with no signal (step 5 gives a door
 * phone the key for its event only, never TICKET_SECRET itself).
 *
 * "View my tickets" links are signed the same way, so the link in the email
 * works without a login, but nobody can guess someone else's.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function uuidToBytes(id: string): Buffer {
  return Buffer.from(id.replace(/-/g, ""), "hex");
}

function bytesToUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The signing key for one event's tickets. The door app gets only this (step 5). */
export function eventTicketKey(eventId: string): Buffer {
  return hmac(env.ticketSecret, `event-ticket-key-v1|${eventId}`);
}

function ticketSig(eventId: string, ticketId: string): string {
  // 96 bits: far more than anyone can guess, and keeps the QR code small.
  return b64url(hmac(eventTicketKey(eventId), `ticket-v1|${ticketId}`).subarray(0, 12));
}

/** What goes inside a ticket's QR code, e.g. "D1.q2v...Xw.9fK...a". */
export function ticketQrToken(eventId: string, ticketId: string): string {
  return `D1.${b64url(uuidToBytes(ticketId))}.${ticketSig(eventId, ticketId)}`;
}

/** Reads a QR token's ticket id without checking it (the check needs the event). */
export function ticketIdFromToken(token: string): string | null {
  const m = /^D1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})$/.exec(token);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64url");
  return bytes.length === 16 ? bytesToUuid(bytes) : null;
}

/** True if this QR token really is the given event's ticket. */
export function verifyTicketToken(token: string, eventId: string): boolean {
  const ticketId = ticketIdFromToken(token);
  if (!ticketId) return false;
  return same(token, ticketQrToken(eventId, ticketId));
}

// ---------- "View my tickets" links ----------------------------------------

function orderSig(orderId: string): string {
  return b64url(hmac(env.ticketSecret, `order-link-v1|${orderId}`).subarray(0, 16));
}

/** The secret part of an order's "view my tickets" link. */
export function orderLinkKey(orderId: string): string {
  return `${b64url(uuidToBytes(orderId))}.${orderSig(orderId)}`;
}

/** Full "view my tickets" link for the email and the confirmation page. */
export function orderLinkUrl(orderId: string): string {
  return `${env.siteUrl}/tickets/${orderLinkKey(orderId)}`;
}

/** The order id in a "view my tickets" link, or null if the link is fake. */
export function orderIdFromLinkKey(key: string): string | null {
  const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(key);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64url");
  if (bytes.length !== 16) return null;
  const orderId = bytesToUuid(bytes);
  if (!UUID.test(orderId)) return null;
  return same(m[2], orderSig(orderId)) ? orderId : null;
}
