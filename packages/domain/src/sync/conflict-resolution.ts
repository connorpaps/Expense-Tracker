import type { ConflictResolution, ConflictStatus, MutationOrigin } from '@expense-tracker/contracts';
import type { Db } from '../storage/schema';
import { getConflict } from '../storage/repository';
import { appendMutation, findMutation, nextMutationClock } from './mutation-log';
import type { MutationLogRow } from './mutation-log';

export interface ResolveConflictInput {
  conflictId: string;
  vaultId: string;
  resolution: ConflictResolution;
  deviceId: string;
  origin: MutationOrigin;
  now: string;
  /** Required for manual_edit and keep_both; must already be encrypted by the caller. */
  manualCiphertext?: string;
}

export interface ConflictResolutionResult {
  conflictId: string;
  vaultId: string;
  resolution: ConflictResolution;
  status: ConflictStatus;
  resolvedValues: string;
  mutation: MutationLogRow;
}

function statusFor(resolution: ConflictResolution): ConflictStatus {
  switch (resolution) {
    case 'keep_local':
      return 'resolved_local';
    case 'keep_remote':
      return 'resolved_remote';
    case 'manual_edit':
      return 'resolved_manual';
    case 'keep_both':
      return 'resolved_both';
  }
}

function selectedCiphertext(
  resolution: ConflictResolution,
  localCandidate: string,
  remoteCandidate: string,
  manualCiphertext?: string,
): string {
  if (resolution === 'keep_local') return localCandidate;
  if (resolution === 'keep_remote') return remoteCandidate;
  if (resolution === 'manual_edit') {
    if (!manualCiphertext?.trim()) throw new Error('Manual conflict resolution requires an encrypted value.');
    return manualCiphertext;
  }
  if (!manualCiphertext?.trim()) throw new Error('Keep-both conflict resolution requires an encrypted merged value.');
  return manualCiphertext;
}

/**
 * Resolve one open conflict without decrypting candidate values. The selected
 * encrypted payload is recorded as a deterministic mutation so a retry is a
 * no-op and other clients can apply the resolution after decrypting locally.
 */
export async function resolveConflict(
  db: Db,
  input: ResolveConflictInput,
): Promise<ConflictResolutionResult> {
  const mutationId = `resolve-conflict-${input.conflictId}`;
  return db.transaction(async (transactionDb) => {
    const conflict = await getConflict(transactionDb, input.vaultId, input.conflictId);
    if (!conflict) throw new Error('The selected conflict does not exist in this vault.');

    const existingMutation = await findMutation(transactionDb, input.vaultId, mutationId);
    if (existingMutation) {
      if (conflict.status === 'open') {
        throw new Error('The conflict resolution mutation exists but the conflict is still open.');
      }
      const previousResolution = statusToResolution(conflict.status);
      if (previousResolution !== input.resolution) {
        throw new Error('This conflict has already been resolved with a different choice.');
      }
      return {
        conflictId: conflict.id,
        vaultId: conflict.vault_id,
        resolution: previousResolution,
        status: conflict.status,
        resolvedValues: conflict.resolved_values ?? existingMutation.ciphertext,
        mutation: existingMutation,
      };
    }
    if (conflict.status !== 'open') throw new Error('This conflict has already been resolved.');

    const resolvedValues = selectedCiphertext(
      input.resolution,
      conflict.local_values,
      conflict.remote_values,
      input.manualCiphertext,
    );
    const status = statusFor(input.resolution);
    const update = await transactionDb.exec(
      'UPDATE conflicts SET status = ?, resolved_values = ?, resolved_at = ? WHERE vault_id = ? AND id = ? AND status = \'open\'',
      [status, resolvedValues, input.now, input.vaultId, input.conflictId],
    );
    if (update.changes !== 1) throw new Error('The conflict was resolved by another local change.');
    const mutation = await appendMutation(transactionDb, {
      mutationId,
      vaultId: input.vaultId,
      deviceId: input.deviceId,
      clock: await nextMutationClock(transactionDb, input.vaultId, input.deviceId),
      entityType: 'conflict',
      entityId: input.conflictId,
      operation: 'update',
      baseVersion: 0,
      changedFields: ['resolution', 'status'],
      ciphertext: resolvedValues,
      origin: input.origin,
      now: input.now,
    });

    return {
      conflictId: conflict.id,
      vaultId: conflict.vault_id,
      resolution: input.resolution,
      status,
      resolvedValues,
      mutation,
    };
  });
}

function statusToResolution(status: ConflictStatus): ConflictResolution {
  switch (status) {
    case 'resolved_local':
      return 'keep_local';
    case 'resolved_remote':
      return 'keep_remote';
    case 'resolved_manual':
      return 'manual_edit';
    case 'resolved_both':
      return 'keep_both';
    case 'open':
      throw new Error('An open conflict has no completed resolution.');
  }
}
