import type {
  EntityType,
  MutationClock,
  MutationOperation,
  MutationOrigin,
} from '@expense-tracker/contracts';
import type { Db } from '../storage/schema';
import { appendMutation, findMutation, nextMutationClock } from '../sync/mutation-log';

export interface TransactionMutationInput {
  mutationId: string;
  vaultId: string;
  deviceId: string;
  clock?: MutationClock;
  entityId: string;
  operation: MutationOperation;
  changedFields: string[];
  ciphertext: string;
  origin: MutationOrigin;
  now: string;
  baseVersion?: number;
  apply: (db: Db) => Promise<void>;
}

/**
 * Durable local-write boundary for transaction changes. The mutation is
 * appended before the row change inside one SQL transaction; a failed row
 * write rolls both parts back, so the sync log cannot describe a change that
 * was never applied locally.
 */
export async function persistTransactionMutation(
  db: Db,
  input: TransactionMutationInput,
): Promise<void> {
  await db.transaction(async (transactionDb) => {
    const existing = await findMutation(transactionDb, input.vaultId, input.mutationId);
    if (existing) return;
    await appendMutation(transactionDb, {
      mutationId: input.mutationId,
      vaultId: input.vaultId,
      deviceId: input.deviceId,
      clock: input.clock ?? await nextMutationClock(transactionDb, input.vaultId, input.deviceId),
      entityType: 'transaction' satisfies EntityType,
      entityId: input.entityId,
      operation: input.operation,
      baseVersion: input.baseVersion ?? 0,
      changedFields: input.changedFields,
      ciphertext: input.ciphertext,
      origin: input.origin,
      now: input.now,
    });
    await input.apply(transactionDb);
  });
}
