import { describe, expect, it } from 'vitest';
import { applySchema } from '../src/storage/schema';
import {
  getCategory,
  getTransaction,
  insertCategory,
  insertTransaction,
  insertVault,
  softDeleteTransaction,
  updateTransaction,
} from '../src/storage/repository';
import { newTransaction } from '../src/entities/transaction';
import { withNodeDb } from './support/node-db';

function vault(id: string) {
  return {
    id,
    vault_owner_label: id,
    default_currency: 'USD',
    locale: 'en-US',
    week_start: 'locale_default' as const,
    demo_mode: false,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    deleted_at: null,
  };
}

describe('vault isolation boundaries (T082)', () => {
  it('does not expose or mutate records across vault boundaries', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, vault('vault-a'));
      await insertVault(db, vault('vault-b'));
      await insertCategory(db, {
        id: 'category-a',
        vault_id: 'vault-a',
        name: 'Private category',
        slug: 'private-category',
        kind: 'expense',
        color_token: 'copper',
        icon_name: 'tag',
        position: 0,
        is_active: true,
        created_at: '2026-08-05T00:00:00.000Z',
        updated_at: '2026-08-05T00:00:00.000Z',
        version: 1,
      });
      await insertTransaction(db, newTransaction({
        id: 'transaction-a',
        vault_id: 'vault-a',
        occurred_on: '2026-08-05',
        merchant_display: 'Private merchant',
        amount_minor: -1200,
        currency: 'USD',
        category_id: 'category-a',
        source_type: 'manual',
        now: '2026-08-05T00:00:00.000Z',
      }));

      expect(await getTransaction(db, 'vault-b', 'transaction-a')).toBeNull();
      expect(await getCategory(db, 'vault-b', 'category-a')).toBeNull();

      await updateTransaction(db, 'vault-b', 'transaction-a', {
        merchant_display: 'Should not change',
        amount_minor: -9999,
        updated_at: '2026-08-05T01:00:00.000Z',
        last_modified_by: 'web',
      });
      await softDeleteTransaction(db, 'vault-b', 'transaction-a', '2026-08-05T02:00:00.000Z', 'web');

      const unchanged = await getTransaction(db, 'vault-a', 'transaction-a');
      expect(unchanged).toMatchObject({
        merchant_display: 'Private merchant',
        amount_minor: -1200,
        deleted_at: null,
        version: 1,
      });
    });
  });

  it('does not permit a transaction in one vault to reference another vault category', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, vault('vault-a'));
      await insertVault(db, vault('vault-b'));
      await insertCategory(db, {
        id: 'category-b',
        vault_id: 'vault-b',
        name: 'Other private category',
        slug: 'other-private-category',
        kind: 'expense',
        color_token: 'stone',
        icon_name: 'tag',
        position: 0,
        is_active: true,
        created_at: '2026-08-05T00:00:00.000Z',
        updated_at: '2026-08-05T00:00:00.000Z',
        version: 1,
      });

      await expect(insertTransaction(db, newTransaction({
        id: 'cross-vault-category',
        vault_id: 'vault-a',
        occurred_on: '2026-08-05',
        merchant_display: 'Blocked merchant',
        amount_minor: -100,
        currency: 'USD',
        category_id: 'category-b',
        source_type: 'manual',
        now: '2026-08-05T00:00:00.000Z',
      }))).rejects.toThrow(/category/i);
    });
  });
});
