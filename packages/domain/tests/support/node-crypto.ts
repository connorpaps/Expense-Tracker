import type {
  DeviceKeyPair,
  DeviceKeyWrapper,
  EncryptedEnvelope,
  EnvelopeCipher,
  SnapshotSigner,
  WrappedKeyBlob,
} from '@expense-tracker/contracts';

const subtle = globalThis.crypto.subtle;

const b64 = (bytes: Uint8Array) => {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64 = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  // Tolerate unpadded base64url (padding stripped by b64() above).
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/** Test-only AES-256-GCM implementation carrying an explicit key. */
export class NodeEnvelopeCipher implements EnvelopeCipher {
  readonly algorithm = 'AES-256-GCM' as const;

  constructor(private readonly key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error('AES-256-GCM requires a 32-byte key');
  }

  async encrypt(plaintext: Uint8Array, aad: Uint8Array): Promise<EncryptedEnvelope> {
    const key = await subtle.importKey('raw', this.key, 'AES-GCM', false, ['encrypt']);
    const nonce = new Uint8Array(12);
    globalThis.crypto.getRandomValues(nonce);
    const encrypted = await subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      key,
      plaintext,
    );
    const blob = new Uint8Array(encrypted);
    // GCM appends the 16-byte tag to the ciphertext; split it out.
    return {
      ciphertext: b64(blob.subarray(0, blob.byteLength - 16)),
      nonce: b64(nonce),
      tag: b64(blob.subarray(blob.byteLength - 16)),
    };
  }

  async decrypt(envelope: EncryptedEnvelope, aad: Uint8Array): Promise<Uint8Array> {
    const key = await subtle.importKey('raw', this.key, 'AES-GCM', false, ['decrypt']);
    const combined = new Uint8Array(
      unb64(envelope.ciphertext).byteLength + unb64(envelope.tag).byteLength,
    );
    combined.set(unb64(envelope.ciphertext), 0);
    combined.set(unb64(envelope.tag), unb64(envelope.ciphertext).byteLength);
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(envelope.nonce), additionalData: aad },
      key,
      combined,
    );
    return new Uint8Array(decrypted);
  }
}

/** Test-only ECDH P-256 device key wrapper using WebCrypto. */
export class NodeDeviceKeyWrapper implements DeviceKeyWrapper {
  readonly algorithm = 'ECDH-P256' as const;

  async generateKeyPair(): Promise<DeviceKeyPair> {
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicKey = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
    const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
    return { publicKey, privateKey };
  }

  async wrapForDevice(devicePublicKey: Uint8Array, vaultKey: Uint8Array): Promise<WrappedKeyBlob> {
    const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const ephemeralPublic = new Uint8Array(await subtle.exportKey('spki', ephemeral.publicKey));
    const peerKey = await subtle.importKey(
      'spki',
      devicePublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: peerKey }, ephemeral.privateKey, 256));
    const aesKey = await deriveWrappingKey(shared, 'expense-tracker-device-wrap');
    const nonce = new Uint8Array(12);
    globalThis.crypto.getRandomValues(nonce);
    // WebCrypto AES-GCM output is ciphertext with the 16-byte tag appended;
    // store it as a single blob so no base64 concatenation is needed.
    const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, vaultKey);
    return {
      keyVersion: 1,
      ciphertext: b64(new Uint8Array(encrypted)),
      ephemeralPublicKey: b64(ephemeralPublic),
      nonce: b64(nonce),
    };
  }

  async unwrapFromDevice(devicePrivateKey: Uint8Array, wrapped: WrappedKeyBlob): Promise<Uint8Array> {
    const privateKey = await subtle.importKey(
      'pkcs8',
      devicePrivateKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const ephemeralPublic = await subtle.importKey(
      'spki',
      unb64(wrapped.ephemeralPublicKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: ephemeralPublic }, privateKey, 256));
    const aesKey = await deriveWrappingKey(shared, 'expense-tracker-device-wrap');
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(wrapped.nonce) },
      aesKey,
      unb64(wrapped.ciphertext),
    );
    return new Uint8Array(decrypted);
  }
}

/** Test-only ECDSA P-256 snapshot signer using WebCrypto. */
export class NodeSnapshotSigner implements SnapshotSigner {
  readonly algorithm = 'ECDSA-P256' as const;

  async generateKeyPair(): Promise<DeviceKeyPair> {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    return {
      publicKey: new Uint8Array(await subtle.exportKey('spki', pair.publicKey)),
      privateKey: new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey)),
    };
  }

  async sign(payload: Uint8Array, privateKey: Uint8Array): Promise<string> {
    const key = await subtle.importKey(
      'pkcs8',
      privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, payload);
    return b64(new Uint8Array(signature));
  }

  async verify(payload: Uint8Array, publicKey: Uint8Array, signature: string): Promise<boolean> {
    const key = await subtle.importKey(
      'spki',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(signature), payload);
  }
}

async function deriveWrappingKey(shared: Uint8Array, infoText: string) {
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(infoText),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function randomVaultKey(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}
