import type {
  CommitCounts,
  ImportPreviewDto,
  ImportRowReviewDto,
  StatementImportDto,
} from '@expense-tracker/contracts';
import {
  ERROR_CODES,
  SAFE_MESSAGES,
  errorToJson,
} from '@expense-tracker/contracts';
import type { Category, CategorizationRule, RowDiagnostic } from '@expense-tracker/domain';
import type { ParsedStatement } from '@expense-tracker/parsing';
import { findDuplicateCandidates, suggestCategory, randomUuid } from '@expense-tracker/domain';
import type { Transaction } from '@expense-tracker/domain';

export interface PipelineContext {
  vaultId: string;
  categories: Category[];
  personalRules: CategorizationRule[];
  existingTransactions: Transaction[];
  now: string;
  fileName: string;
  fileType: 'csv' | 'pdf';
  fileSizeBytes: number;
}

export function buildImportPreview(statement: ParsedStatement, context: PipelineContext): ImportPreviewDto {
  const importId = randomUuid();
  const suggestionContext = { categories: context.categories, personalRules: context.personalRules };

  const existingByRowKey = new Map(
    context.existingTransactions
      .filter((tx) => tx.statement_import_id !== null && tx.source_row_key !== null)
      .map((tx) => [`${tx.statement_import_id}:${tx.source_row_key}`, tx]),
  );

  const duplicateMap = findDuplicateCandidates(
    statement.rows
      .filter((row) => row.parsedMerchant !== null && row.parsedAmountMinor !== null && row.parsedDate !== null)
      .map((row) => ({
        merchant: row.parsedMerchant ?? '',
        occurredOn: row.parsedDate ?? '',
        amountMinor: row.parsedAmountMinor ?? 0,
        rowKey: String(row.sourceRowNumber),
      })),
    context.existingTransactions,
    existingByRowKey,
  );

  const rows: ImportRowReviewDto[] = statement.rows.map((row) => {
    const suggestion = suggestCategory(row.parsedMerchant ?? '', suggestionContext);
    const duplicates = duplicateMap.get(String(row.sourceRowNumber)) ?? [];
    return {
      id: randomUuid(),
      import_id: importId,
      source_row_number: row.sourceRowNumber,
      parsed_date: row.parsedDate,
      parsed_merchant: row.parsedMerchant,
      parsed_amount_minor: row.parsedAmountMinor,
      parsed_currency: row.currency,
      suggested_category_id: suggestion.categoryId,
      category_source: suggestion.source,
      category_confidence: suggestion.confidence,
      row_status: row.rowStatus === 'error' ? 'error' : duplicates.length > 0 ? 'duplicate_candidate' : 'valid',
      diagnostics: row.diagnostics,
      duplicate_candidate_ids: duplicates,
      // Duplicate candidates require an explicit user decision; they must not
      // silently enter the vault just because the parser recognized the row.
      user_decision: row.rowStatus === 'error' || duplicates.length > 0 ? 'pending' : 'accept',
      explanation: suggestion.explanation,
    };
  });

  const commitCounts: CommitCounts = {
    accepted: rows.filter((r) => r.user_decision === 'accept').length,
    excluded: rows.filter((r) => r.user_decision === 'exclude').length,
    unresolved: rows.filter((r) => r.user_decision === 'pending').length,
    duplicate_candidates: rows.filter((r) => r.row_status === 'duplicate_candidate').length,
    errors: rows.filter((r) => r.row_status === 'error').length,
  };

  const session: StatementImportDto = {
    import_id: importId,
    vault_id: context.vaultId,
    file_name: context.fileName,
    file_type: context.fileType,
    file_size_bytes: context.fileSizeBytes,
    source_fingerprint: fingerprint(statement),
    bank_profile: statement.profile,
    parser_version: statement.parserVersion,
    status: statement.totalRows === 0 ? 'failed' : statement.rows.length > 0 ? 'review' : 'failed',
    total_rows: statement.totalRows,
    recognized_rows: statement.recognizedRows,
    warning_count: statement.warningCount,
    error_count: statement.errorCount,
    created_at: context.now,
  };

  return { session, rows, commit_counts: commitCounts };
}

/** Stable non-reversible fingerprint for duplicate-import warnings. */
export function fingerprint(statement: ParsedStatement): string {
  const payload = statement.rows
    .map((row) => `${row.parsedDate}|${row.parsedMerchant}|${row.parsedAmountMinor}`)
    .join(',');
  return `sha256-${simpleHash(payload)}`;
}

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseErrorMessage(code: string): string {
  // Accept the pre-contract parser names as well so an already-open tab or
  // older worker bundle still renders a useful PDF diagnostic.
  const legacyParserCodes: Record<string, string> = {
    PDF_ENCRYPTED: ERROR_CODES.IMPORT_PDF_ENCRYPTED,
    PDF_IMAGE_ONLY: ERROR_CODES.IMPORT_PDF_IMAGE_ONLY,
    PDF_UNSUPPORTED_LAYOUT: ERROR_CODES.IMPORT_PDF_UNSUPPORTED_LAYOUT,
  };
  const normalizedCode = legacyParserCodes[code] ?? code;
  const known = (ERROR_CODES as Record<string, string>)[normalizedCode];
  if (known) {
    return SAFE_MESSAGES[known as keyof typeof SAFE_MESSAGES] ?? 'This file could not be imported.';
  }
  return 'This file could not be imported.';
}

export { errorToJson };

export type { RowDiagnostic };
