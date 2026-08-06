import { describe, expect, it } from 'vitest';
import { randomUuid } from '../src/entities/ids';
import { DEFAULT_CATEGORIES, categorySlug } from '../src/entities/category';
import { newTransaction } from '../src/entities/transaction';
import { applySchema, schemaVersion, SCHEMA_VERSION } from '../src/storage/schema';
import {
  getVault,
  insertCategory,
  insertTransaction,
  insertVault,
  listCategories,
  reorderCategories,
  updateCategory,
  updateCategoryActive,
  insertRule,
  listRules,
  mergeCategory,
  updateRule,
  listTransactions,
  softDeleteTransaction,
  updateTransaction,
} from '../src/storage/repository';
import { withNodeDb } from './support/node-db';

function makeVault(id: string) {
  return {
    id,
    vault_owner_label: null,
    default_currency: 'USD',
    locale: 'en-US',
    week_start: 'locale_default' as const,
    demo_mode: false,
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
    deleted_at: null,
  };
}

describe('Vault storage schema and repository (T011)', () => {
  it('applies the schema and records the version', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      expect(await schemaVersion(db)).toBe(SCHEMA_VERSION);
    });
  });

  it('migrates an existing schema without dropping vault data', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-migrate'));
      await db.exec('DROP INDEX idx_transactions_review_state');
      await db.exec('PRAGMA user_version = 1');
      await applySchema(db);
      expect(await schemaVersion(db)).toBe(SCHEMA_VERSION);
      expect((await getVault(db, 'vault-migrate'))?.id).toBe('vault-migrate');
      const index = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_transactions_review_state'",
      );
      expect(index?.name).toBe('idx_transactions_review_state');
    });
  });

  it('inserts and reads a vault with isolation', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      await insertVault(db, makeVault('vault-b'));
      expect((await getVault(db, 'vault-a'))?.id).toBe('vault-a');
      expect((await getVault(db, 'missing'))).toBeNull();
    });
  });

  it('creates default categories in vault scope', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      await Promise.all(
        DEFAULT_CATEGORIES.map((c, index) =>
          insertCategory(db, {
            id: randomUuid(),
            vault_id: 'vault-a',
            name: c.name,
            slug: categorySlug(c.name),
            kind: c.kind,
            color_token: c.color_token,
            icon_name: c.icon_name,
            position: index,
            is_active: true,
            created_at: now,
            updated_at: now,
            version: 1,
          }),
        ),
      );
      const categories = await listCategories(db, 'vault-a');
      expect(categories).toHaveLength(10);
      expect(categories[0]?.name).toBe('Food and Dining');
    });
  });

  it('manages category lifecycle and personal rules without orphaning the vault', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      const categories = DEFAULT_CATEGORIES.slice(0, 2).map((c, index) => ({
        id: `cat-${index}`,
        vault_id: 'vault-a',
        name: c.name,
        slug: categorySlug(c.name),
        kind: c.kind,
        color_token: c.color_token,
        icon_name: c.icon_name,
        position: index,
        is_active: true,
        created_at: now,
        updated_at: now,
        version: 1,
      }));
      for (const category of categories) await insertCategory(db, category);
      await updateCategory(db, 'vault-a', 'cat-0', { name: 'Meals', slug: 'meals', updated_at: now });
      await reorderCategories(db, 'vault-a', ['cat-1', 'cat-0'], now);
      expect((await listCategories(db, 'vault-a')).map((category) => category.name)).toEqual(['Transportation', 'Meals']);
      await insertRule(db, {
        id: 'rule-1', vault_id: 'vault-a', category_id: 'cat-0', rule_type: 'personal_merchant', matcher: 'corner cafe',
        priority: 10, confidence: 1, evidence_count: 1, is_active: true, created_from: 'explicit_user_rule',
        created_at: now, updated_at: now, version: 1,
      });
      expect((await listRules(db, 'vault-a', false))).toHaveLength(1);
      await expect(updateCategoryActive(db, 'vault-a', 'cat-0', false, now)).rejects.toThrow(/disable personal rules/i);
      await updateRule(db, 'vault-a', 'rule-1', { is_active: false, updated_at: now });
      await updateCategoryActive(db, 'vault-a', 'cat-0', false, now);
      expect((await listRules(db, 'vault-a')).some((rule) => rule.id === 'rule-1')).toBe(false);
      await expect(updateCategoryActive(db, 'vault-a', 'cat-1', false, now)).rejects.toThrow(/at least one active/i);

      await updateCategoryActive(db, 'vault-a', 'cat-0', true, now);
      await mergeCategory(db, 'vault-a', 'cat-0', 'cat-1', now);
      expect((await listCategories(db, 'vault-a')).find((category) => category.id === 'cat-0')?.is_active).toBe(false);
      expect((await listRules(db, 'vault-a', false)).find((rule) => rule.id === 'rule-1')?.category_id).toBe('cat-1');
    });
  });

  it('scopes transaction queries to a single vault', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      await insertVault(db, makeVault('vault-b'));
      const now = '2026-08-04T00:00:00.000Z';
      await insertTransaction(
        db,
        newTransaction({
          id: 'tx-a',
          vault_id: 'vault-a',
          occurred_on: '2026-08-01',
          merchant_display: 'Cafe',
          amount_minor: -1200,
          currency: 'USD',
          source_type: 'manual',
          now,
        }),
      );
      await insertTransaction(
        db,
        newTransaction({
          id: 'tx-b',
          vault_id: 'vault-b',
          occurred_on: '2026-08-02',
          merchant_display: 'Secret',
          amount_minor: -999999,
          currency: 'USD',
          source_type: 'manual',
          now,
        }),
      );
      const inA = await listTransactions(db, { vaultId: 'vault-a' });
      const inB = await listTransactions(db, { vaultId: 'vault-b' });
      expect(inA.map((t) => t.id)).toEqual(['tx-a']);
      expect(inB.map((t) => t.id)).toEqual(['tx-b']);
      expect((await listTransactions(db, { vaultId: 'vault-a', range: { start: '2026-08-02', end: '2026-08-31' } }))).toHaveLength(0);
    });
  });

  it('enforces required-field CHECK constraints', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      await expect(
        insertTransaction(
          db,
          newTransaction({
            id: 'tx-bad-merchant',
            vault_id: 'vault-a',
            occurred_on: '2026-08-01',
            merchant_display: '',
            amount_minor: -1200,
            currency: 'USD',
            source_type: 'manual',
            now,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects invalid dates, currencies, and inactive categories at the repository boundary', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      await expect(insertTransaction(db, newTransaction({ id: 'bad-date', vault_id: 'vault-a', occurred_on: '2026-99-99', merchant_display: 'Cafe', amount_minor: -100, currency: 'USD', source_type: 'manual', now }))).rejects.toThrow(/date/i);
      await expect(insertTransaction(db, newTransaction({ id: 'bad-currency', vault_id: 'vault-a', occurred_on: '2026-08-01', merchant_display: 'Cafe', amount_minor: -100, currency: 'ZZZ', source_type: 'manual', now }))).rejects.toThrow(/currency/i);
      await expect(insertTransaction(db, newTransaction({ id: 'bad-category', vault_id: 'vault-a', occurred_on: '2026-08-01', merchant_display: 'Cafe', amount_minor: -100, currency: 'USD', category_id: 'missing', source_type: 'manual', now }))).rejects.toThrow(/category/i);
    });
  });

  it('updates and tombstones transactions with version bumps', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      await insertTransaction(
        db,
        newTransaction({
          id: 'tx-1',
          vault_id: 'vault-a',
          occurred_on: '2026-08-01',
          merchant_display: 'Cafe',
          amount_minor: -1200,
          currency: 'USD',
          source_type: 'manual',
          now,
        }),
      );
      await updateTransaction(db, 'vault-a', 'tx-1', {
        amount_minor: -1350,
        updated_at: '2026-08-04T01:00:00.000Z',
        last_modified_by: 'web',
      });
      const [updated] = await listTransactions(db, { vaultId: 'vault-a' });
      expect(updated?.amount_minor).toBe(-1350);
      expect(updated?.version).toBe(2);

      await softDeleteTransaction(db, 'vault-a', 'tx-1', '2026-08-04T02:00:00.000Z', 'web');
      expect(await listTransactions(db, { vaultId: 'vault-a' })).toHaveLength(0);
      const withDeleted = await listTransactions(db, { vaultId: 'vault-a', includeDeleted: true });
      expect(withDeleted).toHaveLength(1);
      expect(withDeleted[0]?.deleted_at).not.toBeNull();
    });
  });

  it('supports search and category filters', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const now = '2026-08-04T00:00:00.000Z';
      await insertCategory(db, {
        id: 'cat-food', vault_id: 'vault-a', name: 'Food', slug: 'food', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: true, created_at: now, updated_at: now, version: 1,
      });
      await insertCategory(db, {
        id: 'cat-transport', vault_id: 'vault-a', name: 'Transport', slug: 'transport', kind: 'expense', color_token: 'slate', icon_name: 'car', position: 1, is_active: true, created_at: now, updated_at: now, version: 1,
      });
      await insertTransaction(
        db,
        newTransaction({ id: 'tx-1', vault_id: 'vault-a', occurred_on: '2026-08-01', merchant_display: 'Starbucks', amount_minor: -650, currency: 'USD', category_id: 'cat-food', source_type: 'manual', now }),
      );
      await insertTransaction(
        db,
        newTransaction({ id: 'tx-2', vault_id: 'vault-a', occurred_on: '2026-08-02', merchant_display: 'Shell Gas', amount_minor: -4500, currency: 'USD', category_id: 'cat-transport', source_type: 'manual', now }),
      );
      expect((await listTransactions(db, { vaultId: 'vault-a', search: 'starbucks' })).map((t) => t.id)).toEqual(['tx-1']);
      expect((await listTransactions(db, { vaultId: 'vault-a', categoryId: 'cat-transport' })).map((t) => t.id)).toEqual(['tx-2']);
      expect((await listTransactions(db, { vaultId: 'vault-a', search: 'zzz' }))).toHaveLength(0);
    });
  });
});
