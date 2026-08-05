import type { KnownClock, SyncExchangeRequest, SyncExchangeResponse } from './mutation';

/**
 * Pairing contract. Pairing is single-use, short-lived, and requires explicit
 * confirmation on both devices in a foreground session.
 */
export interface PairingStart {
  vault_id: string;
  initiating_device_id: string;
  pairing_code: string;
  expires_at: string;
  capabilities: Array<'read' | 'write' | 'import' | 'export'>;
}

export interface PairingAccept {
  vault_id: string;
  accepting_device_id: string;
  pairing_code: string;
  /** Authenticated one-time public key exchange. */
  accepting_public_key: string;
}

export interface PairingConfirmed {
  vault_id: string;
  paired_device_id: string;
  display_name: string;
  key_version: number;
  /** Device-specific wrapped vault key; never plaintext. */
  wrapped_vault_key: string;
}

export interface RevokeDeviceRequest {
  vault_id: string;
  paired_device_id: string;
}

/**
 * Snapshot bootstrap contract for a newly paired device. The currently
 * authorized initiating client is the snapshot authority; the relay only routes
 * opaque encrypted chunks.
 */
export interface SnapshotManifest {
  snapshot_id: string;
  vault_id: string;
  device_id: string;
  key_version: number;
  created_at: string;
  /** Total chunks for resumable bootstrap. */
  total_chunks: number;
  /** sha-256 over the concatenated decrypted chunks. */
  checksum: string;
  snapshot_checkpoint: KnownClock;
  signature: string;
}

export interface SnapshotChunk {
  snapshot_id: string;
  chunk_index: number;
  encrypted_chunk: string;
}

export interface BootstrapRequest {
  vault_id: string;
  device_id: string;
  known_chunks: number[];
}

export interface BootstrapStatus {
  vault_id: string;
  snapshot_id: string;
  received_chunks: number;
  total_chunks: number;
  has_more: boolean;
  signature_valid: boolean;
}

/** Generic peer-exchange wire message for the local relay transport. */
export type RelayMessage =
  | { type: 'sync_exchange_request'; request: SyncExchangeRequest }
  | { type: 'sync_exchange_response'; response: SyncExchangeResponse }
  | { type: 'bootstrap_request'; request: BootstrapRequest }
  | { type: 'bootstrap_chunk'; chunk: SnapshotChunk }
  | { type: 'bootstrap_status'; status: BootstrapStatus }
  | { type: 'pairing_start'; pairing: PairingStart }
  | { type: 'pairing_accept'; pairing: PairingAccept }
  | { type: 'pairing_confirmed'; pairing: PairingConfirmed }
  | { type: 'revoke_device'; request: RevokeDeviceRequest }
  | { type: 'pong' };
