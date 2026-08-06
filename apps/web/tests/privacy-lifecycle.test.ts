// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  buildVaultExport,
  clearLocalData,
  computeExportChecksum,
  encryptExportPayload,
  EXPORT_KDF,
  exportVault,
  parseVaultExport,
  replaceWithVaultExport,
} from '../src/local/export';
import { applySchema } from '@expense-tracker/domain';
import { insertCategory, insertPairedDevice, insertTransaction, insertVault } from '@expense-tracker/domain';
import { newTransaction } from '@expense-tracker/domain';
import type { Db } from '@expense-tracker/domain';
import { createNodeDb } from '../../../packages/domain/tests/support/node-db';

const vault = {
  id: 'vault-private',
  vault_owner_label: 'Personal',
  default_currency: 'USD',
  locale: 'en-US',
  week_start: 'locale_default' as const,
  demo_mode: false,
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  deleted_at: null,
};

const category = {
  id: 'category-food',
  vault_id: vault.id,
  name: 'Food and Dining',
  slug: 'food-and-dining',
  kind: 'expense' as const,
  color_token: 'copper',
  icon_name: 'utensils',
  position: 0,
  is_active: true,
  created_at: vault.created_at,
  updated_at: vault.updated_at,
  version: 1,
};

describe('web privacy lifecycle (US5)', () => {
  it('round-trips an encrypted vault backup and restores it into an empty database', async () => {
    const source = createNodeDb();
    const target = createNodeDb();
    try {
      await applySchema(source);
      await insertVault(source, vault);
      await insertCategory(source, category);
      await insertTransaction(source, newTransaction({
        id: 'transaction-1',
        vault_id: vault.id,
        occurred_on: '2026-08-04',
        merchant_display: 'Corner Cafe',
        amount_minor: -1250,
        currency: 'USD',
        category_id: category.id,
        source_type: 'manual',
        now: vault.created_at,
      }));

      const blob = await exportVault(source, vault.id, 'correct horse battery');
      const snapshot = await parseVaultExport(new File([await blob.text()], 'backup.etvault'), 'correct horse battery');
      expect(snapshot.vault.id).toBe(vault.id);
      expect(snapshot.tables.transactions).toHaveLength(1);
      expect(snapshot.tables.categories).toHaveLength(1);

      await applySchema(target);
      await replaceWithVaultExport(target, snapshot);
      expect(await target.get<{ id: string }>('SELECT id FROM vaults')).toEqual({ id: vault.id });
      expect(await target.get<{ merchant_display: string }>('SELECT merchant_display FROM transactions')).toEqual({ merchant_display: 'Corner Cafe' });
    } finally {
      await source.close();
      await target.close();
    }
  });

  it('keeps browser-bound device and mutation records out of portable backups', async () => {
    const source = createNodeDb();
    try {
      await applySchema(source);
      await insertVault(source, vault);
      await insertPairedDevice(source, {
        id: 'device-1',
        vault_id: vault.id,
        display_name: 'Phone',
        public_key: 'public-key',
        capabilities: ['read', 'write'],
        wrapped_vault_key: 'wrapped-key',
        key_version: 1,
        paired_at: vault.created_at,
        last_seen_at: null,
        status: 'active',
        revoked_at: null,
      });
      await source.exec(
        `INSERT INTO mutation_log (id, vault_id, entity_type, entity_id, operation, base_version, device_id, lamport_clock, vector_clock, changed_fields, ciphertext, origin, status, conflict_id, created_at, applied_at, retry_count, last_error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['mutation-1', vault.id, 'transaction', 'transaction-1', 'create', 0, 'web', 1, '{}', '[]', 'encrypted', 'web', 'pending', null, vault.created_at, null, 0, null],
      );

      const snapshot = await buildVaultExport(source, vault.id);
      expect(snapshot.tables).not.toHaveProperty('paired_devices');
      expect(snapshot.tables).not.toHaveProperty('mutation_log');
      expect(await source.get('SELECT id FROM paired_devices')).toEqual({ id: 'device-1' });
      expect(await source.get('SELECT id FROM mutation_log')).toEqual({ id: 'mutation-1' });
    } finally {
      await source.close();
    }
  });

  it('rejects an incorrect password and a newer schema before touching local data', async () => {
    const source = createNodeDb();
    const target = createNodeDb();
    try {
      await applySchema(source);
      await insertVault(source, vault);
      const blob = await exportVault(source, vault.id, 'correct horse battery');
      const file = new File([await blob.text()], 'backup.etvault');
      await expect(parseVaultExport(file, 'wrong password')).rejects.toThrow(/password is incorrect|damaged/i);

      const encrypted = await encryptExportPayload(JSON.stringify({
        format: 'expense-tracker-vault-v1',
        exported_at: new Date().toISOString(),
        schema_version: 999,
        vault: { ...vault, demo_mode: 0 },
        tables: {
          categories: [], transactions: [], statement_imports: [], import_rows: [], categorization_rules: [], category_correction_history: [],
          demo_datasets: [],
        },
      }), 'correct horse battery');
      const newerFile = new File([JSON.stringify({ format: 'expense-tracker-vault-v1', kdf: EXPORT_KDF, encrypted, checksum: await computeExportChecksum(encrypted) })], 'newer.etvault');
      await expect(parseVaultExport(newerFile, 'correct horse battery')).rejects.toThrow(/too new|unsupported/i);

      await applySchema(target);
      await insertVault(target, { ...vault, id: 'existing', demo_mode: false });
      await expect(replaceWithVaultExport(target, {
        format: 'expense-tracker-vault-v1',
        exported_at: new Date().toISOString(),
        schema_version: 999,
        vault: { ...vault, demo_mode: 0 },
        tables: {
          categories: [], transactions: [], statement_imports: [], import_rows: [], categorization_rules: [], category_correction_history: [],
          demo_datasets: [],
        },
      })).rejects.toThrow();
      expect(await target.get<{ id: string }>('SELECT id FROM vaults')).toEqual({ id: 'existing' });
    } finally {
      await source.close();
      await target.close();
    }
  });

  it('accepts an older encrypted backup without correction history', async () => {
    const legacySnapshot = {
      format: 'expense-tracker-vault-v1',
      exported_at: '2026-08-05T00:00:00.000Z',
      schema_version: 2,
      vault: { ...vault, demo_mode: 0 },
      tables: {
        categories: [], transactions: [], statement_imports: [], import_rows: [], categorization_rules: [], demo_datasets: [],
      },
    };
    const encrypted = await encryptExportPayload(JSON.stringify(legacySnapshot), 'correct horse battery');
    const file = new File([JSON.stringify({ format: 'expense-tracker-vault-v1', kdf: EXPORT_KDF, encrypted, checksum: await computeExportChecksum(encrypted) })], 'legacy.etvault');
    const parsed = await parseVaultExport(file, 'correct horse battery');
    expect(parsed.tables.category_correction_history).toEqual([]);
  });

  it('closes the local database before requesting browser storage deletion', async () => {
    const close = vi.fn(async () => {});
    const db: Db = {
      exec: async () => ({ changes: 0 }),
      all: async <T,>() => [] as T[],
      get: async <T,>() => undefined as T | undefined,
      transaction: async <T,>(fn: (transactionDb: Db) => Promise<T>): Promise<T> => fn(db),
      close,
    };
    await clearLocalData(db);
    expect(close).toHaveBeenCalledOnce();
  });
});
