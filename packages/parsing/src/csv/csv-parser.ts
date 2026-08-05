/**
 * CSV statement parser (T028). Handles quoted fields, blank rows, header
 * detection, profile detection, date/sign normalization, row diagnostics, and
 * parser limits. Every problematic row is surfaced with diagnostics — financial
 * data is never silently discarded.
 */

import Papa from 'papaparse';
import type { RowDiagnostic } from '@expense-tracker/domain';
import { DIAGNOSTIC_CODES } from '@expense-tracker/contracts';
import type { ParsedRow, ParsedStatement, ParseOptions } from '../types';
import { ParseError, mergedLimits, throwIfCancelled } from '../types';
import { detectProfile } from '../profiles/bank-profiles';
import { parseStatementDate } from '../normalization/dates';
import { parseAmountMinor } from '../normalization/amounts';
import { displayMerchant } from '../normalization/merchant';

export const CSV_PARSER_VERSION = 'csv-0.1.0';

export function parseCsv(content: string, options: ParseOptions): ParsedStatement {
  const limits = mergedLimits(options.limits);
  const currency = options.currency ?? 'USD';

  if (content.length > limits.maxFileSizeBytes) {
    throw new ParseError(
      'IMPORT_TOO_LARGE',
      `This file is larger than the ${Math.round(limits.maxFileSizeBytes / 1024 / 1024)} MB import limit.`,
    );
  }

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const dataRows = result.data;

  // Header-only or truly empty files report an explicit empty state with the
  // detected profile (unknown when no columns are recognizable).
  const headers = Object.keys(dataRows[0] ?? {});
  const { profile, roles } = detectProfile(headers);
  const rows: ParsedRow[] = [];
  const statementWarnings: string[] = [];
  let errorCount = 0;
  let recognizedRows = 0;

  const processed = dataRows.slice(0, limits.maxRows);
  if (dataRows.length > limits.maxRows) {
    statementWarnings.push(
      `Import truncated at ${limits.maxRows} rows; the remaining ${dataRows.length - limits.maxRows} rows were not processed.`,
    );
  }

  processed.forEach((record, index) => {
    throwIfCancelled(options.token);
    if (index % 1000 === 0) {
      options.onProgress?.({ phase: 'parsing', current: index, total: processed.length });
    }

    const dateRaw = roles.date ? record[roles.date] ?? null : null;
    const merchantRaw = roles.merchant ? record[roles.merchant] ?? null : null;

    const diagnostics: RowDiagnostic[] = [];
    const parsedDate = parseStatementDate(dateRaw);
    if (dateRaw === null || String(dateRaw).trim() === '') {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_MISSING_DATE, message: 'This row has no date.', severity: 'error' });
    } else if (parsedDate === null) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_INVALID_DATE, message: `Date "${String(dateRaw)}" could not be read.`, severity: 'error' });
    }

    const merchantDisplay = displayMerchant(merchantRaw);
    if (!merchantDisplay) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_MISSING_MERCHANT, message: 'This row has no merchant description.', severity: 'error' });
    }

    const parsedAmount = pickAmountMinor(record, roles, currency);
    if (parsedAmount === null && !hasPresentAmount(record, roles)) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_MISSING_AMOUNT, message: 'This row has no amount.', severity: 'error' });
    } else if (parsedAmount === null) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_INVALID_AMOUNT, message: `Amount could not be read for this row.`, severity: 'error' });
    }

    const hasErrors = diagnostics.some((d) => d.severity === 'error');
    const row: ParsedRow = {
      sourceRowNumber: index + 1,
      parsedDate,
      parsedMerchant: merchantDisplay,
      merchantOriginal: merchantRaw === null ? null : String(merchantRaw).trim(),
      parsedAmountMinor: parsedAmount,
      currency,
      diagnostics,
      rowStatus: hasErrors ? 'error' : 'valid',
    };
    if (hasErrors) errorCount += 1;
    if (parsedDate !== null && merchantDisplay !== null && parsedAmount !== null) {
      recognizedRows += 1;
    }
    rows.push(row);
  });

  options.onProgress?.({ phase: 'finalizing', current: processed.length, total: processed.length });

  return {
    profile,
    fileType: 'csv',
    totalRows: processed.length,
    recognizedRows,
    rows,
    warningCount: statementWarnings.length,
    errorCount,
    cancelled: false,
    statementWarnings,
    parserVersion: CSV_PARSER_VERSION,
  };
}

/**
 * Resolve the signed minor-unit amount for a row. Debit columns are stored
 * positive and normalize to negative spending; credit columns stay positive.
 */
function pickAmountMinor(
  record: Record<string, string>,
  roles: { amount: string | null; debit: string | null; credit: string | null },
  currency: string,
): number | null {
  if (roles.debit) {
    const debit = record[roles.debit];
    if (debit !== undefined && String(debit).trim() !== '') {
      const minor = parseAmountMinor(debit, currency);
      return minor === null ? null : -Math.abs(minor);
    }
  }
  if (roles.credit) {
    const credit = record[roles.credit];
    if (credit !== undefined && String(credit).trim() !== '') {
      return parseAmountMinor(credit, currency);
    }
  }
  if (roles.amount) {
    const amount = record[roles.amount];
    if (amount === undefined || String(amount).trim() === '') return null;
    return parseAmountMinor(amount, currency);
  }
  return null;
}

function hasPresentAmount(
  record: Record<string, string>,
  roles: { amount: string | null; debit: string | null; credit: string | null },
): boolean {
  for (const key of [roles.amount, roles.debit, roles.credit]) {
    if (key && record[key] !== undefined && String(record[key]).trim() !== '') return true;
  }
  return false;
}
