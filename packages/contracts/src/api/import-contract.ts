/**
 * Import contract types shared by web and iOS. Both clients MUST produce the
 * same normalized review contract from the same statement fixtures.
 */

import type { CategoryConfidence, CategorySource, CategoryExplanation } from '../categorization/provenance';
import type { DiagnosticCode } from '../errors/error-codes';

export type FileType = 'csv' | 'pdf';

export type ImportStatus =
  | 'queued'
  | 'parsing'
  | 'review'
  | 'committed'
  | 'cancelled'
  | 'failed'
  | 'partial';

export type RowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate_candidate'
  | 'excluded'
  | 'accepted';

export type UserDecision = 'accept' | 'exclude' | 'edit' | 'pending';

/** Parser safety limits (also enforced per client). */
export interface ParseLimits {
  maxFileSizeBytes: number;
  maxPdfPages: number;
  maxExtractedTextBytes: number;
  maxRows: number;
  maxDurationMs: number;
}

export const DEFAULT_PARSE_LIMITS: ParseLimits = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxPdfPages: 60,
  maxExtractedTextBytes: 5 * 1024 * 1024,
  maxRows: 50_000,
  maxDurationMs: 30_000,
};

export interface StatementImportDto {
  import_id: string;
  vault_id: string;
  file_name: string;
  file_type: FileType;
  file_size_bytes: number;
  source_fingerprint: string;
  bank_profile: string | null;
  parser_version: string;
  status: ImportStatus;
  total_rows: number;
  recognized_rows: number;
  warning_count: number;
  error_count: number;
  created_at: string;
}

export interface RowDiagnosticDto {
  code: DiagnosticCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ImportRowReviewDto {
  id: string;
  import_id: string;
  source_row_number: number;
  parsed_date: string | null;
  parsed_merchant: string | null;
  parsed_amount_minor: number | null;
  parsed_currency: string | null;
  suggested_category_id: string | null;
  category_source: CategorySource | null;
  category_confidence: CategoryConfidence | null;
  row_status: RowStatus;
  diagnostics: RowDiagnosticDto[];
  duplicate_candidate_ids: string[];
  user_decision: UserDecision;
  explanation?: CategoryExplanation;
}

export interface CommitCounts {
  accepted: number;
  excluded: number;
  unresolved: number;
  duplicate_candidates: number;
  errors: number;
}

export interface ImportPreviewDto {
  session: StatementImportDto;
  rows: ImportRowReviewDto[];
  commit_counts: CommitCounts;
}

export interface CommitImportRequest {
  import_id: string;
  vault_id: string;
  /** Per-row final decisions; rows omitted remain pending and block commit. */
  decisions: Array<{ row_id: string; decision: Exclude<UserDecision, 'pending'> }>;
}

export interface CommitImportResult {
  import_id: string;
  committed_rows: number;
  excluded_rows: number;
  transaction_ids: string[];
}
