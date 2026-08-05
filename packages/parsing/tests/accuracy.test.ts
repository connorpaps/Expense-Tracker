import { describe, expect, it } from 'vitest';
import type { ExpectedImport } from '@expense-tracker/fixtures';
import {
  generatePdfTableStatement,
  listStatementCsvNames,
  loadExpectedImport,
  readStatementCsv,
  standardPdfStatement,
} from '@expense-tracker/fixtures';
import { parseCsv, parsePdf } from '../src/index';

const CSV_CASES = listStatementCsvNames();

describe('CSV parser accuracy (T027)', () => {
  for (const fileName of CSV_CASES) {
    it(`extracts ${fileName} to the golden normalized rows`, () => {
      const expected = loadExpectedImport(fileName.replace('.csv', ''));
      const result = parseCsv(readStatementCsv(fileName), { fileName });

      expect(result.totalRows).toBe(expected.total_rows);
      expect(result.recognizedRows).toBe(expected.recognized_rows);
      expect(result.profile).toBe(expected.profile);

      const accuracy = assertValidRowCoverage(result.rows, expected);
      // SC-001: at least 95% of valid rows extracted with correct values.
      expect(accuracy, `valid-row extraction for ${fileName}`).toBeGreaterThanOrEqual(0.95);

      for (const errorRow of expected.error_rows) {
        const row = result.rows.find((r) => r.sourceRowNumber === errorRow.source_row_number);
        expect(row, `error row ${errorRow.source_row_number} surfaced`).toBeDefined();
        expect(row?.rowStatus).toBe('error');
        const codes = row?.diagnostics.map((d) => d.code);
        for (const code of errorRow.diagnostic_codes) {
          expect(codes).toContain(code);
        }
      }
    });
  }
});

describe('PDF parser accuracy (T027)', () => {
  it('extracts the generated text-PDF statement to golden rows', async () => {
    const expected = loadExpectedImport('pdf-bank');
    const pdf = standardPdfStatement();
    const result = await parsePdf(pdf, { fileName: 'pdf-bank.pdf' });

    expect(result.profile).toBe('pdf_text');
    expect(result.totalRows).toBe(expected.total_rows);
    expect(result.recognizedRows).toBe(expected.recognized_rows);

    const accuracy = assertValidRowCoverage(result.rows, expected);
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it('reconstructs positioned debit and credit columns', async () => {
    const result = await parsePdf(generatePdfTableStatement(), { fileName: 'td-table.pdf' });

    expect(result.profile).toBe('pdf_text_table');
    expect(result.recognizedRows).toBe(3);
    expect(result.rows.map((row) => [row.parsedDate, row.parsedMerchant, row.parsedAmountMinor])).toEqual([
      ['2026-07-02', 'Uber *Trip Help.Uber.Com Ca', -1845],
      ['2026-07-03', 'Direct Dep - Payroll Gusto', 205000],
      ['2026-07-04', 'Sq *Local Coffee Shop San Fran', -650],
    ]);
  });
});

function assertValidRowCoverage(
  rows: Array<{
    sourceRowNumber: number;
    parsedDate: string | null;
    parsedMerchant: string | null;
    parsedAmountMinor: number | null;
    currency: string | null;
    rowStatus: string;
    diagnostics: unknown[];
  }>,
  expected: ExpectedImport,
): number {
  let matched = 0;
  for (const validRow of expected.valid_rows) {
    const row = rows.find((r) => r.sourceRowNumber === validRow.source_row_number);
    if (
      row?.parsedDate === validRow.occurred_on &&
      row.parsedMerchant === validRow.merchant_display &&
      row.parsedAmountMinor === validRow.amount_minor &&
      row.currency === validRow.currency
    ) {
      matched += 1;
    } else {
      // Mismatches must at least be surfaced with diagnostics, never silent.
      expect(
        row === undefined || row.rowStatus === 'error' || row.diagnostics.length > 0,
        `row ${validRow.source_row_number} mismatch must be surfaced`,
      ).toBe(true);
    }
  }
  return expected.valid_rows.length === 0 ? 1 : matched / expected.valid_rows.length;
}
