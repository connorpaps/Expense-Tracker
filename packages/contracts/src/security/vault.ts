/** Platform-neutral vault lifecycle contracts. Adapters provide actual key storage and cryptography. */

import type { EncryptedEnvelope, KeyStore, SnapshotSigner, VaultKeyMaterial } from './crypto';

export interface VaultSnapshotManifest {
  vaultId: string;
  keyVersion: number;
  schemaVersion: number;
  checkpoint: Record<string, number>;
  payloadHash: string;
}

export interface AuthenticatedSnapshot {
  manifest: VaultSnapshotManifest;
  payload: EncryptedEnvelope;
  signature: string;
}

export interface VaultSecurityAdapter {
  readonly keyStore: KeyStore;
  readonly signer: SnapshotSigner;
  createVaultKey(): Promise<VaultKeyMaterial>;
  loadVaultKey(vaultId: string): Promise<VaultKeyMaterial | null>;
  rotateVaultKey(vaultId: string): Promise<VaultKeyMaterial>;
  lock(vaultId: string): Promise<void>;
  unlock(vaultId: string): Promise<VaultKeyMaterial>;
  createSnapshot(vaultId: string, manifest: VaultSnapshotManifest, plaintext: Uint8Array): Promise<AuthenticatedSnapshot>;
  verifySnapshot(snapshot: AuthenticatedSnapshot, publicKey: Uint8Array): Promise<boolean>;
}

export const SECURITY_DESIGN = {
  envelope: 'AES-256-GCM',
  keyDerivation: 'HKDF-SHA-256',
  deviceWrapping: 'ECDH-P256',
  snapshotSigning: 'ECDSA-P256-SHA-256',
  recovery: 'explicit encrypted export; no escrowed recovery key',
} as const;
