import type { CategoryConfidence, CategorySource } from '@expense-tracker/contracts';

export type { CategoryConfidence, CategorySource };

export type WeekStart = 'locale_default' | 'sunday' | 'monday';

export type CategoryKind = 'expense' | 'income' | 'transfer' | 'other';

export type TransactionSourceType = 'manual' | 'csv' | 'pdf' | 'demo';

export type ReviewState = 'confirmed' | 'needs_review' | 'excluded' | 'conflict';

export type LastModifiedBy = 'web' | 'ios' | 'relay' | 'importer';

export type RuleType =
  | 'default_keyword'
  | 'default_pattern'
  | 'personal_merchant'
  | 'personal_pattern'
  | 'context_override';

export type RuleCreatedFrom = 'system' | 'user_correction' | 'explicit_user_rule';

export type DeviceStatus = 'pending' | 'active' | 'revoked';

export type PeriodType = 'week' | 'month' | 'custom';
