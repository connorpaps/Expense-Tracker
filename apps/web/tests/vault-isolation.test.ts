// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  applySchema,
  insertTransaction,
  listCategories,
  listTransactions,
  listVaults,
  newTransaction,
  insertCategory,
  insertStatementImport,
} from '@expense-tracker/domain';
import { createLocalVault } from '../src/local/vault';
import { buildVaultExport, importAsNewVault } from '../src/local/export';
import { createNodeDb } from '../../../packages/domain/tests/support/node-db';

describe('US7 vault isolation and safe copies', () => {
  it('keeps personal and demo vault records strictly isolated', async () => {
    const db = createNodeDb();
    try {
      await applySchema(db);
      const personal = await createLocalVault(db, { label: 'Personal', demoMode: false });
      const demo = await createLocalVault(db, { label: 'Portfolio demo', demoMode: true });

      const personalCategories = await listCategories(db, personal.id);
      await insertTransaction(db, newTransaction({
        id: 'personal-transaction',
        vault_id: personal.id,
        occurred_on: '2026-08-05',
        merchant_display: 'Private purchase',
        amount_minor: -1200,
        currency: 'USD',
        category_id: personalCategories[0]?.id ?? null,
        source_type: 'manual',
        now: '2026-08-05T00:00:00.000Z',
      }));

      expect((await listVaults(db)).map((vault) => vault.vault_owner_label)).toEqual(['Personal', 'Portfolio demo']);
      expect(await listTransactions(db, { vaultId: personal.id })).toHaveLength(1);
      expect(await listTransactions(db, { vaultId: demo.id })).toHaveLength(13);
      expect((await listTransactions(db, { vaultId: demo.id })).every((transaction) => transaction.source_type === 'demo')).toBe(true);
      expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM demo_datasets WHERE vault_id = ?', [demo.id]))?.n).toBe(1);
      expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM demo_datasets WHERE vault_id = ?', [personal.id]))?.n).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('imports a verified backup as a new isolated copy without changing the source', async () => {
    const db = createNodeDb();
    try {
      await applySchema(db);
      const source = await createLocalVault(db, { label: 'Source vault', demoMode: true });
      await insertCategory(db, { id: 'correction-category', vault_id: source.id, name: 'Correction Category', slug: 'correction-category', kind: 'expense', color_token: 'stone', icon_name: 'tag', position: 10, is_active: true, created_at: '2026-08-05T00:00:00.000Z', updated_at: '2026-08-05T00:00:00.000Z', version: 1 });
      const sourceCategories = await listCategories(db, source.id);
      const previousCategoryId = sourceCategories[0]?.id;
      if (!previousCategoryId) throw new Error('The demo vault should contain a category for remapping coverage.');
      await insertStatementImport(db, {
        id: 'source-import', vault_id: source.id, file_name: 'source.csv', file_type: 'csv', file_size_bytes: 1,
        source_fingerprint: 'source', bank_profile: null, parser_version: 'test', status: 'committed', total_rows: 1,
        recognized_rows: 1, warning_count: 0, error_count: 0, storage_reference: null, created_at: '2026-08-05T00:00:00.000Z',
        completed_at: '2026-08-05T00:00:00.000Z', deleted_at: null,
      });
      const sourceTransactionsBeforeCopy = await listTransactions(db, { vaultId: source.id });
      const sourceTransaction = sourceTransactionsBeforeCopy[0];
      const sourceTransactionId = sourceTransaction?.id;
      if (!sourceTransactionId || !sourceTransaction.merchant_display) throw new Error('The demo vault should contain a transaction for remapping coverage.');
      await db.exec(
        `INSERT INTO category_correction_history (id, vault_id, transaction_id, import_id, merchant_normalized, previous_category_id, next_category_id, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['source-correction', source.id, sourceTransactionId, 'source-import', 'demo purchase', previousCategoryId, 'correction-category', 'user', '2026-08-05T00:00:00.000Z'],
      );
      const copyId = await importAsNewVault(db, await buildVaultExport(db, source.id), 'Friend copy');

      const vaults = await listVaults(db);
      expect(vaults.map((vault) => vault.id)).toContain(source.id);
      expect(vaults.map((vault) => vault.id)).toContain(copyId);
      expect(vaults.find((vault) => vault.id === copyId)?.vault_owner_label).toBe('Friend copy');
      expect(vaults.find((vault) => vault.id === copyId)?.demo_mode).toBe(false);

      const sourceTransactions = await listTransactions(db, { vaultId: source.id });
      const copiedTransactions = await listTransactions(db, { vaultId: copyId });
      expect(copiedTransactions).toHaveLength(sourceTransactions.length);
      expect(copiedTransactions[0]?.id).not.toBe(sourceTransactions[0]?.id);
      expect(copiedTransactions[0]?.vault_id).toBe(copyId);
      expect(copiedTransactions[0]?.source_type).toBe('manual');
      expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM demo_datasets WHERE vault_id = ?', [copyId]))?.n).toBe(0);
      expect(await listCategories(db, source.id)).toHaveLength(11);
      expect(await listCategories(db, copyId)).toHaveLength(11);
      const copiedCorrection = await db.get<{ transaction_id: string; import_id: string; previous_category_id: string; next_category_id: string; vault_id: string }>(
        'SELECT transaction_id, import_id, previous_category_id, next_category_id, vault_id FROM category_correction_history WHERE vault_id = ?',
        [copyId],
      );
      const copiedCategory = await db.get<{ id: string }>(
        'SELECT id FROM categories WHERE vault_id = ? AND name = ?',
        [copyId, 'Correction Category'],
      );
      const sourcePreviousCategory = await db.get<{ name: string }>(
        'SELECT name FROM categories WHERE vault_id = ? AND id = ?',
        [source.id, previousCategoryId],
      );
      const copiedPreviousCategory = await db.get<{ id: string }>(
        'SELECT id FROM categories WHERE vault_id = ? AND name = ?',
        [copyId, sourcePreviousCategory?.name],
      );
      const copiedImport = await db.get<{ id: string }>(
        'SELECT id FROM statement_imports WHERE vault_id = ? AND source_fingerprint = ?',
        [copyId, 'source'],
      );
      const copiedTransaction = copiedTransactions.find((transaction) => transaction.merchant_display === sourceTransaction.merchant_display);
      expect(copiedCorrection?.vault_id).toBe(copyId);
      expect(copiedCorrection?.transaction_id).toBe(copiedTransaction?.id);
      expect(copiedCorrection?.transaction_id).not.toBe(sourceTransactionId);
      expect(copiedCorrection?.import_id).toBe(copiedImport?.id);
      expect(copiedCorrection?.import_id).not.toBe('source-import');
      expect(copiedCorrection?.previous_category_id).toBe(copiedPreviousCategory?.id);
      expect(copiedCorrection?.previous_category_id).not.toBe(previousCategoryId);
      expect(copiedCorrection?.next_category_id).toBe(copiedCategory?.id);
      expect(copiedCorrection?.next_category_id).not.toBe('correction-category');
      expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM vaults'))?.n).toBe(2);
    } finally {
      await db.close();
    }
  });
});
