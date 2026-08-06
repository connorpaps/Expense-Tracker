import { describe, expect, it } from 'vitest';
import type { Db } from '../src/storage/schema';
import type { AppendMutationInput } from '../src/sync/mutation-log';
import { applySchema } from '../src/storage/schema';
import { insertCategory, insertVault, listTransactions } from '../src/storage/repository';
import { applyRemoteMutation, isProjectableRemoteMutation } from '../src/sync/projection';
import { withNodeDb } from './support/node-db';

const now = '2026-08-06T12:00:00.000Z';

function mutation(overrides: Partial<AppendMutationInput> = {}): AppendMutationInput {
  return {
    mutationId: 'remote-transaction-1',
    vaultId: 'vault-a',
    deviceId: 'ios-device',
    clock: { lamport: 1, vector: { 'ios-device': 1 } },
    entityType: 'transaction',
    entityId: 'transaction-1',
    operation: 'create',
    baseVersion: 0,
    changedFields: ['occurred_on', 'merchant_display', 'amount_minor', 'currency', 'category_id'],
    ciphertext: 'opaque-ciphertext',
    origin: 'ios',
    now,
    ...overrides,
  };
}

const category = {
  id: 'category-food',
  vault_id: 'vault-a',
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

const transaction = {
  id: 'transaction-1',
  vault_id: 'vault-a',
  occurred_on: '2026-08-05',
  merchant_display: 'Corner Cafe',
  merchant_original: 'CORNER CAFE #12',
  amount_minor: -1250,
  currency: 'USD',
  category_id: category.id,
  category_source: 'user' as const,
  category_confidence: 'confirmed' as const,
  note: null,
  source_type: 'manual' as const,
  statement_import_id: null,
  source_row_key: null,
  review_state: 'confirmed' as const,
  original_payload: null,
  created_at: now,
  updated_at: now,
  deleted_at: null,
  version: 1,
  last_modified_by: 'ios' as const,
};

async function withVault(fn: (db: Db) => Promise<void>): Promise<void> {
  await withNodeDb(async (db) => {
    await applySchema(db);
    await insertVault(db, {
      id: 'vault-a',
      vault_owner_label: 'Personal',
      default_currency: 'USD',
      locale: 'en-US',
      week_start: 'locale_default',
      demo_mode: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    await insertCategory(db, category);
    await fn(db);
  });
}

describe('remote mutation projection boundary (T079)', () => {
  it('applies a decrypted transaction exactly once and marks the mutation applied', async () => {
    await withVault(async (db) => {
      const input = { vaultId: 'vault-a', mutation: mutation(), payload: { entity: 'transaction', value: transaction } } as const;
      const first = await applyRemoteMutation(input, db);
      expect(first.kind).toBe('applied');
      expect(await listTransactions(db, { vaultId: 'vault-a' })).toHaveLength(1);

      const second = await applyRemoteMutation(input, db);
      expect(second.kind).toBe('duplicate');
      expect(await listTransactions(db, { vaultId: 'vault-a' })).toHaveLength(1);
      expect(await db.get<{ status: string; applied_at: string }>('SELECT status, applied_at FROM mutation_log WHERE id = ?', ['remote-transaction-1'])).toMatchObject({ status: 'applied', applied_at: now });
    });
  });

  it('rejects wrong-vault and mismatched payloads before changing the projection', async () => {
    await withVault(async (db) => {
      await expect(applyRemoteMutation({ vaultId: 'vault-a', mutation: mutation(), payload: { entity: 'category', value: category } }, db)).rejects.toThrow(/metadata does not match/i);
      await expect(applyRemoteMutation({ vaultId: 'vault-a', mutation: mutation({ vaultId: 'vault-b' }), payload: { entity: 'transaction', value: transaction } }, db)).rejects.toThrow(/wrong vault/i);
      expect(await listTransactions(db, { vaultId: 'vault-a' })).toHaveLength(0);
      expect(await db.get('SELECT id FROM mutation_log WHERE id = ?', ['remote-transaction-1'])).toBeUndefined();
    });
  });

  it('rejects mismatched duplicate envelopes and undeclared update fields', async () => {
    await withVault(async (db) => {
      const input = { vaultId: 'vault-a', mutation: mutation(), payload: { entity: 'transaction', value: transaction } } as const;
      await applyRemoteMutation(input, db);
      await expect(applyRemoteMutation({
        vaultId: 'vault-a',
        mutation: mutation({ ciphertext: 'different-ciphertext' }),
        payload: { entity: 'transaction', value: transaction },
      }, db)).rejects.toThrow(/different envelope/i);

      const invalidUpdate = { ...transaction, note: 'undeclared' };
      await expect(applyRemoteMutation({
        vaultId: 'vault-a',
        mutation: mutation({ mutationId: 'remote-transaction-3', operation: 'update', baseVersion: 1, clock: { lamport: 3, vector: { 'ios-device': 3 } }, changedFields: ['amount_minor'] }),
        payload: { entity: 'transaction', value: invalidUpdate },
      }, db)).rejects.toThrow(/undeclared/i);
    });
  });

  it('rolls back the mutation log when projection validation or persistence fails', async () => {
    await withVault(async (db) => {
      const invalid = { ...transaction, category_id: 'missing-category' };
      await expect(applyRemoteMutation({ vaultId: 'vault-a', mutation: mutation(), payload: { entity: 'transaction', value: invalid } }, db)).rejects.toThrow(/active in this vault/i);
      expect(await listTransactions(db, { vaultId: 'vault-a' })).toHaveLength(0);
      expect(await db.get('SELECT id FROM mutation_log WHERE id = ?', ['remote-transaction-1'])).toBeUndefined();
    });
  });

  it('supports projection updates while preserving vault scope', async () => {
    await withVault(async (db) => {
      await applyRemoteMutation({ vaultId: 'vault-a', mutation: mutation(), payload: { entity: 'transaction', value: transaction } }, db);
      const updated = { id: transaction.id, vault_id: transaction.vault_id, amount_minor: -2200, note: 'Remote correction', updated_at: '2026-08-06T12:01:00.000Z' };
      const result = await applyRemoteMutation({
        vaultId: 'vault-a',
        mutation: mutation({ mutationId: 'remote-transaction-2', operation: 'update', baseVersion: 1, clock: { lamport: 2, vector: { 'ios-device': 2 } }, changedFields: ['amount_minor', 'note'] }),
        payload: { entity: 'transaction', value: updated },
      }, db);
      expect(result.kind).toBe('applied');
      await expect(listTransactions(db, { vaultId: 'vault-a' })).resolves.toMatchObject([{ amount_minor: -2200, note: 'Remote correction', last_modified_by: 'ios' }]);
    });
  });

  it('exposes only supported projection operations', () => {
    expect(isProjectableRemoteMutation('transaction', 'create')).toBe(true);
    expect(isProjectableRemoteMutation('categorization_rule', 'rule_update')).toBe(true);
    expect(isProjectableRemoteMutation('conflict', 'update')).toBe(false);
    expect(isProjectableRemoteMutation('vault', 'update')).toBe(false);
  });
});
