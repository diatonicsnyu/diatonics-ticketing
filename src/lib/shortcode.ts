/**
 * Ticket short codes like "DIA-7K3F-Q9" (spec §3.4, §4).
 * Typed at the door when a QR won't scan, so no look-alike characters:
 * no 0/O, no 1/I/L.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomChars(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  // 31 symbols; the tiny modulo bias is irrelevant for a lookup code.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function newShortCode(): string {
  return `DIA-${randomChars(4)}-${randomChars(2)}`;
}

/** Human-friendly order number, e.g. "D-48K2QX". */
export function newOrderNumber(): string {
  return `D-${randomChars(6)}`;
}
