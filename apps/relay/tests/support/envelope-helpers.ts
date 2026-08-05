/**
 * Encrypted-envelope helpers (T023). Test-only WebCrypto implementations of the
 * shared crypto contract (AES-256-GCM payload encryption, P-256 ECDH device
 * key wrapping) so relay protocol tests can exercise encrypted envelopes
 * without production key material.
 */

import type { EncryptedEnvelope, MutationEnvelope, WrappedKeyBlob } from '@expense-tracker/contracts';

const subtle = globalThis.crypto.subtle;

/** TS 5.9's DOM lib models BufferSource with ArrayBuffer (not SharedArrayBuffer).
 * Runtime WebCrypto accepts Uint8Array; this boundary keeps the test adapter
 * compatible with both Node and browser implementations. */
function cryptoBytes(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

export function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export class TestEnvelopeCipher {
  static readonly algorithm = 'AES-256-GCM' as const;

  private constructor(private readonly key: CryptoKey) {}

  static async create(): Promise<TestEnvelopeCipher> {
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    return new TestEnvelopeCipher(key);
  }

  async encrypt(plaintext: Uint8Array, aad: Uint8Array): Promise<EncryptedEnvelope> {
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const blob = new Uint8Array(
      await subtle.encrypt(
        { name: 'AES-GCM', iv: cryptoBytes(nonce), additionalData: cryptoBytes(aad) },
        this.key,
        cryptoBytes(plaintext),
      ),
    );
    // GCM output is ciphertext||tag; the contract separates the final 16 bytes.
    const tag = blob.slice(blob.length - 16);
    const body = blob.slice(0, blob.length - 16);
    return { ciphertext: toBase64Url(body), nonce: toBase64Url(nonce), tag: toBase64Url(tag) };
  }

  async decrypt(envelope: EncryptedEnvelope, aad: Uint8Array): Promise<Uint8Array> {
    const blob = new Uint8Array([...fromBase64Url(envelope.ciphertext), ...fromBase64Url(envelope.tag)]);
    return new Uint8Array(
      await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: cryptoBytes(fromBase64Url(envelope.nonce)),
          additionalData: cryptoBytes(aad),
        },
        this.key,
        cryptoBytes(blob),
      ),
    );
  }
}

/** Encrypt a JSON payload into a contract-shaped mutation envelope. */
export async function buildMutationEnvelope(
  cipher: TestEnvelopeCipher,
  fields: {
    mutation_id: string;
    vault_id: string;
    device_id: string;
    entity_type: MutationEnvelope['entity_type'];
    entity_id: string;
    operation: MutationEnvelope['operation'];
    changed_fields: string[];
    payload: unknown;
  },
  clock: MutationEnvelope['clock'],
): Promise<MutationEnvelope> {
  const aad = new TextEncoder().encode(`${fields.vault_id}:${fields.entity_id}:${fields.mutation_id}`);
  const envelope = await cipher.encrypt(new TextEncoder().encode(JSON.stringify(fields.payload)), aad);
  return {
    mutation_id: fields.mutation_id,
    vault_id: fields.vault_id,
    device_id: fields.device_id,
    clock,
    entity_type: fields.entity_type,
    entity_id: fields.entity_id,
    operation: fields.operation,
    base_version: 0,
    changed_fields: fields.changed_fields,
    ciphertext: `${envelope.nonce}.${envelope.tag}.${envelope.ciphertext}`,
  };
}

/** Parse the opaque ciphertext field of a mutation envelope back into parts. */
export function splitEnvelopeCiphertext(ciphertext: string): EncryptedEnvelope {
  const [nonce, tag, body] = ciphertext.split('.');
  if (!nonce || !tag || !body) throw new Error('malformed envelope ciphertext');
  return { ciphertext: body, nonce, tag };
}

/**
 * P-256 ECDH wrapper (T075 boundary): a vault key is wrapped with an ephemeral
 * shared secret so only the paired device's private key can unwrap it. The
 * contract's WrappedKeyBlob carries the full GCM blob (ciphertext||tag) in
 * `ciphertext`.
 */
export class TestDeviceKeyWrapper {
  static readonly algorithm = 'ECDH-P256' as const;

  async generateKeyPair(): Promise<CryptoKeyPair> {
    return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  }

  async wrapVaultKey(vaultKey: Uint8Array, peerPublicKey: CryptoKey): Promise<WrappedKeyBlob> {
    const ephemeral = await this.generateKeyPair();
    const shared = await this.deriveSharedBits(ephemeral.privateKey, peerPublicKey);
    const key = await subtle.importKey('raw', cryptoBytes(shared), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const blob = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv: cryptoBytes(nonce) }, key, cryptoBytes(vaultKey)),
    );
    return {
      keyVersion: 1,
      ciphertext: toBase64Url(blob),
      ephemeralPublicKey: toBase64Url(new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey))),
      nonce: toBase64Url(nonce),
    };
  }

  async unwrapVaultKey(wrapped: WrappedKeyBlob, devicePrivateKey: CryptoKey): Promise<Uint8Array> {
    const ephemeralPublic = await subtle.importKey(
      'raw',
      cryptoBytes(fromBase64Url(wrapped.ephemeralPublicKey)),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const shared = await this.deriveSharedBits(devicePrivateKey, ephemeralPublic);
    const key = await subtle.importKey('raw', cryptoBytes(shared), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    return new Uint8Array(
      await subtle.decrypt(
        { name: 'AES-GCM', iv: cryptoBytes(fromBase64Url(wrapped.nonce)) },
        key,
        cryptoBytes(fromBase64Url(wrapped.ciphertext)),
      ),
    );
  }

  private deriveSharedBits(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
    return subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256).then((bits) => new Uint8Array(bits));
  }
}
