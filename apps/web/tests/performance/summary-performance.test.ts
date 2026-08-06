// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { computeSummary, customRange } from '@expense-tracker/domain';
import type { Transaction } from '@expense-tracker/domain';

function makeTransaction(index: number): Transaction {
  return {
    id: `web-perf-${index}`,
    vault_id: 'vault-web-perf',
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

describe('web summary performance (T052)', () => {
  it('measures a 10,000-transaction filtered summary and reports a finite result', () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => makeTransaction(index));
    const start = performance.now();
    const summary = computeSummary(transactions, customRange('2026-01-01', '2026-12-31'), {
      currency: 'USD',
      categoryId: 'cat-7',
    });
    const durationMs = performance.now() - start;

    expect(summary.transactionCount).toBe(1_000);
    expect(Number.isFinite(durationMs)).toBe(true);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });
});
