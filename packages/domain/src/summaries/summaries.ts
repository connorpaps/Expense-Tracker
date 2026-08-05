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
  /** Only include expense-kind transactions when true (default). */
  expensesOnly?: boolean;
}

export interface CategoryTotal {
  categoryId: string;
  spentMinor: number;
  count: number;
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
  const categoryMap = new Map<string, { spentMinor: number; count: number }>();

  for (const tx of transactions) {
    if (tx.deleted_at !== null) continue;
    if (!rangeContains(range, tx.occurred_on)) continue;
    if (filters.categoryId !== undefined && filters.categoryId !== null && tx.category_id !== filters.categoryId) {
      continue;
    }
    const currency = tx.currency;
    const amount = new Money(tx.amount_minor, currency);
    transactionCount += 1;

    if (amount.isNegative) {
      totalSpendMinor += amount.minor;
      const existing = categoryMap.get(tx.category_id ?? '');
      if (existing) {
        existing.spentMinor += amount.minor;
        existing.count += 1;
      } else {
        categoryMap.set(tx.category_id ?? '', { spentMinor: amount.minor, count: 1 });
      }
    } else {
      totalCreditsMinor += amount.minor;
    }
  }

  const categoryTotals = Array.from(categoryMap.entries())
    .map(([categoryId, value]) => ({ categoryId, ...value }))
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
