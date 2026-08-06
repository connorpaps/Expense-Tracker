import type { Db } from '../storage/schema';
import { getVault } from '../storage/repository';
import { appendMutation, nextMutationClock } from '../sync/mutation-log';

export interface PrivacyDeletionResult {
  vaultId: string;
  deletedTransactions: number;
  deletedImportRows: number;
  deletedImports: number;
}

/**
 * Remove retained statement/original payloads without removing normalized
 * transactions, import provenance metadata, or learned categorization rules.
 */
export async function deleteStatementOriginals(
  db: Db,
  input: {
    vaultId: string;
    importId?: string;
    now: string;
    mutationDeviceId?: string;
    /** Optional encrypted payload for local mutation-log updates. */
    mutationCiphertext?: string;
  },
): Promise<void> {
  await db.transaction(async (transactionDb) => {
    const importFilter = input.importId ? ' AND id = ?' : '';
    const importParams = input.importId ? [input.vaultId, input.importId] : [input.vaultId];
    const imports = await transactionDb.all<{ id: string }>(
      `SELECT id FROM statement_imports WHERE vault_id = ?${importFilter}`,
      importParams,
    );
    await transactionDb.exec(
      `UPDATE statement_imports SET storage_reference = NULL WHERE vault_id = ?${importFilter}`,
      importParams,
    );

    const transactionFilter = input.importId ? ' AND statement_import_id = ?' : '';
    const transactionParams = input.importId ? [input.vaultId, input.importId] : [input.vaultId];
    const transactions = await transactionDb.all<{ id: string; version: number }>(
      `SELECT id, version FROM transactions WHERE vault_id = ?${transactionFilter}`,
      transactionParams,
    );
    await transactionDb.exec(
      `UPDATE transactions SET original_payload = NULL, updated_at = ?, version = version + 1 WHERE vault_id = ?${transactionFilter}`,
      [input.now, ...transactionParams],
    );

    if (input.mutationCiphertext) {
      const deviceId = input.mutationDeviceId ?? 'web';
      for (const transaction of transactions) {
        await appendMutation(transactionDb, {
          mutationId: `privacy-original-${transaction.id}`,
          vaultId: input.vaultId,
          deviceId,
          clock: await nextMutationClock(transactionDb, input.vaultId, deviceId),
          entityType: 'transaction',
          entityId: transaction.id,
          operation: 'update',
          baseVersion: transaction.version,
          changedFields: ['original_payload'],
          ciphertext: input.mutationCiphertext,
          origin: deviceId === 'ios' ? 'ios' : 'web',
          now: input.now,
        });
      }
      for (const statementImport of imports) {
        await appendMutation(transactionDb, {
          mutationId: `privacy-source-${statementImport.id}`,
          vaultId: input.vaultId,
          deviceId,
          clock: await nextMutationClock(transactionDb, input.vaultId, deviceId),
          entityType: 'statement_import',
          entityId: statementImport.id,
          operation: 'update',
          baseVersion: 0,
          changedFields: ['storage_reference'],
          ciphertext: input.mutationCiphertext,
          origin: deviceId === 'ios' ? 'ios' : 'web',
          now: input.now,
        });
      }
    }
  });
}

/**
 * Delete the local financial records produced by one imported statement. The
 * transaction rows become tombstones so later sync can learn about the local
 * deletion; the import-review/source metadata is removed. Personal rules are
 * intentionally independent and remain available for future imports.
 */
export async function deleteImportedRecords(
  db: Db,
  input: {
    vaultId: string;
    importId: string;
    now: string;
    lastModifiedBy?: 'web' | 'ios';
    mutationDeviceId?: string;
    /** Encrypted batch payload used for per-transaction delete tombstones. */
    mutationCiphertext?: string;
  },
): Promise<PrivacyDeletionResult> {
  return db.transaction(async (transactionDb) => {
    const vault = await getVault(transactionDb, input.vaultId);
    if (!vault) throw new Error('The selected vault no longer exists.');

    const transactionRows = await transactionDb.all<{ id: string; version: number }>(
      'SELECT id, version FROM transactions WHERE vault_id = ? AND statement_import_id = ? AND deleted_at IS NULL',
      [input.vaultId, input.importId],
    );
    const rowCount = await transactionDb.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM import_rows WHERE vault_id = ? AND import_id = ?',
      [input.vaultId, input.importId],
    );
    const importCount = await transactionDb.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM statement_imports WHERE vault_id = ? AND id = ? AND deleted_at IS NULL',
      [input.vaultId, input.importId],
    );

    await transactionDb.exec(
      `UPDATE transactions
       SET deleted_at = ?, updated_at = ?, version = version + 1, last_modified_by = ?, original_payload = NULL
       WHERE vault_id = ? AND statement_import_id = ? AND deleted_at IS NULL`,
      [input.now, input.now, input.lastModifiedBy ?? 'web', input.vaultId, input.importId],
    );
    if (input.mutationCiphertext) {
      const deviceId = input.mutationDeviceId ?? input.lastModifiedBy ?? 'web';
      for (const transaction of transactionRows) {
        await appendMutation(transactionDb, {
          mutationId: `privacy-delete-${input.importId}-${transaction.id}`,
          vaultId: input.vaultId,
          deviceId,
          clock: await nextMutationClock(transactionDb, input.vaultId, deviceId),
          entityType: 'transaction',
          entityId: transaction.id,
          operation: 'delete',
          baseVersion: transaction.version,
          changedFields: ['deleted_at', 'original_payload'],
          ciphertext: input.mutationCiphertext,
          origin: input.lastModifiedBy ?? 'web',
          now: input.now,
        });
      }
    }
    await transactionDb.exec('DELETE FROM import_rows WHERE vault_id = ? AND import_id = ?', [input.vaultId, input.importId]);
    // The import record is being removed, so its provenance rows must not leave
    // an invalid import_id behind in later encrypted exports. Learned rules are
    // independent records and intentionally remain.
    await transactionDb.exec('DELETE FROM category_correction_history WHERE vault_id = ? AND import_id = ?', [input.vaultId, input.importId]);
    await transactionDb.exec(
      `UPDATE statement_imports
       SET deleted_at = ?, completed_at = COALESCE(completed_at, ?), storage_reference = NULL
       WHERE vault_id = ? AND id = ?`,
      [input.now, input.now, input.vaultId, input.importId],
    );

    return {
      vaultId: input.vaultId,
      deletedTransactions: transactionRows.length,
      deletedImportRows: rowCount?.count ?? 0,
      deletedImports: importCount?.count ?? 0,
    };
  });
}

/**
 * Irreversibly purge one vault from this local database after confirmation.
 * This is a local privacy operation, not a synchronization operation; US6
 * owns authenticated tombstone exchange and remote-device propagation.
 */
export async function deleteVaultLocally(db: Db, vaultId: string): Promise<void> {
  await db.transaction(async (transactionDb) => {
    const vault = await getVault(transactionDb, vaultId);
    if (!vault) throw new Error('The selected vault no longer exists.');

    // Delete children first because the schema intentionally uses foreign keys.
    for (const table of [
      'mutation_log',
      'conflicts',
      'category_correction_history',
      'import_rows',
      'transactions',
      'categorization_rules',
      'statement_imports',
      'categories',
      'paired_devices',
      'demo_datasets',
    ]) {
      await transactionDb.exec(`DELETE FROM ${table} WHERE vault_id = ?`, [vaultId]);
    }
    await transactionDb.exec('DELETE FROM vaults WHERE id = ?', [vaultId]);
  });
}
