import type { FileType, ImportStatus, RowStatus, UserDecision } from '@expense-tracker/contracts';
import type { CategoryConfidence, CategorySource } from './enums';
import type { DiagnosticCode } from '@expense-tracker/contracts';

export interface StatementImport {
  id: string;
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
  storage_reference: string | null;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

export interface RowDiagnostic {
  code: DiagnosticCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ImportRowReview {
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
  diagnostics: RowDiagnostic[];
  duplicate_candidate_ids: string[];
  user_decision: UserDecision;
}

export function canTransition(from: ImportStatus, to: ImportStatus): boolean {
  const allowed: Record<ImportStatus, ImportStatus[]> = {
    queued: ['parsing', 'cancelled'],
    parsing: ['review', 'failed', 'partial'],
    partial: ['review', 'failed'],
    review: ['committed', 'cancelled'],
    committed: [],
    cancelled: [],
    failed: [],
  };
  return (allowed[from] ?? []).includes(to);
}
