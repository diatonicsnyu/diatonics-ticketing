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

/**
 * Simple order number: 2 letters + 2 digits, e.g. "KM47" (user's request).
 * No I/O and no 0/1, so it reads cleanly aloud. 24 x 24 x 8 x 8 = 36,864 combos:
 * plenty for this group, but the orders table (Step 2) must keep order_no
 * UNIQUE and pick again on a clash. Not a secret: it never unlocks tickets.
 */
export function newOrderNumber(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const b = crypto.getRandomValues(new Uint8Array(4));
  return letters[b[0] % 24] + letters[b[1] % 24] + digits[b[2] % 8] + digits[b[3] % 8];
}
