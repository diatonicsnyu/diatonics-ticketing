/*
 * OFFLINE MODE for the door app (spec §3.7, D13). Runs in the browser.
 *
 * - The phone keeps the show's guest list (GuestList) in its storage and
 *   refreshes it whenever it has signal.
 * - With no signal, a scan is checked against that list. The QR's signature
 *   is checked with the show's key, so fakes are still caught.
 * - Check-ins and door-sale taps made offline wait in a queue on the phone
 *   and are sent (synced) as soon as there's signal again.
 */

export type ListTicket = {
  id: string;
  /** buyer name */ n: string;
  /** ticket type */ t: string;
  /** short code */ c: string;
  /** order number */ o: string;
  s: "valid" | "checked_in";
  /** checked in at / by (volunteer name) */ at: string | null;
  by: string | null;
  /** fingerprint (SHA-256) of the buyer's email, for exact-email lookup */ e: string;
};

export type GuestList = {
  eventId: string;
  /** This show's ticket-signing key (base64url). Only works for this show. */
  key: string;
  fetchedAt: number;
  doorSales: number;
  doorSalesMine: number;
  tickets: ListTicket[];
};

export type PendingCheckIn = { cid: string; ticketId: string; at: string; method: "scan" | "lookup" };
export type PendingSale = { cid: string; delta: 1 | -1 };
export type Queue = { checkIns: PendingCheckIn[]; sales: PendingSale[] };

export type SyncResult = {
  cid: string;
  result: "ok" | "synced" | "duplicate" | "void" | "not_found" | "wrong_event";
  name?: string;
  first_at?: string;
  first_by?: string;
};
export type SyncResponse = {
  checkIns: SyncResult[];
  stats: { sold: number; checkedIn: number; doorSales: number; doorSalesMine: number };
};

// ---------- storage (kept on this phone) ----------------------------------

const listKey = (eventId: string) => `door-list:${eventId}`;
const queueKey = (eventId: string) => `door-queue:${eventId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode: keeps working in memory */
  }
}

export const loadList = (eventId: string) => read<GuestList>(listKey(eventId));
export const saveList = (list: GuestList) => write(listKey(list.eventId), list);
export const loadQueue = (eventId: string): Queue => read<Queue>(queueKey(eventId)) ?? { checkIns: [], sales: [] };
export const saveQueue = (eventId: string, q: Queue) => write(queueKey(eventId), q);

export function newCid(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Puts this phone's not-yet-synced check-ins on top of a freshly downloaded list. */
export function applyQueue(list: GuestList, q: Queue, deviceName: string): GuestList {
  if (q.checkIns.length === 0) return list;
  const pending = new Map(q.checkIns.map((c) => [c.ticketId, c]));
  return {
    ...list,
    tickets: list.tickets.map((t) => {
      const p = pending.get(t.id);
      return p && t.s === "valid" ? { ...t, s: "checked_in", at: p.at, by: deviceName } : t;
    }),
  };
}

// ---------- checking a QR code with no signal -------------------------------

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function toB64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(keyB64: string) {
  let k = keyCache.get(keyB64);
  if (!k) {
    k = crypto.subtle.importKey("raw", fromB64url(keyB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(keyB64, k);
  }
  return k;
}

/**
 * The ticket id inside a QR code, if the code was really made by us for
 * this show (same check as the server's lib/ticket-token.ts). Otherwise null.
 */
export async function verifyTokenOffline(token: string, keyB64: string): Promise<string | null> {
  const m = /^D1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})$/.exec(token.trim());
  if (!m) return null;
  const idBytes = fromB64url(m[1]);
  if (idBytes.length !== 16) return null;
  const h = Array.from(idBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const ticketId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(keyB64), new TextEncoder().encode(`ticket-v1|${ticketId}`)),
  ).subarray(0, 12);
  return toB64url(sig) === m[2] ? ticketId : null;
}

// ---------- manual lookup on the phone -------------------------------------

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Name (any part), exact email, order number (KM47) or ticket code. */
export async function searchList(list: GuestList, raw: string): Promise<ListTicket[]> {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const qs = squash(q);
  const emailHash = q.includes("@") ? await sha256hex(q) : null;
  return list.tickets
    .filter(
      (t) =>
        t.n.toLowerCase().includes(q) ||
        (emailHash !== null && t.e === emailHash) ||
        t.o.toLowerCase() === qs ||
        (qs.length >= 4 && squash(t.c).includes(qs)),
    )
    .sort((a, b) => a.n.localeCompare(b.n) || a.c.localeCompare(b.c));
}
