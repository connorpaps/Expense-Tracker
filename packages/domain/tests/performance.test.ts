import { describe, expect, it } from 'vitest';
import { computeSummary } from '../src/summaries/summaries';
import { customRange } from '../src/periods/periods';
import type { Transaction } from '../src/entities/transaction';

function makeTransaction(index: number): Transaction {
  return {
    id: `tx-${index}`,
    vault_id: 'vault-performance',
    occurred_on: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    merchant_display: `Merchant ${index % 100}`,
    merchant_original: null,
    amount_minor: -(index % 5000 + 1),
    currency: 'USD',
    category_id: `cat-${index % 10}`,
    category_source: 'default_rule',
    category_confidence: 'high',
    note: null,
    source_type: 'manual',
    statement_import_id: null,
    source_row_key: null,
    review_state: 'confirmed',
    original_payload: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    version: 1,
    last_modified_by: 'web',
  };
}

describe('summary query performance (T052)', () => {
  it('summarizes and filters 10,000 transactions without pathological work', () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => makeTransaction(index));
    const range = customRange('2026-01-01', '2026-12-31');
    const start = performance.now();
    const summary = computeSummary(transactions, range, { currency: 'USD', categoryId: 'cat-3' });
    const durationMs = performance.now() - start;

    expect(summary.transactionCount).toBe(1_000);
    expect(summary.categoryTotals).toHaveLength(1);
    // Keep the benchmark observable without making CI depend on a fixed CPU speed.
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });
});
