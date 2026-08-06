const encoder = new TextEncoder();
const KEY_DB = 'expense-tracker-security';
const KEY_STORE = 'keys';
const KEY_NAME = 'web-mutation-key';
export const EXPORT_KDF = {
  algorithm: 'PBKDF2-HMAC-SHA256',
  iterations: 210_000,
  cipher: 'AES-256-GCM',
} as const;

let sessionKey: Promise<CryptoKey> | null = null;
let keyEpoch = 0;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser key storage failed.'));
  });
}

async function openKeyDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(KEY_DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(KEY_STORE);
  };
  return requestResult(request);
}

async function loadOrCreateKey(epoch: number): Promise<CryptoKey> {
  // jsdom and a few restricted browser contexts do not expose IndexedDB. Keep
  // contract tests and ephemeral private browsing usable without pretending
  // that this fallback is durable; production browsers use the branch below.
  if (typeof indexedDB === 'undefined') {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    ) as Promise<CryptoKey>;
  }

  const db = await openKeyDb();
  try {
    const existing = await requestResult<CryptoKey | undefined>(db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(KEY_NAME));
    if (epoch !== keyEpoch) return loadOrCreateKey(keyEpoch);
    if (existing) return existing;

    const created = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    if (epoch !== keyEpoch) return loadOrCreateKey(keyEpoch);
    const transaction = db.transaction(KEY_STORE, 'readwrite');
    transaction.objectStore(KEY_STORE).put(created, KEY_NAME);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Browser key storage failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Browser key storage was aborted.'));
    });
    return created;
  } finally {
    db.close();
  }
}

function getSessionKey(): Promise<CryptoKey> {
  if (!sessionKey) {
    const epoch = keyEpoch;
    sessionKey = loadOrCreateKey(epoch).then((key) => {
      if (epoch !== keyEpoch) return getSessionKey();
      return key;
    });
  }
  return sessionKey;
}

/**
 * Forget the in-memory mutation key and remove its browser persistence. This
 * is a local browser wipe only; it does not erase downloaded backups or other
 * devices. The next mutation starts a fresh browser-key lifecycle.
 */
export async function clearMutationKeyStorage(): Promise<void> {
  keyEpoch += 1;
  sessionKey = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(KEY_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not clear browser encryption keys.'));
    request.onblocked = () => reject(new Error('Close other tabs before clearing browser encryption keys.'));
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/**
 * Encrypt a mutation payload for the local append-only log. The non-exportable
 * key is persisted in IndexedDB for this browser origin; recovery/export key
 * handling is intentionally owned by the privacy milestone.
 */
async function deriveExportKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: EXPORT_KDF.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function encryptExportPayload(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveExportKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, encoder.encode(plaintext)));
  return `v1.${toBase64(salt)}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptExportPayload(payload: string, password: string): Promise<string> {
  const [version, encodedSalt, encodedIv, encodedCiphertext] = payload.split('.');
  if (version !== 'v1' || !encodedSalt || !encodedIv || !encodedCiphertext) throw new Error('Unsupported encrypted backup format.');
  const key = await deriveExportKey(password, fromBase64(encodedSalt));
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encodedIv) as unknown as BufferSource }, key, fromBase64(encodedCiphertext) as unknown as BufferSource);
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('The export password is incorrect or the backup is damaged.');
  }
}

export async function encryptMutationPayload(payload: unknown, context: string): Promise<string> {
  const key = await getSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(context);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource }, key, plaintext as unknown as BufferSource));
  return `v1.${toBase64Url(iv)}.${toBase64Url(encrypted)}.${toBase64Url(aad)}`;
}
