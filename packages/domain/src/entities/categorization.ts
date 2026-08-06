import type { CategorySource } from '@expense-tracker/contracts';

/** An explicit user correction retained as local learning evidence. */
export interface CategoryCorrectionHistory {
  id: string;
  vault_id: string;
  transaction_id: string | null;
  import_id: string | null;
  merchant_normalized: string;
  previous_category_id: string | null;
  next_category_id: string;
  source: CategorySource;
  created_at: string;
}
