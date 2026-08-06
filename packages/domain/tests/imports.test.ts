import { describe, expect, it } from 'vitest';
import type { ImportRowReview } from '../src/entities/import';
import { findDuplicateCandidates } from '../src/imports/duplicates';
import {
  buildTransactionsFromRows,
  cancelImportToDb,
  commitError,
  commitImportToDb,
  planCommit,
} from '../src/imports/commit';
import { applySchema } from '../src/storage/schema';
import {
  insertStatementImport,
  insertVault,
  getStatementImport,
  listImportRows,
  listTransactions,
  insertCategory,
  listRules,
} from '../src/storage/repository';
import { listCorrectionHistory } from '../src/categorization/personal-rules';
import { findMutation } from '../src/sync/mutation-log';
import { withNodeDb } from './support/node-db';
import { ERROR_CODES } from '@expense-tracker/contracts';

function row(id: string, partial: Partial<ImportRowReview>): ImportRowReview {
  return {
    id,
    import_id: 'import-1',
    source_row_number: Number(id.replace(/\D/g, '')) || 1,
    parsed_date: '2026-08-04',
    parsed_merchant: 'Cafe',
    parsed_amount_minor: -1250,
    parsed_currency: 'USD',
    suggested_category_id: null,
    category_source: null,
    category_confidence: null,
    row_status: 'valid',
    diagnostics: [],
    duplicate_candidate_ids: [],
    user_decision: 'pending',
    ...partial,
  };
}

describe('Duplicate detection (T031)', () => {
  it('flags intra-import duplicates by fingerprint', () => {
    const batch = [
      { merchant: 'STARBUCKS #12', occurredOn: '2026-08-04', amountMinor: -650, rowKey: 'r1' },
      { merchant: 'Starbucks', occurredOn: '2026-08-04', amountMinor: -650, rowKey: 'r2' },
    ];
    const candidates = findDuplicateCandidates(batch, [], new Map());
    expect(candidates.get('r2')?.length).toBeGreaterThan(0);
    expect(candidates.get('r1')).toBeUndefined();
  });

  it('does not flag legitimate recurring transactions on different dates', () => {
    const batch = [
      { merchant: 'Netflix', occurredOn: '2026-08-04', amountMinor: -1599, rowKey: 'r1' },
      { merchant: 'Netflix', occurredOn: '2026-08-04', amountMinor: -1599, rowKey: 'r2' },
      { merchant: 'Netflix', occurredOn: '2026-09-04', amountMinor: -1599, rowKey: 'r3' },
    ];
    const candidates = findDuplicateCandidates(batch, [], new Map());
    // r1/r2 collide; r3 is a different date and must NOT be flagged.
    expect(candidates.get('r3')).toBeUndefined();
  });

  it('matches against existing saved transactions', () => {
    const existing = [
      {
        id: 'tx-saved',
        vault_id: 'v1',
        occurred_on: '2026-08-04',
        merchant_display: 'Cafe',
        merchant_original: 'Cafe',
        amount_minor: -1250,
        currency: 'USD',
        category_id: null,
        category_source: null,
        category_confidence: null,
        note: null,
        source_type: 'manual' as const,
        statement_import_id: null,
        source_row_key: null,
        review_state: 'confirmed' as const,
        original_payload: null,
        created_at: 'x',
        updated_at: 'x',
        deleted_at: null,
        version: 1,
        last_modified_by: 'web' as const,
      },
    ];
    const batch = [
      { merchant: 'Cafe', occurredOn: '2026-08-04', amountMinor: -1250, rowKey: 'r1' },
    ];
    const candidates = findDuplicateCandidates(batch, existing, new Map());
    expect(candidates.get('r1')?.[0]).toContain('tx-saved');
  });
});

describe('Import commit planning (T035)', () => {
  it('only commits accepted rows and surfaces the rest', () => {
    const rows = [
      row('row-1', { user_decision: 'accept' }),
      row('row-2', { user_decision: 'exclude' }),
      row('row-3', { user_decision: 'pending' }),
    ];
    const plan = planCommit(rows, new Map());
    expect(plan.accepted.map((r) => r.row.id)).toEqual(['row-1']);
    expect(plan.excluded.map((r) => r.row.id)).toEqual(['row-2']);
    expect(plan.unresolved.map((r) => r.row.id)).toEqual(['row-3']);
  });

  it('builds validated transactions from accepted rows and skips invalid ones', () => {
    const rows = [
      row('row-1', { user_decision: 'accept' }),
      row('row-2', { user_decision: 'accept', parsed_date: null }),
      row('row-3', { user_decision: 'accept', parsed_amount_minor: Number.NaN }),
    ];
    const plan = planCommit(rows, new Map());
    const { transactions, skippedRows } = buildTransactionsFromRows(plan, {
      vaultId: 'vault-1',
      importId: 'import-1',
      defaultCurrency: 'USD',
      now: '2026-08-04T00:00:00.000Z',
      lastModifiedBy: 'web',
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.merchant_display).toBe('Cafe');
    expect(transactions[0]?.amount_minor).toBe(-1250);
    expect(skippedRows.map((r) => r.id)).toEqual(['row-2', 'row-3']);
  });

  it('marks a reviewed import cancelled without creating transactions', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, {
        id: 'vault-1',
        vault_owner_label: null,
        default_currency: 'USD',
        locale: 'en-US',
        week_start: 'locale_default',
        demo_mode: false,
        created_at: '2026-08-04T00:00:00.000Z',
        updated_at: '2026-08-04T00:00:00.000Z',
        deleted_at: null,
      });
      await insertStatementImport(db, {
        id: 'import-cancel',
        vault_id: 'vault-1',
        file_name: 'statement.csv',
        file_type: 'csv',
        file_size_bytes: 10,
        source_fingerprint: 'cancel',
        bank_profile: 'unknown',
        parser_version: 'test',
        status: 'review',
        total_rows: 0,
        recognized_rows: 0,
        warning_count: 0,
        error_count: 0,
        storage_reference: null,
        created_at: '2026-08-04T00:00:00.000Z',
        completed_at: null,
        deleted_at: null,
      });
      await cancelImportToDb(db, {
        vaultId: 'vault-1',
        importId: 'import-cancel',
        now: '2026-08-04T00:01:00.000Z',
      });
      expect((await getStatementImport(db, 'vault-1', 'import-cancel'))?.status).toBe('cancelled');
      expect(await listTransactions(db, { vaultId: 'vault-1' })).toHaveLength(0);
    });
  });

  it('reports an incomplete-commit error when rows remain unresolved', () => {
    expect(commitError().code).toBe(ERROR_CODES.IMPORT_COMMIT_INCOMPLETE);
  });

  it('rejects an accepted row that still has no category', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, {
        id: 'vault-uncategorized',
        vault_owner_label: null,
        default_currency: 'USD',
        locale: 'en-US',
        week_start: 'locale_default',
        demo_mode: false,
        created_at: 'x',
        updated_at: 'x',
        deleted_at: null,
      });
      await expect(
        commitImportToDb(db, {
          session: {
            id: 'import-uncategorized',
            vault_id: 'vault-uncategorized',
            file_name: 'statement.csv',
            file_type: 'csv',
            file_size_bytes: 1,
            source_fingerprint: 'uncategorized',
            bank_profile: null,
            parser_version: 'test',
            status: 'review',
            total_rows: 1,
            recognized_rows: 1,
            warning_count: 0,
            error_count: 0,
            storage_reference: null,
            created_at: 'x',
            completed_at: null,
            deleted_at: null,
          },
          rows: [
            row('row-uncategorized', {
              import_id: 'import-uncategorized',
              user_decision: 'accept',
            }),
          ],
          now: 'x',
          mutationCiphertext: 'encrypted',
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.IMPORT_COMMIT_INCOMPLETE });
    });
  });

  it('persists the committed import, review rows, and accepted transactions atomically', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, {
        id: 'vault-1',
        vault_owner_label: null,
        default_currency: 'USD',
        locale: 'en-US',
        week_start: 'locale_default',
        demo_mode: false,
        created_at: '2026-08-04T00:00:00.000Z',
        updated_at: '2026-08-04T00:00:00.000Z',
        deleted_at: null,
      });
      await insertCategory(db, {
        id: 'cat-food',
        vault_id: 'vault-1',
        name: 'Food and Dining',
        slug: 'food',
        kind: 'expense',
        color_token: 'copper',
        icon_name: 'utensils',
        position: 0,
        is_active: true,
        created_at: 'x',
        updated_at: 'x',
        version: 1,
      });
      const rows = [
        row('row-1', {
          user_decision: 'accept',
          parsed_merchant: 'Coffee Shop',
          suggested_category_id: 'cat-food',
          category_source: 'default_rule',
          category_confidence: 'high',
        }),
        row('row-2', { user_decision: 'exclude', parsed_merchant: 'Ignored Shop' }),
      ];
      const result = await commitImportToDb(db, {
        session: {
          id: 'import-1',
          vault_id: 'vault-1',
          file_name: 'statement.csv',
          file_type: 'csv',
          file_size_bytes: 100,
          source_fingerprint: 'sha256-test',
          bank_profile: 'unknown',
          parser_version: 'test',
          status: 'review',
          total_rows: 2,
          recognized_rows: 2,
          warning_count: 0,
          error_count: 0,
          storage_reference: null,
          created_at: '2026-08-04T00:00:00.000Z',
          completed_at: null,
          deleted_at: null,
        },
        rows,
        now: '2026-08-04T01:00:00.000Z',
        mutationCiphertext: 'test-encrypted-import',
      });

      expect(result.committedRows).toBe(1);
      expect(result.excludedRows).toBe(1);
      expect(await listTransactions(db, { vaultId: 'vault-1' })).toHaveLength(1);
      expect((await getStatementImport(db, 'vault-1', 'import-1'))?.status).toBe('committed');
      expect(await listImportRows(db, 'vault-1', 'import-1')).toHaveLength(2);
      expect((await findMutation(db, 'vault-1', 'import-commit-import-1'))?.ciphertext).toBe(
        'test-encrypted-import',
      );
    });
  });

  it('persists an explicit category correction, learned rule, and provenance atomically', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, {
        id: 'vault-categorization',
        vault_owner_label: null,
        default_currency: 'USD',
        locale: 'en-US',
        week_start: 'locale_default',
        demo_mode: false,
        created_at: '2026-08-05T00:00:00.000Z',
        updated_at: '2026-08-05T00:00:00.000Z',
        deleted_at: null,
      });
      await insertCategory(db, {
        id: 'cat-food',
        vault_id: 'vault-categorization',
        name: 'Food and Dining',
        slug: 'food',
        kind: 'expense',
        color_token: 'copper',
        icon_name: 'utensils',
        position: 0,
        is_active: true,
        created_at: 'x',
        updated_at: 'x',
        version: 1,
      });
      await insertCategory(db, {
        id: 'cat-other',
        vault_id: 'vault-categorization',
        name: 'Other',
        slug: 'other',
        kind: 'other',
        color_token: 'stone',
        icon_name: 'ellipsis',
        position: 1,
        is_active: true,
        created_at: 'x',
        updated_at: 'x',
        version: 1,
      });
      const corrected = row('row-correction', {
        import_id: 'import-correction',
        parsed_merchant: 'Corner Cafe',
        suggested_category_id: 'cat-other',
        category_source: 'default_rule',
        category_confidence: 'medium',
        user_decision: 'accept',
      });
      await commitImportToDb(db, {
        session: {
          id: 'import-correction',
          vault_id: 'vault-categorization',
          file_name: 'statement.csv',
          file_type: 'csv',
          file_size_bytes: 10,
          source_fingerprint: 'correction',
          bank_profile: null,
          parser_version: 'test',
          status: 'review',
          total_rows: 1,
          recognized_rows: 1,
          warning_count: 0,
          error_count: 0,
          storage_reference: null,
          created_at: 'x',
          completed_at: null,
          deleted_at: null,
        },
        rows: [corrected],
        categoryCorrections: [{ rowId: corrected.id, categoryId: 'cat-food', rememberRule: true }],
        now: '2026-08-05T00:00:00.000Z',
        mutationCiphertext: 'encrypted',
      });
      const transaction = (await listTransactions(db, { vaultId: 'vault-categorization' }))[0];
      expect(transaction?.category_id).toBe('cat-food');
      expect(transaction?.category_source).toBe('user');
      expect(transaction?.category_confidence).toBe('confirmed');
      expect(await listCorrectionHistory(db, 'vault-categorization')).toHaveLength(1);
      expect((await listRules(db, 'vault-categorization', false))[0]?.matcher).toBe('corner cafe');
    });
  });
});
