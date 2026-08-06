import type { CategoryConfidence, CategorySource } from '../entities/enums';
import type { Transaction } from '../entities/transaction';
import { Money } from '../money/money';
import type { DateRange } from '../periods/periods';
import { rangeContains } from '../periods/periods';

/**
 * Derived spending projections. Summaries MUST be recalculable from
 * transactions and MUST NOT be independently editable.
 */

export interface SummaryFilters {
  categoryId?: string | null;
  /** Restrict arithmetic to one explicit currency; no implicit conversion occurs. */
  currency?: string | null;
  /** When true, exclude positive credit/refund transactions from the summary. */
  expensesOnly?: boolean;
  /** Categories such as Transfers remain visible in history but are excluded from ordinary totals. */
  excludeCategoryIds?: readonly string[];
}

/** Provenance for spending rows in a category; credits are intentionally excluded. */
export interface CategoryProvenanceSummary {
  sources: CategorySource[];
  confidences: CategoryConfidence[];
  reviewCount: number;
}

export interface CategoryTotal {
  categoryId: string;
  spentMinor: number;
  count: number;
  provenance: CategoryProvenanceSummary;
}

export interface SpendingSummary {
  vaultId: string;
  range: DateRange;
  totalSpendMinor: number;
  totalCreditsMinor: number;
  netActivityMinor: number;
  transactionCount: number;
  categoryTotals: CategoryTotal[];
}

/** Amount semantics: negative minor units represent spending; positive = credits. */
export function amountDirection(amountMinor: number): 'spend' | 'credit' {
  return amountMinor < 0 ? 'spend' : 'credit';
}

export function computeSummary(
  transactions: readonly Transaction[],
  range: DateRange,
  filters: SummaryFilters = {},
): SpendingSummary {
  let totalSpendMinor = 0;
  let totalCreditsMinor = 0;
  let transactionCount = 0;
  const categoryMap = new Map<string, {
    spentMinor: number;
    count: number;
    sources: Set<CategorySource>;
    confidences: Set<CategoryConfidence>;
    reviewCount: number;
  }>();

  for (const tx of transactions) {
    if (tx.deleted_at !== null) continue;
    if (!rangeContains(range, tx.occurred_on)) continue;
    if (filters.categoryId !== undefined && filters.categoryId !== null && tx.category_id !== filters.categoryId) {
      continue;
    }
    if (filters.excludeCategoryIds?.includes(tx.category_id ?? '')) {
      continue;
    }
    if (filters.currency !== undefined && filters.currency !== null && tx.currency !== filters.currency) {
      continue;
    }
    const currency = tx.currency;
    const amount = new Money(tx.amount_minor, currency);
    if (filters.expensesOnly === true && !amount.isNegative) continue;
    transactionCount += 1;

    if (amount.isNegative) {
      totalSpendMinor += amount.minor;
      const categoryId = tx.category_id ?? '';
      const source = tx.category_source ?? 'manual_required';
      const confidence = tx.category_confidence ?? 'unresolved';
      const existing = categoryMap.get(categoryId);
      if (existing) {
        existing.spentMinor += amount.minor;
        existing.count += 1;
        existing.sources.add(source);
        existing.confidences.add(confidence);
        if (tx.review_state === 'needs_review' || confidence === 'unresolved') existing.reviewCount += 1;
      } else {
        categoryMap.set(categoryId, {
          spentMinor: amount.minor,
          count: 1,
          sources: new Set([source]),
          confidences: new Set([confidence]),
          reviewCount: tx.review_state === 'needs_review' || confidence === 'unresolved' ? 1 : 0,
        });
      }
    } else {
      totalCreditsMinor += amount.minor;
    }
  }

  const categoryTotals = Array.from(categoryMap.entries())
    .map(([categoryId, value]) => ({
      categoryId,
      spentMinor: value.spentMinor,
      count: value.count,
      provenance: {
        sources: [...value.sources].sort(),
        confidences: [...value.confidences].sort(),
        reviewCount: value.reviewCount,
      },
    }))
    .sort((a, b) => a.spentMinor - b.spentMinor);

  return {
    vaultId: transactions[0]?.vault_id ?? '',
    range,
    totalSpendMinor,
    totalCreditsMinor,
    netActivityMinor: totalSpendMinor + totalCreditsMinor,
    transactionCount,
    categoryTotals,
  };
}
