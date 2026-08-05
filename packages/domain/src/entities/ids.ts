/**
 * Stable client-generated UUIDs. IDs are generated offline and never change
 * across retries or synchronization, so they can be used for idempotent replay.
 */

type CryptoLike = { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array };

function globalCrypto(): CryptoLike | undefined {
  const value = (globalThis as { crypto?: CryptoLike }).crypto;
  return value ?? undefined;
}

function randomBytes(length: number): Uint8Array {
  const value = globalCrypto();
  if (value?.getRandomValues) {
    const bytes = new Uint8Array(length);
    value.getRandomValues(bytes);
    return bytes;
  }
  // Non-secure fallback (test-only environments without WebCrypto).
  const bytes = new Uint8Array(length);
  let seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    bytes[i] = (seed >>> 24) & 0xff;
  }
  return bytes;
}

export function randomUuid(): string {
  const value = globalCrypto();
  if (value?.randomUUID) {
    return value.randomUUID();
  }
  const bytes = randomBytes(16);
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x40;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
