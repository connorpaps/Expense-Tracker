import type {
  MutationEnvelope,
  MutationOrigin,
  SyncExchangeResponse,
} from '@expense-tracker/contracts';
import {
  applyRemoteMutation,
  computeCheckpoint,
  appendMutation,
  findMutation,
  listFailedMutations,
  listPendingMutations,
  isProjectableRemoteMutation,
  markExchanged,
  markFailed,
  markLocalOnly,
} from '@expense-tracker/domain';
import type { Db, MutationLogRow, RemoteMutationPayload } from '@expense-tracker/domain';
import { RelayClient } from './relay-client';

export interface WebSyncConfig {
  relayUrl: string;
  deviceId: string;
  authorizationToken?: string;
  requestedLimit?: number;
}

export interface DecodedRemoteMutation {
  payload: RemoteMutationPayload;
  origin?: MutationOrigin;
}

export function mutationEnvelopeContext(
  input: Pick<
    MutationEnvelope,
    | 'mutation_id'
    | 'vault_id'
    | 'entity_type'
    | 'entity_id'
    | 'operation'
    | 'base_version'
    | 'changed_fields'
  >,
): string {
  return JSON.stringify({
    mutation_id: input.mutation_id,
    vault_id: input.vault_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    operation: input.operation,
    base_version: input.base_version,
    changed_fields: [...input.changed_fields].sort(),
  });
}

export interface RemoteMutationDecoderOptions {
  decrypt: (ciphertext: string, context: string) => Promise<unknown>;
}

/** Decode complete same-browser transaction envelopes. Action-only payloads
 * remain rejected by the domain projection validator instead of being guessed. */
export function createLocalMutationDecoder(
  options: RemoteMutationDecoderOptions,
): RemoteMutationDecoder {
  return async (mutation) => {
    const decoded = await options.decrypt(mutation.ciphertext, mutationEnvelopeContext(mutation));
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'entity' in decoded &&
      'value' in decoded
    ) {
      // The local browser key proves same-origin decryption, not the remote
      // device's platform identity. Do not derive last_modified_by from relay
      // metadata until authenticated device records are wired into the decoder.
      return { payload: decoded as RemoteMutationPayload };
    }
    throw new Error(
      `Remote ${mutation.entity_type} mutation does not contain a complete projection payload.`,
    );
  };
}

export type RemoteMutationDecoder = (mutation: MutationEnvelope) => Promise<DecodedRemoteMutation>;

export interface SyncResult {
  status: 'relay_accepted' | 'partial' | 'failed';
  uploaded: number;
  acknowledged: number;
  applied: number;
  /** Number of local envelopes durably accepted by the relay. */
  relayAccepted: number;
  /** Number of remote envelopes committed into this vault projection. */
  projectionApplied: number;
  unsupported: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  remoteFailures: number;
  pending: number;
  checkpoint: Record<string, number>;
  response: SyncExchangeResponse | null;
  errors: string[];
}

function isWebProjectableEnvelope(mutation: MutationLogRow): boolean {
  if (!isProjectableRemoteMutation(mutation.entity_type, mutation.operation)) return false;
  if (mutation.entity_type === 'transaction' && mutation.operation === 'update') {
    return mutation.changed_fields.every((field) =>
      [
        'occurred_on',
        'merchant_display',
        'amount_minor',
        'category_id',
        'category_source',
        'category_confidence',
        'note',
        'review_state',
      ].includes(field),
    );
  }
  if (mutation.entity_type === 'transaction' && mutation.operation === 'delete') {
    return mutation.changed_fields.length === 1 && mutation.changed_fields[0] === 'deleted_at';
  }
  if (mutation.entity_type === 'category' && mutation.operation === 'merge') {
    return (
      mutation.changed_fields.includes('category_id') &&
      mutation.changed_fields.includes('is_active')
    );
  }
  return true;
}

function asEnvelope(row: MutationLogRow): MutationEnvelope {
  return {
    mutation_id: row.id,
    vault_id: row.vault_id,
    device_id: row.device_id,
    clock: row.clock,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    base_version: row.base_version,
    changed_fields: row.changed_fields,
    ciphertext: row.ciphertext,
  };
}

function now(): string {
  return new Date().toISOString();
}

function sameEnvelope(row: MutationLogRow, envelope: MutationEnvelope): boolean {
  return (
    row.vault_id === envelope.vault_id &&
    row.entity_type === envelope.entity_type &&
    row.entity_id === envelope.entity_id &&
    row.operation === envelope.operation &&
    row.base_version === envelope.base_version &&
    row.device_id === envelope.device_id &&
    row.clock.lamport === envelope.clock.lamport &&
    canonicalVector(row.clock.vector) === canonicalVector(envelope.clock.vector) &&
    JSON.stringify([...row.changed_fields].sort()) ===
      JSON.stringify([...envelope.changed_fields].sort()) &&
    row.ciphertext === envelope.ciphertext
  );
}

function canonicalVector(vector: Record<string, number>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(vector).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function asAppendInput(envelope: MutationEnvelope, origin: MutationOrigin = 'relay') {
  return {
    mutationId: envelope.mutation_id,
    vaultId: envelope.vault_id,
    deviceId: envelope.device_id,
    clock: envelope.clock,
    entityType: envelope.entity_type,
    entityId: envelope.entity_id,
    operation: envelope.operation,
    baseVersion: envelope.base_version,
    changedFields: envelope.changed_fields,
    ciphertext: envelope.ciphertext,
    origin,
    now: now(),
  } as const;
}

/**
 * Perform one foreground exchange. The relay only acknowledges opaque
 * envelopes; remote projection is acknowledged by this service only after the
 * supplied decoder and domain projection both succeed.
 */
export async function syncOnce(
  db: Db,
  vaultId: string,
  config: WebSyncConfig,
  decodeRemote?: RemoteMutationDecoder,
  client = new RelayClient({ url: config.relayUrl }),
): Promise<SyncResult> {
  const pending = await listPendingMutations(db, vaultId);
  const projectablePending = pending.filter(isWebProjectableEnvelope);
  const unsupportedPending = pending.filter((mutation) => !isWebProjectableEnvelope(mutation));
  for (const mutation of unsupportedPending) {
    await markLocalOnly(db, vaultId, mutation.id, 'WEB_PROJECTION_UNSUPPORTED');
  }
  const uploaded = projectablePending.map(asEnvelope);
  const failedRemote = await listFailedMutations(db, vaultId);
  const remoteRetries = failedRemote.filter((mutation) => mutation.origin === 'relay');
  const checkpoint = await computeCheckpoint(db, vaultId);
  const batchId = crypto.randomUUID();
  const result: SyncResult = {
    status: 'failed',
    uploaded: uploaded.length,
    acknowledged: 0,
    applied: 0,
    relayAccepted: 0,
    projectionApplied: 0,
    unsupported: unsupportedPending.length,
    duplicates: 0,
    conflicts: 0,
    rejected: 0,
    remoteFailures: 0,
    pending: pending.length,
    checkpoint,
    response: null,
    errors: [],
  };

  if (decodeRemote) {
    for (const failed of remoteRetries) {
      try {
        const envelope = asEnvelope(failed);
        const decoded = await decodeRemote(envelope);
        const applied = await applyRemoteMutation(
          {
            vaultId,
            mutation: asAppendInput(envelope, 'relay'),
            payload: decoded.payload,
            projectionOrigin: decoded.origin,
          },
          db,
        );
        if (applied.kind === 'applied') {
          result.applied += 1;
          result.projectionApplied += 1;
        }
      } catch (cause) {
        result.remoteFailures += 1;
        result.errors.push(
          cause instanceof Error
            ? cause.message
            : `Remote mutation ${failed.id} could not be retried.`,
        );
      }
    }
  }

  if (unsupportedPending.length > 0) {
    result.errors.push(
      `${unsupportedPending.length} local change${unsupportedPending.length === 1 ? '' : 's'} remain local-only because this web projection cannot safely exchange that operation.`,
    );
  }

  let response: SyncExchangeResponse;
  try {
    response = await client.exchange({
      vault_id: vaultId,
      device_id: config.deviceId,
      known_clock: checkpoint,
      requested_limit: Math.min(Math.max(config.requestedLimit ?? 100, 1), 1_000),
      mutations: uploaded,
      batch_id: batchId,
      oldest_pending_mutation_id: pending[0]?.id ?? null,
      authorization_token: config.authorizationToken,
    });
    result.response = response;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Relay exchange failed.';
    result.errors.push(message);
    await Promise.all(
      projectablePending.map((mutation) =>
        markFailed(db, vaultId, mutation.id, 'RELAY_UNAVAILABLE'),
      ),
    );
    result.pending = await listPendingMutations(db, vaultId).then((rows) => rows.length);
    return result;
  }

  const conflicting = new Set(response.conflicting_mutation_ids);
  const rejected = new Set(response.rejected_mutation_ids);
  const accepted = new Set(response.accepted_mutation_ids ?? []);
  result.conflicts = conflicting.size;
  result.rejected = rejected.size;

  for (const mutation of projectablePending) {
    if (conflicting.has(mutation.id)) {
      await markFailed(db, vaultId, mutation.id, 'RELAY_MUTATION_CONFLICT');
      result.errors.push(`Relay reported a conflicting mutation id: ${mutation.id}.`);
      continue;
    }
    if (rejected.has(mutation.id)) {
      await markFailed(db, vaultId, mutation.id, 'RELAY_BATCH_LIMIT');
      result.errors.push(
        `Relay rejected mutation ${mutation.id} because the batch limit was exceeded.`,
      );
      continue;
    }
    // A response is not an acknowledgement by itself: only the relay's
    // explicit accepted_mutation_ids permit a local queue transition.
    if (!accepted.has(mutation.id)) {
      await markFailed(db, vaultId, mutation.id, 'RELAY_ACK_MISSING');
      result.errors.push(
        `Relay did not acknowledge mutation ${mutation.id}; it remains retryable.`,
      );
      continue;
    }
    await markExchanged(db, vaultId, mutation.id);
    result.acknowledged += 1;
    result.relayAccepted += 1;
  }

  for (const envelope of response.mutations) {
    const existing = await findMutation(db, vaultId, envelope.mutation_id);
    if (existing && !sameEnvelope(existing, envelope)) {
      result.remoteFailures += 1;
      result.errors.push(
        `Remote mutation ${envelope.mutation_id} conflicts with a different local envelope.`,
      );
      continue;
    }
    if (existing && existing.status === 'applied') {
      result.duplicates += 1;
      continue;
    }
    if (!decodeRemote) {
      if (!existing) {
        await appendMutation(db, asAppendInput(envelope));
        await markFailed(db, vaultId, envelope.mutation_id, 'REMOTE_DECODER_UNAVAILABLE');
      }
      result.remoteFailures += 1;
      result.errors.push(
        `Remote mutation ${envelope.mutation_id} was received but no vault-key decoder is configured.`,
      );
      continue;
    }
    try {
      const decoded = await decodeRemote(envelope);
      const applied = await applyRemoteMutation(
        {
          vaultId,
          mutation: {
            mutationId: envelope.mutation_id,
            vaultId: envelope.vault_id,
            deviceId: envelope.device_id,
            clock: envelope.clock,
            entityType: envelope.entity_type,
            entityId: envelope.entity_id,
            operation: envelope.operation,
            baseVersion: envelope.base_version,
            changedFields: envelope.changed_fields,
            ciphertext: envelope.ciphertext,
            origin: 'relay',
            now: now(),
          },
          payload: decoded.payload,
          projectionOrigin: decoded.origin,
        },
        db,
      );
      if (applied.kind === 'applied') {
        result.applied += 1;
        result.projectionApplied += 1;
      }
      if (applied.kind === 'duplicate') result.duplicates += 1;
      if (applied.kind === 'conflict') result.conflicts += 1;
    } catch (cause) {
      if (!existing) {
        await appendMutation(db, asAppendInput(envelope));
        await markFailed(db, vaultId, envelope.mutation_id, 'REMOTE_PROJECTION_FAILED');
      } else if (existing.status !== 'failed') {
        await markFailed(db, vaultId, envelope.mutation_id, 'REMOTE_PROJECTION_FAILED');
      }
      result.remoteFailures += 1;
      result.errors.push(
        cause instanceof Error
          ? cause.message
          : `Remote mutation ${envelope.mutation_id} could not be applied.`,
      );
    }
  }

  result.checkpoint = await computeCheckpoint(db, vaultId);
  result.pending = await listPendingMutations(db, vaultId).then((rows) => rows.length);
  result.status =
    result.errors.length > 0
      ? 'partial'
      : result.pending === 0 && result.relayAccepted > 0
        ? 'relay_accepted'
        : 'partial';
  return result;
}
