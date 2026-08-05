import type { CategoryConfidence, CategorySource } from './enums';
import type { LastModifiedBy, ReviewState, TransactionSourceType } from './enums';

export interface Transaction {
  id: string;
  vault_id: string;
  occurred_on: string; // ISO calendar date YYYY-MM-DD
  merchant_display: string;
  merchant_original: string | null;
  amount_minor: number; // exact minor units; sign documented in contracts
  currency: string; // ISO 4217
  category_id: string | null;
  category_source: CategorySource | null;
  category_confidence: CategoryConfidence | null;
  note: string | null;
  source_type: TransactionSourceType;
  statement_import_id: string | null;
  source_row_key: string | null;
  review_state: ReviewState;
  original_payload: string | null; // encrypted JSON when retained
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  last_modified_by: LastModifiedBy;
}

export function newTransaction(input: {
  id: string;
  vault_id: string;
  occurred_on: string;
  merchant_display: string;
  merchant_original?: string | null;
  amount_minor: number;
  currency: string;
  category_id?: string | null;
  category_source?: CategorySource | null;
  category_confidence?: CategoryConfidence | null;
  note?: string | null;
  source_type: TransactionSourceType;
  statement_import_id?: string | null;
  source_row_key?: string | null;
  review_state?: ReviewState;
  original_payload?: string | null;
  now: string;
  last_modified_by?: LastModifiedBy;
}): Transaction {
  return {
    id: input.id,
    vault_id: input.vault_id,
    occurred_on: input.occurred_on,
    merchant_display: input.merchant_display,
    merchant_original: input.merchant_original ?? null,
    amount_minor: input.amount_minor,
    currency: input.currency,
    category_id: input.category_id ?? null,
    category_source: input.category_source ?? null,
    category_confidence: input.category_confidence ?? null,
    note: input.note ?? null,
    source_type: input.source_type,
    statement_import_id: input.statement_import_id ?? null,
    source_row_key: input.source_row_key ?? null,
    review_state: input.review_state ?? 'needs_review',
    original_payload: input.original_payload ?? null,
    created_at: input.now,
    updated_at: input.now,
    deleted_at: null,
    version: 1,
    last_modified_by: input.last_modified_by ?? 'web',
  };
}
