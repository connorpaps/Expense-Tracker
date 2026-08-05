import { describe, expect, it } from 'vitest';
import type { Transaction } from '../src/entities/transaction';
import { computeSummary } from '../src/summaries/summaries';
import { customRange } from '../src/periods/periods';

function tx(partial: Partial<Transaction> & { id: string; occurred_on: string; amount_minor: number; merchant_display: string }): Transaction {
  return {
    vault_id: 'vault-1',
    merchant_original: null,
    currency: 'USD',
    category_id: 'cat-food',
    category_source: 'default_rule',
    category_confidence: 'high',
    note: null,
    source_type: 'manual',
    statement_import_id: null,
    source_row_key: null,
    review_state: 'confirmed',
    original_payload: null,
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
    deleted_at: null,
    version: 1,
    last_modified_by: 'web',
    ...partial,
  };
}

describe('Spending summaries (T010)', () => {
  const range = customRange('2026-08-01', '2026-08-31');

  it('totals spend, credits, net activity, and counts', () => {
    const transactions = [
      tx({ id: 'a', occurred_on: '2026-08-03', amount_minor: -2500, merchant_display: 'Cafe' }),
      tx({ id: 'b', occurred_on: '2026-08-10', amount_minor: -8100, merchant_display: 'Grocer' }),
      tx({ id: 'c', occurred_on: '2026-08-12', amount_minor: 1500, merchant_display: 'Refund' }),
    ];
    const summary = computeSummary(transactions, range);
    expect(summary.totalSpendMinor).toBe(-10600);
    expect(summary.totalCreditsMinor).toBe(1500);
    expect(summary.netActivityMinor).toBe(-9100);
    expect(summary.transactionCount).toBe(3);
  });

  it('computes category breakdowns from spend only', () => {
    const transactions = [
      tx({ id: 'a', occurred_on: '2026-08-03', amount_minor: -2500, merchant_display: 'Cafe', category_id: 'cat-food' }),
      tx({ id: 'b', occurred_on: '2026-08-10', amount_minor: -8100, merchant_display: 'Grocer', category_id: 'cat-food' }),
      tx({ id: 'c', occurred_on: '2026-08-12', amount_minor: -1200, merchant_display: 'Metro', category_id: 'cat-transport' }),
      tx({ id: 'd', occurred_on: '2026-08-13', amount_minor: 2000, merchant_display: 'Deposit', category_id: 'cat-income' }),
    ];
    const summary = computeSummary(transactions, range);
    expect(summary.categoryTotals).toEqual([
      { categoryId: 'cat-food', spentMinor: -10600, count: 2 },
      { categoryId: 'cat-transport', spentMinor: -1200, count: 1 },
    ]);
  });

  it('excludes deleted and out-of-range transactions', () => {
    const transactions = [
      tx({ id: 'a', occurred_on: '2026-08-03', amount_minor: -2500, merchant_display: 'Cafe' }),
      tx({ id: 'b', occurred_on: '2026-07-31', amount_minor: -9000, merchant_display: 'Old' }),
      tx({ id: 'c', occurred_on: '2026-08-05', amount_minor: -100, merchant_display: 'Deleted', deleted_at: '2026-08-06T00:00:00.000Z' }),
    ];
    const summary = computeSummary(transactions, range);
    expect(summary.transactionCount).toBe(1);
    expect(summary.totalSpendMinor).toBe(-2500);
  });

  it('supports category filters', () => {
    const transactions = [
      tx({ id: 'a', occurred_on: '2026-08-03', amount_minor: -2500, merchant_display: 'Cafe', category_id: 'cat-food' }),
      tx({ id: 'b', occurred_on: '2026-08-10', amount_minor: -8100, merchant_display: 'Grocer', category_id: 'cat-food' }),
      tx({ id: 'c', occurred_on: '2026-08-12', amount_minor: -1200, merchant_display: 'Metro', category_id: 'cat-transport' }),
    ];
    const summary = computeSummary(transactions, range, { categoryId: 'cat-transport' });
    expect(summary.transactionCount).toBe(1);
    expect(summary.totalSpendMinor).toBe(-1200);
  });

  it('returns an empty (not misleading) summary for empty periods', () => {
    const summary = computeSummary([], range);
    expect(summary.totalSpendMinor).toBe(0);
    expect(summary.totalCreditsMinor).toBe(0);
    expect(summary.transactionCount).toBe(0);
    expect(summary.categoryTotals).toEqual([]);
  });
});
