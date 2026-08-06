/**
 * Mutation and synchronization contract types, per
 * specs/001-local-expense-tracker/contracts/api.md. Payloads are application-
 * layer encrypted envelopes; the relay MUST NOT need to read their contents.
 */

export type EntityType =
  | 'vault'
  | 'category'
  | 'transaction'
  | 'statement_import'
  | 'categorization_rule'
  | 'conflict';

export type MutationOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'merge'
  | 'import_commit'
  | 'rule_update'
  | 'category_update';

export type MutationOrigin = 'web' | 'ios' | 'relay' | 'importer';

export type MutationStatus =
  | 'pending'
  | 'exchanged'
  | 'applied'
  | 'conflict'
  | 'failed'
  | 'disconnected';

/** Lamport clock value. */
export type Lamport = number;
/** Vector clock: device_id -> counter. */
export type VectorClock = Record<string, number>;
/** Known-clock checkpoint used by exchange requests/responses. */
export type KnownClock = VectorClock;

export interface MutationClock {
  lamport: Lamport;
  vector: VectorClock;
}

/** An immutable mutation envelope exchanged between paired devices. */
export interface MutationEnvelope {
  mutation_id: string;
  vault_id: string;
  device_id: string;
  clock: MutationClock;
  entity_type: EntityType;
  entity_id: string;
  operation: MutationOperation;
  base_version: number;
  changed_fields: string[];
  /** AES-GCM-encrypted changed fields; base64url. */
  ciphertext: string;
}

export interface SyncExchangeRequest {
  vault_id: string;
  device_id: string;
  known_clock: KnownClock;
  requested_limit: number;
  /** Opaque mutations uploaded by this device in the same idempotent batch. */
  mutations?: MutationEnvelope[];
  batch_id: string;
  oldest_pending_mutation_id: string | null;
  /** Bearer token issued by the relay pairing authority; required in secure mode. */
  authorization_token?: string;
}

export interface SyncExchangeResponse {
  vault_id: string;
  mutations: MutationEnvelope[];
  checkpoint: KnownClock;
  has_more: boolean;
  /** True when this request batch was already processed by the relay. */
  replay: boolean;
  /** Mutation IDs rejected because the same ID carried different contents. */
  conflicting_mutation_ids: string[];
  /** Mutation IDs not accepted because the relay batch limit was exceeded. */
  rejected_mutation_ids: string[];
}

/** Create a causal after-relation between two clocks. */
export function clockHappenedBefore(a: MutationClock, b: MutationClock): boolean {
  const aLamport = a.lamport < b.lamport;
  const sameLamport = a.lamport === b.lamport;
  const ids = new Set([...Object.keys(a.vector), ...Object.keys(b.vector)]);
  for (const deviceId of ids) {
    const aCount = a.vector[deviceId] ?? 0;
    const bCount = b.vector[deviceId] ?? 0;
    if (aCount > bCount) return false;
  }
  return aLamport || (sameLamport && JSON.stringify(a.vector) !== JSON.stringify(b.vector));
}

/** True when neither clock happened before the other (concurrent edits). */
export function clocksAreConcurrent(a: MutationClock, b: MutationClock): boolean {
  return !clockHappenedBefore(a, b) && !clockHappenedBefore(b, a);
}
