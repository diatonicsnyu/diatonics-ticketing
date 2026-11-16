/**
 * Door PIN hashing. We store only a salted hash of each event's PIN, never
 * the PIN itself. Uses the standard Web Crypto API (PBKDF2), which works on
 * any host (local, Vercel, or elsewhere).
 *
 * Stored format:  pbkdf2$<iterations>$<salt base64>$<hash base64>
 */

// 100,000 iterations: slow enough to resist guessing, and within every
// host's limits (some edge runtimes cap PBKDF2 at 100,000).
const ITERATIONS = 100_000;

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Used by the door app in Step 4. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const actual = await derive(pin, fromB64(saltB64), Number(iter));
  const expected = fromB64(hashB64);
  // Constant-time compare.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** PINs are 4–8 digits: easy to type at the door, easy to say out loud. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
