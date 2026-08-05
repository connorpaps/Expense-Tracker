import type { ExpectedImport } from './fixture-loader';

export interface GoldenNormalizedRow {
  sourceRowNumber: number;
  occurredOn: string | null;
  merchantDisplay: string | null;
  amountMinor: number | null;
  currency: string | null;
  rowStatus: string;
}

export interface GoldenRunResult {
  totalRows: number;
  recognizedRows: number;
  rows: GoldenNormalizedRow[];
}

/**
 * Runs a platform parser against every expected valid/error row without
 * coupling the fixtures package to a particular parser implementation.
 */
export function assertGoldenImport(result: GoldenRunResult, expected: ExpectedImport): string[] {
  const failures: string[] = [];
  if (result.totalRows !== expected.total_rows) failures.push(`total_rows: expected ${expected.total_rows}, got ${result.totalRows}`);
  if (result.recognizedRows !== expected.recognized_rows) failures.push(`recognized_rows: expected ${expected.recognized_rows}, got ${result.recognizedRows}`);

  for (const golden of expected.valid_rows) {
    const row = result.rows.find((candidate) => candidate.sourceRowNumber === golden.source_row_number);
    if (!row) {
      failures.push(`missing valid row ${golden.source_row_number}`);
      continue;
    }
    if (row.occurredOn !== golden.occurred_on) failures.push(`row ${golden.source_row_number}: date mismatch`);
    if (row.merchantDisplay !== golden.merchant_display) failures.push(`row ${golden.source_row_number}: merchant mismatch`);
    if (row.amountMinor !== golden.amount_minor) failures.push(`row ${golden.source_row_number}: amount mismatch`);
    if (row.currency !== golden.currency) failures.push(`row ${golden.source_row_number}: currency mismatch`);
  }

  for (const golden of expected.error_rows) {
    const row = result.rows.find((candidate) => candidate.sourceRowNumber === golden.source_row_number);
    if (!row) failures.push(`missing error row ${golden.source_row_number}`);
    else if (row.rowStatus !== 'error') failures.push(`row ${golden.source_row_number}: expected error status`);
  }
  return failures;
}
