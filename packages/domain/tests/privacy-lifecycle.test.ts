import { describe, expect, it } from 'vitest';
import {
  applySchema,
  deleteImportedRecords,
  deleteStatementOriginals,
  deleteVaultLocally,
  insertCategory,
  insertRule,
  insertStatementImport,
  insertTransaction,
  insertVault,
  listRules,
  listTransactions,
  getVault,
} from '../src';
import { newTransaction } from '../src/entities/transaction';
import { withNodeDb } from './support/node-db';
import { NodeEnvelopeCipher, randomVaultKey } from './support/node-crypto';

const now = '2026-08-05T00:00:00.000Z';
const vault = {
  id: 'vault-privacy',
  vault_owner_label: 'Private',
  default_currency: 'USD',
  locale: 'en-US',
  week_start: 'locale_default' as const,
  demo_mode: false,
  created_at: now,
  updated_at: now,
  deleted_at: null,
};
const category = {
  id: 'category-food',
  vault_id: vault.id,
  name: 'Food',
  slug: 'food',
  kind: 'expense' as const,
  color_token: 'copper',
  icon_name: 'utensils',
  position: 0,
  is_active: true,
  created_at: now,
  updated_at: now,
  version: 1,
};

async function seedPrivacyDb(db: Parameters<typeof applySchema>[0]): Promise<void> {
  await applySchema(db);
  await insertVault(db, vault);
  await insertCategory(db, category);
  await insertStatementImport(db, {
    id: 'import-privacy', vault_id: vault.id, file_name: 'statement.csv', file_type: 'csv', file_size_bytes: 20,
    source_fingerprint: 'privacy', bank_profile: null, parser_version: 'test', status: 'committed', total_rows: 1,
    recognized_rows: 1, warning_count: 0, error_count: 0, storage_reference: 'encrypted-original',
    created_at: now, completed_at: now, deleted_at: null,
  });
  await db.exec(
    `INSERT INTO import_rows (id, import_id, vault_id, source_row_number, parsed_date, parsed_merchant, parsed_amount_minor, parsed_currency, suggested_category_id, category_source, category_confidence, row_status, diagnostics, duplicate_candidate_ids, user_decision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['row-privacy', 'import-privacy', vault.id, 1, '2026-08-04', 'Corner Cafe', -1250, 'USD', category.id, 'user', 'confirmed', 'valid', '[]', '[]', 'accept'],
  );
  await insertTransaction(db, newTransaction({
    id: 'transaction-privacy', vault_id: vault.id, occurred_on: '2026-08-04', merchant_display: 'Corner Cafe', amount_minor: -1250,
    currency: 'USD', category_id: category.id, source_type: 'csv', statement_import_id: 'import-privacy', original_payload: 'encrypted-row', now,
  }));
  await insertRule(db, {
    id: 'rule-privacy', vault_id: vault.id, category_id: category.id, rule_type: 'personal_merchant', matcher: 'corner cafe', priority: 10,
    confidence: 0.9, evidence_count: 1, is_active: true, created_from: 'user_correction', created_at: now, updated_at: now, version: 1,
  });
}

describe('local privacy lifecycle (US5)', () => {
  it('removes retained originals while preserving normalized records and learned rules', async () => {
    await withNodeDb(async (db) => {
      await seedPrivacyDb(db);
      await deleteStatementOriginals(db, {
        vaultId: vault.id,
        now,
        mutationDeviceId: 'web',
        mutationCiphertext: 'encrypted-original-delete',
      });
      expect((await db.get<{ storage_reference: string | null }>('SELECT storage_reference FROM statement_imports WHERE id = ?', ['import-privacy']))?.storage_reference).toBeNull();
      expect((await db.get<{ original_payload: string | null; version: number }>('SELECT original_payload, version FROM transactions WHERE id = ?', ['transaction-privacy']))).toEqual({ original_payload: null, version: 2 });
      expect(await listTransactions(db, { vaultId: vault.id })).toHaveLength(1);
      expect(await listRules(db, vault.id, false)).toHaveLength(1);
      expect((await db.all<{ entity_type: string; entity_id: string; base_version: number }>(
        "SELECT entity_type, entity_id, base_version FROM mutation_log WHERE vault_id = ? ORDER BY entity_id",
        [vault.id],
      ))).toEqual([
        { entity_type: 'statement_import', entity_id: 'import-privacy', base_version: 0 },
        { entity_type: 'transaction', entity_id: 'transaction-privacy', base_version: 1 },
      ]);
    });
  });

  it('tombstones imported transactions, removes import metadata, and retains learned rules', async () => {
    await withNodeDb(async (db) => {
      await seedPrivacyDb(db);
      const result = await deleteImportedRecords(db, {
        vaultId: vault.id,
        importId: 'import-privacy',
        now,
        mutationDeviceId: 'web',
        mutationCiphertext: 'encrypted-delete-batch',
      });
      expect(result).toMatchObject({ deletedTransactions: 1, deletedImportRows: 1, deletedImports: 1 });
      expect(await listTransactions(db, { vaultId: vault.id })).toHaveLength(0);
      expect(await listTransactions(db, { vaultId: vault.id, includeDeleted: true })).toHaveLength(1);
      expect((await db.get<{ deleted_at: string | null; original_payload: string | null }>('SELECT deleted_at, original_payload FROM transactions WHERE id = ?', ['transaction-privacy']))?.deleted_at).toBe(now);
      expect((await db.get<{ original_payload: string | null }>('SELECT original_payload FROM transactions WHERE id = ?', ['transaction-privacy']))?.original_payload).toBeNull();
      expect(await db.get('SELECT id FROM statement_imports WHERE id = ? AND deleted_at IS NULL', ['import-privacy'])).toBeUndefined();
      expect(await db.get('SELECT id FROM import_rows WHERE id = ?', ['row-privacy'])).toBeUndefined();
      expect(await listRules(db, vault.id, false)).toHaveLength(1);
      const deleteMutations = await db.all<{ entity_id: string; operation: string; ciphertext: string }>(
        "SELECT entity_id, operation, ciphertext FROM mutation_log WHERE vault_id = ? AND operation = 'delete'",
        [vault.id],
      );
      expect(deleteMutations).toEqual([{ entity_id: 'transaction-privacy', operation: 'delete', ciphertext: 'encrypted-delete-batch' }]);
    });
  });

  it('rolls back an import deletion when a transaction mutation cannot be appended', async () => {
    await withNodeDb(async (db) => {
      await seedPrivacyDb(db);
      const originalExec = db.exec;
      let mutationInsertAttempted = false;
      db.exec = async (sql, params = []) => {
        if (sql.includes('INSERT OR IGNORE INTO mutation_log')) {
          mutationInsertAttempted = true;
          throw new Error('simulated mutation storage failure');
        }
        return originalExec(sql, params);
      };
      await expect(deleteImportedRecords(db, {
        vaultId: vault.id,
        importId: 'import-privacy',
        now,
        mutationCiphertext: 'encrypted-delete-batch',
      })).rejects.toThrow('simulated mutation storage failure');
      expect(mutationInsertAttempted).toBe(true);
      expect(await listTransactions(db, { vaultId: vault.id })).toHaveLength(1);
      expect((await db.get<{ deleted_at: string | null }>('SELECT deleted_at FROM transactions WHERE id = ?', ['transaction-privacy']))?.deleted_at).toBeNull();
    });
  });

  it('rolls back a vault purge when a child-table deletion fails', async () => {
    await withNodeDb(async (db) => {
      await seedPrivacyDb(db);
      const originalExec = db.exec;
      let categoryDeleteAttempted = false;
      db.exec = async (sql, params = []) => {
        if (sql.includes('DELETE FROM categories')) {
          categoryDeleteAttempted = true;
          throw new Error('simulated category deletion failure');
        }
        return originalExec(sql, params);
      };
      await expect(deleteVaultLocally(db, vault.id)).rejects.toThrow('simulated category deletion failure');
      expect(categoryDeleteAttempted).toBe(true);
      expect((await getVault(db, vault.id))?.id).toBe(vault.id);
      expect(await db.get('SELECT id FROM transactions WHERE vault_id = ?', [vault.id])).toEqual({ id: 'transaction-privacy' });
      expect(await db.get('SELECT id FROM statement_imports WHERE vault_id = ?', [vault.id])).toEqual({ id: 'import-privacy' });
      expect(await db.get('SELECT id FROM categorization_rules WHERE vault_id = ?', [vault.id])).toEqual({ id: 'rule-privacy' });
    });
  });

  it('purges one vault locally without touching another vault', async () => {
    await withNodeDb(async (db) => {
      await seedPrivacyDb(db);
      await insertVault(db, { ...vault, id: 'vault-other', vault_owner_label: 'Other' });
      await deleteVaultLocally(db, vault.id);
      expect(await getVault(db, vault.id)).toBeNull();
      expect((await getVault(db, 'vault-other'))?.id).toBe('vault-other');
      expect(await db.get('SELECT id FROM transactions WHERE vault_id = ?', [vault.id])).toBeUndefined();
      expect(await db.get('SELECT id FROM categorization_rules WHERE vault_id = ?', [vault.id])).toBeUndefined();
    });
  });

  it('keeps encrypted records unreadable with the wrong key and supports a lock/reopen boundary', async () => {
    const key = randomVaultKey();
    const cipher = new NodeEnvelopeCipher(key);
    const aad = new TextEncoder().encode('vault-privacy|transaction-privacy');
    const envelope = await cipher.encrypt(new TextEncoder().encode('private transaction'), aad);
    await expect(new NodeEnvelopeCipher(randomVaultKey()).decrypt(envelope, aad)).rejects.toThrow();
    const reopened = await cipher.decrypt(envelope, aad);
    expect(new TextDecoder().decode(reopened)).toBe('private transaction');
  });
});
