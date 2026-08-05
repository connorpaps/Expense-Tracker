/**
 * Web import contract tests (T025). The web client MUST produce the same
 * normalized review contract (ImportPreviewDto) from the same statement
 * fixtures that iOS will consume, so parity is asserted against the
 * independently-authored golden expectations in packages/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { readStatementCsv, loadExpectedImport, listStatementCsvNames } from '@expense-tracker/fixtures';
import { DEFAULT_CATEGORIES, categorySlug } from '@expense-tracker/domain';
import type { Category } from '@expense-tracker/domain';
import { parseFileInProcess } from '../src/features/imports/parse-file';
import { buildImportPreview } from '../src/features/imports/import-pipeline';
import type { ImportPreviewDto } from '@expense-tracker/contracts';

const categories: Category[] = DEFAULT_CATEGORIES.map((c, index) => ({
  id: `cat-${categorySlug(c.name)}`,
  vault_id: 'vault-test',
  name: c.name,
  slug: categorySlug(c.name),
  kind: c.kind,
  color_token: c.color_token,
  icon_name: c.icon_name,
  position: index,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
}));

function fileFromText(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

async function previewFor(name: string): Promise<ImportPreviewDto> {
  const csv = readStatementCsv(name);
  const { statement } = await parseFileInProcess(fileFromText(name, csv), () => {});
  return buildImportPreview(statement, {
    vaultId: 'vault-test',
    categories,
    personalRules: [],
    existingTransactions: [],
    now: '2026-01-15T12:00:00.000Z',
    fileName: name,
    fileType: 'csv',
    fileSizeBytes: csv.length,
  });
}

describe('web import contract (T025)', () => {
  it('produces a normalized review contract for every golden CSV fixture', async () => {
    const names = listStatementCsvNames();
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const expected = loadExpectedImport(name.replace('.csv', ''));
      const preview = await previewFor(name);

      // Session fields must match the independently-authored goldens.
      expect(preview.session.file_name).toBe(name);
      expect(preview.session.bank_profile).toBe(expected.profile);
      expect(preview.session.total_rows).toBe(expected.total_rows);
      expect(preview.session.recognized_rows).toBe(expected.recognized_rows);
      expect(preview.session.status).toBe(expected.total_rows === 0 ? 'failed' : 'review');
      expect(preview.session.file_type).toBe('csv');

      // Every valid golden row must round-trip through the contract.
      for (const golden of expected.valid_rows) {
        const row = preview.rows.find((r) => r.source_row_number === golden.source_row_number);
        expect(row, `${name} row ${golden.source_row_number} exists`).toBeDefined();
        expect(row?.parsed_date).toBe(golden.occurred_on);
        expect(row?.parsed_merchant).toBe(golden.merchant_display);
        expect(row?.parsed_amount_minor).toBe(golden.amount_minor);
        expect(row?.parsed_currency).toBe(golden.currency);
        expect(row?.user_decision).toBe('accept');
      }

      // Golden error rows must be flagged and block commit.
      for (const golden of expected.error_rows) {
        const row = preview.rows.find((r) => r.source_row_number === golden.source_row_number);
        expect(row, `${name} error row ${golden.source_row_number} exists`).toBeDefined();
        expect(row?.row_status).toBe('error');
        expect(row?.user_decision).toBe('pending');
        const codes = row?.diagnostics.map((d) => d.code) ?? [];
        for (const code of golden.diagnostic_codes) {
          expect(codes).toContain(code);
        }
      }

      // Commit-count invariants must hold.
      const counts = preview.commit_counts;
      expect(counts.accepted + counts.excluded + counts.unresolved).toBe(preview.rows.length);
      expect(counts.errors).toBe(preview.rows.filter((r) => r.row_status === 'error').length);
      expect(counts.unresolved).toBe(preview.rows.filter((r) => r.user_decision === 'pending').length);
      expect(counts.duplicate_candidates).toBe(
        preview.rows.filter((r) => r.row_status === 'duplicate_candidate').length,
      );
    }
  });

  it('assigns deterministic category suggestions from default rules', async () => {
    const preview = await previewFor('amex.csv');
    const coffee = preview.rows.find((r) => r.parsed_merchant === 'Starbucks');
    expect(coffee?.suggested_category_id).toBe('cat-food-and-dining');
    expect(coffee?.category_source).toBe('default_rule');

    const travel = preview.rows.find((r) => r.parsed_merchant === 'Uber *Trip');
    expect(travel?.suggested_category_id).toBe('cat-transportation');
  });


  it('treats an empty statement as a failed session with no rows', async () => {
    const preview = await previewFor('empty.csv');
    expect(preview.session.status).toBe('failed');
    expect(preview.session.total_rows).toBe(0);
    expect(preview.rows).toHaveLength(0);
    expect(preview.commit_counts.unresolved).toBe(0);
  });
});
