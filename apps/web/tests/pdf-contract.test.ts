// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadExpectedImport, standardPdfStatement } from '@expense-tracker/fixtures';
import { parsePdf } from '@expense-tracker/parsing';
import { buildImportPreview } from '../src/features/imports/import-pipeline';
import { DEFAULT_CATEGORIES, categorySlug } from '@expense-tracker/domain';
import type { Category } from '@expense-tracker/domain';

const categories: Category[] = DEFAULT_CATEGORIES.map((category, index) => ({
  id: `cat-${categorySlug(category.name)}`,
  vault_id: 'vault-test',
  name: category.name,
  slug: categorySlug(category.name),
  kind: category.kind,
  color_token: category.color_token,
  icon_name: category.icon_name,
  position: index,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
}));

describe('web PDF import contract (T025)', () => {
  it('categorizes the real TD statement through PDF parsing and import preview', async () => {
    const pdf = readFileSync(new URL('../../../TD_Bank_Realistic_Mock.pdf', import.meta.url));
    const statement = await parsePdf(pdf, { fileName: 'TD_Bank_Realistic_Mock.pdf' });
    const preview = buildImportPreview(statement, {
      vaultId: 'vault-test',
      categories,
      personalRules: [],
      existingTransactions: [],
      now: '2026-01-15T12:00:00.000Z',
      fileName: 'TD_Bank_Realistic_Mock.pdf',
      fileType: 'pdf',
      fileSizeBytes: pdf.byteLength,
    });
    expect(preview.rows).toHaveLength(19);
    expect(preview.rows.filter((row) => row.suggested_category_id !== null)).toHaveLength(19);
    expect(preview.rows.every((row) => row.user_decision === 'accept')).toBe(true);
    expect(
      preview.rows.find((row) => row.parsed_merchant === 'Target 00012345 Los Angeles')
        ?.suggested_category_id,
    ).toBe('cat-shopping');
    expect(
      preview.rows.find((row) => row.parsed_merchant === "Trader Joe's Qps")?.suggested_category_id,
    ).toBe('cat-food-and-dining');
    expect(
      preview.rows.find((row) => row.parsed_merchant === 'Netflix.Com Netflix.Com Ca')
        ?.suggested_category_id,
    ).toBe('cat-subscriptions');
    expect(
      preview.rows.find((row) => row.parsed_merchant === 'Ach Withdrawal - Amex Epay')
        ?.suggested_category_id,
    ).toBe('cat-transfers');
  });

  it('matches the shared text-PDF normalized contract', async () => {
    const pdf = standardPdfStatement();
    const statement = await parsePdf(pdf, { fileName: 'pdf-bank.pdf' });
    const preview = buildImportPreview(statement, {
      vaultId: 'vault-test',
      categories,
      personalRules: [],
      existingTransactions: [],
      now: '2026-01-15T12:00:00.000Z',
      fileName: 'pdf-bank.pdf',
      fileType: 'pdf',
      fileSizeBytes: pdf.byteLength,
    });
    const expected = loadExpectedImport('pdf-bank');
    expect(preview.session.file_type).toBe('pdf');
    expect(preview.session.total_rows).toBe(expected.total_rows);
    expect(preview.session.recognized_rows).toBe(expected.recognized_rows);
    expect(
      preview.rows.map((row) => [row.parsed_date, row.parsed_merchant, row.parsed_amount_minor]),
    ).toEqual(
      expected.valid_rows.map((row) => [row.occurred_on, row.merchant_display, row.amount_minor]),
    );
  });
});
