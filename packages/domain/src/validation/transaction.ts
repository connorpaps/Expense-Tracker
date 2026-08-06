import { ERROR_CODES, appError } from '@expense-tracker/contracts';
import type { AppError } from '@expense-tracker/contracts';
import { isCurrencyCode } from '../money/currency';
import { isValidIsoDate } from '../periods/dates';

export interface TransactionInput {
  occurred_on?: string | null;
  merchant_display?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  category_id?: string | null;
  require_category?: boolean;
}

export type ValidationIssue = {
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
  field: string;
  message: string;
};

/**
 * Validate the required fields of a transaction before it ever reaches the
 * durable queue. Returns the list of issues; empty list means valid.
 */
export function validateTransaction(input: TransactionInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.occurred_on) {
    issues.push({ code: ERROR_CODES.DATE_INVALID, field: 'occurred_on', message: 'A date is required.' });
  } else if (!isValidIsoDate(input.occurred_on)) {
    issues.push({ code: ERROR_CODES.DATE_INVALID, field: 'occurred_on', message: 'Enter a valid date.' });
  }

  const merchant = input.merchant_display?.trim() ?? '';
  if (!merchant) {
    issues.push({
      code: ERROR_CODES.VALIDATION_FAILED,
      field: 'merchant_display',
      message: 'A merchant is required.',
    });
  }

  if (input.amount_minor === null || input.amount_minor === undefined) {
    issues.push({ code: ERROR_CODES.AMOUNT_INVALID, field: 'amount_minor', message: 'An amount is required.' });
  } else if (!Number.isSafeInteger(input.amount_minor) || input.amount_minor === 0) {
    issues.push({ code: ERROR_CODES.AMOUNT_INVALID, field: 'amount_minor', message: 'Enter a non-zero amount.' });
  }

  if (!input.currency) {
    issues.push({ code: ERROR_CODES.CURRENCY_REQUIRED, field: 'currency', message: 'Choose a currency.' });
  } else if (!isCurrencyCode(input.currency)) {
    issues.push({
      code: ERROR_CODES.VALIDATION_FAILED,
      field: 'currency',
      message: 'This currency is not supported.',
    });
  }

  if (input.require_category && !input.category_id) {
    issues.push({
      code: ERROR_CODES.VALIDATION_FAILED,
      field: 'category_id',
      message: 'Choose a category.',
    });
  }

  return issues;
}

export function validationError(issues: ValidationIssue[]): AppError {
  const first = issues[0];
  return appError(ERROR_CODES.VALIDATION_FAILED, first?.message ?? 'Some details are missing or invalid.', {
    fieldReference: first?.field ?? null,
    retryable: false,
  });
}
