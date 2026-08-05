/**
 * Platform-neutral security interfaces (T012). Concrete implementations live in
 * platform adapters: WebCrypto in the browser, CryptoKit/Keychain on iOS, and
 * node:crypto in the relay tests. This package never touches real key material.
 */

/**
 * AES-256-GCM payload encryption.
 * `aad` binds the ciphertext to its context (e.g. vault id + entity id).
 */
export interface EnvelopeCipher {
  readonly algorithm: 'AES-256-GCM';
  encrypt(plaintext: Uint8Array, aad: Uint8Array): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope, aad: Uint8Array): Promise<Uint8Array>;
}

export interface EncryptedEnvelope {
  /** base64url ciphertext. */
  ciphertext: string;
  /** base64url 12-byte nonce/IV. */
  nonce: string;
  /** base64url 16-byte authentication tag. */
  tag: string;
}

/** P-256 ECDH device wrapping of a vault key. */
export interface DeviceKeyWrapper {
  readonly algorithm: 'ECDH-P256';
  generateKeyPair(): Promise<DeviceKeyPair>;
  /** Wrap a vault key for a paired device's public key. */
  wrapForDevice(devicePublicKey: Uint8Array, vaultKey: Uint8Array): Promise<WrappedKeyBlob>;
  /** Unwrap a device-specific wrapped vault key using this device's private key. */
  unwrapFromDevice(devicePrivateKey: Uint8Array, wrapped: WrappedKeyBlob): Promise<Uint8Array>;
}

export interface DeviceKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface WrappedKeyBlob {
  keyVersion: number;
  /** base64url encrypted vault key. */
  ciphertext: string;
  /** base64url ephemeral public key used for ECDH. */
  ephemeralPublicKey: string;
  /** base64url nonce. */
  nonce: string;
}

/** P-256 ECDSA authenticated snapshot signatures. */
export interface SnapshotSigner {
  readonly algorithm: 'ECDSA-P256';
  sign(payload: Uint8Array, privateKey: Uint8Array): Promise<string>;
  verify(payload: Uint8Array, publicKey: Uint8Array, signature: string): Promise<boolean>;
}

/** Platform-protected key storage (Keychain on iOS, browser protected storage). */
export interface KeyStore {
  /** Persist a secret under a logical name. */
  save(name: string, material: Uint8Array): Promise<void>;
  load(name: string): Promise<Uint8Array | null>;
  delete(name: string): Promise<void>;
}

export interface VaultKeyMaterial {
  keyVersion: number;
  /** 32-byte vault encryption key. */
  key: Uint8Array;
  /** Wrapped copies for each authorized paired device. */
  wrappedForDevices: WrappedKeyBlob[];
  /** Key versions retained for historical records, in descending order. */
  historicalVersions: number[];
}

export const VAULT_KEY_BYTES = 32;
export const SNAPSHOT_SIGNING_KEY_NAME = 'snapshot-signing-key';
export const VAULT_KEY_PREFIX = 'vault-key';
