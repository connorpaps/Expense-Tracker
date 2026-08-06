import type { KnownClock, SyncExchangeRequest, SyncExchangeResponse } from './mutation';

export type PairingCapabilities = Array<'read' | 'write' | 'import' | 'export'>;

export interface PairingStart {
  vault_id: string;
  initiating_device_id: string;
  initiating_public_key: string;
  capabilities: PairingCapabilities;
  /** Required only for first-device enrollment; never persisted or echoed. */
  enrollment_secret: string;
  /** Existing authority token when adding a device to an already paired vault. */
  authorization_token?: string;
}

export interface PairingChallenge {
  session_id: string;
  vault_id: string;
  pairing_code: string;
  challenge: string;
  expires_at: string;
}

export interface PairingStartProof {
  session_id: string;
  signature: string;
}

export interface PairingAccept {
  session_id: string;
  pairing_code: string;
  accepting_device_id: string;
  accepting_public_key: string;
  capabilities: PairingCapabilities;
  /** Signature over the server challenge and accepting device identity. */
  proof: string;
}

export interface PairingAccepted {
  session_id: string;
  vault_id: string;
  accepting_device_id: string;
  accepting_public_key: string;
}

export interface PairingConfirm {
  session_id: string;
  /** Existing authority token, supplied only when reusing an already-paired initiator. */
  authorization_token?: string;
  key_version: number;
  /** Device-specific wrapped vault key; never plaintext. */
  wrapped_vault_key: string;
  /** Signature by the initiating device over the wrapped-key context. */
  signature: string;
}

export interface PairingComplete {
  session_id: string;
  vault_id: string;
  device_id: string;
  peer_device_id: string;
  authorization_token: string;
  key_version: number;
  /** Present only on the accepting device's socket. */
  wrapped_vault_key?: string;
}

export interface RevokeDeviceRequest {
  vault_id: string;
  paired_device_id: string;
  authorization_token: string;
}

export interface SnapshotManifest {
  snapshot_id: string;
  vault_id: string;
  device_id: string;
  key_version: number;
  created_at: string;
  total_chunks: number;
  checksum: string;
  snapshot_checkpoint: KnownClock;
  signature: string;
}

export interface SnapshotChunk {
  vault_id: string;
  device_id: string;
  snapshot_id: string;
  chunk_index: number;
  encrypted_chunk: string;
  authorization_token: string;
}

export interface BootstrapRequest {
  vault_id: string;
  device_id: string;
  authorization_token: string;
  known_chunks: number[];
}

export interface BootstrapStatus {
  vault_id: string;
  device_id: string;
  snapshot_id: string;
  received_chunks: number;
  total_chunks: number;
  has_more: boolean;
  signature_valid: boolean;
  authorization_token: string;
}

/** Canonical bytes-to-sign context shared by relay and platform clients. */
export function pairingIdentityProofContext(input: {
  role: 'initiator' | 'accepting';
  session_id: string;
  vault_id: string;
  challenge: string;
  device_id: string;
  capabilities: readonly string[];
}): string {
  return [input.session_id, input.vault_id, input.challenge, input.role, input.device_id, [...input.capabilities].sort().join(',')].join('|');
}

/** Canonical context for the initiating device's wrapped-key confirmation. */
export function pairingWrappedKeyProofContext(input: {
  session_id: string;
  vault_id: string;
  challenge: string;
  accepting_device_id: string;
  key_version: number;
  wrapped_vault_key: string;
}): string {
  return [input.session_id, input.vault_id, input.challenge, 'wrapped', input.accepting_device_id, input.key_version, input.wrapped_vault_key].join('|');
}

export type RelayMessage =
  | { type: 'sync_exchange_request'; request: SyncExchangeRequest }
  | { type: 'sync_exchange_response'; response: SyncExchangeResponse }
  | { type: 'bootstrap_request'; request: BootstrapRequest }
  | { type: 'bootstrap_chunk'; chunk: SnapshotChunk }
  | { type: 'bootstrap_status'; status: BootstrapStatus }
  | { type: 'pairing_start'; pairing: PairingStart }
  | { type: 'pairing_challenge'; pairing: PairingChallenge }
  | { type: 'pairing_start_proof'; proof: PairingStartProof }
  | { type: 'pairing_accept'; pairing: PairingAccept }
  | { type: 'pairing_accepted'; pairing: PairingAccepted }
  | { type: 'pairing_confirm'; pairing: PairingConfirm }
  | { type: 'pairing_complete'; pairing: PairingComplete }
  | { type: 'revoke_device'; request: RevokeDeviceRequest }
  | { type: 'relay_ack'; envelope_id: string | null; replay: boolean }
  | { type: 'relay_error'; code: string }
  | { type: 'pong' };
