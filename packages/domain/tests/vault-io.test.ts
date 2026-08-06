import { describe, expect, it } from 'vitest';
import { VAULT_EXPORT_FORMAT, validateVaultExportSnapshot } from '../src';
import type { SqlRow } from '../src/storage/schema';
import type { VaultExportSnapshot } from '../src/vault-io';

const vaultId = 'vault-export';
const now = '2026-08-05T00:00:00.000Z';
const vault: SqlRow = {
  id: vaultId,
  vault_owner_label: 'Private',
  default_currency: 'USD',
  locale: 'en-US',
  week_start: 'locale_default',
  demo_mode: 0,
  created_at: now,
  updated_at: now,
  deleted_at: null,
};

function row(table: 'categories' | 'transactions' | 'statement_imports'): SqlRow {
  if (table === 'categories') return {
    id: 'category-1', vault_id: vaultId, name: 'Food', slug: 'food', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: 1, created_at: now, updated_at: now, version: 1,
  };
  if (table === 'statement_imports') return {
    id: 'import-1', vault_id: vaultId, file_name: 'statement.csv', file_type: 'csv', file_size_bytes: 1, source_fingerprint: 'fingerprint', bank_profile: null, parser_version: 'test', status: 'committed', total_rows: 0, recognized_rows: 0, warning_count: 0, error_count: 0, storage_reference: null, created_at: now, completed_at: now, deleted_at: null,
  };
  return {
    id: 'transaction-1', vault_id: vaultId, occurred_on: '2026-08-04', merchant_display: 'Cafe', merchant_original: null, amount_minor: -100, currency: 'USD', category_id: 'category-1', category_source: 'user', category_confidence: 'confirmed', note: null, source_type: 'csv', statement_import_id: 'import-1', source_row_key: null, review_state: 'confirmed', original_payload: null, created_at: now, updated_at: now, deleted_at: null, version: 1, last_modified_by: 'web',
  };
}

function snapshot(overrides: Partial<VaultExportSnapshot> = {}): VaultExportSnapshot {
  return {
    format: VAULT_EXPORT_FORMAT,
    exported_at: now,
    schema_version: 3,
    vault,
    tables: {
      categories: [row('categories')],
      transactions: [row('transactions')],
      statement_imports: [row('statement_imports')],
      import_rows: [],
      categorization_rules: [],
      category_correction_history: [],
      demo_datasets: [],
    },
    ...overrides,
  };
}

describe('shared vault export validation (T066)', () => {
  it('accepts a complete, correctly scoped snapshot', () => {
    expect(() => validateVaultExportSnapshot(snapshot())).not.toThrow();
  });

  it('rejects a snapshot newer than the current schema or missing a table', () => {
    expect(() => validateVaultExportSnapshot(snapshot({ schema_version: 999 }))).toThrow(/too new/i);
    const invalid = snapshot();
    delete (invalid.tables as Partial<typeof invalid.tables>).demo_datasets;
    expect(() => validateVaultExportSnapshot(invalid)).toThrow(/missing its demo_datasets/i);
  });

  it('rejects cross-vault records and dangling references', () => {
    const crossVault = snapshot();
    crossVault.tables.categories[0] = { ...crossVault.tables.categories[0]!, vault_id: 'other-vault' };
    expect(() => validateVaultExportSnapshot(crossVault)).toThrow(/another vault/i);

    const dangling = snapshot();
    dangling.tables.transactions[0] = { ...dangling.tables.transactions[0]!, category_id: 'missing-category' };
    expect(() => validateVaultExportSnapshot(dangling)).toThrow(/unknown category/i);
  });
});
