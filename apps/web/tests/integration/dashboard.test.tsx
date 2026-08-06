// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Db, SqlRow } from '@expense-tracker/domain';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';

const categories: SqlRow[] = [
  {
    id: 'food', vault_id: 'vault-test', name: 'Food and Dining', slug: 'food', kind: 'expense',
    color_token: 'copper', icon_name: 'utensils', position: 0, is_active: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', version: 1,
  },
  {
    id: 'income', vault_id: 'vault-test', name: 'Income', slug: 'income', kind: 'income',
    color_token: 'green', icon_name: 'arrow-down-left', position: 1, is_active: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', version: 1,
  },
];

const transactions: SqlRow[] = [
  {
    id: 'tx-food', vault_id: 'vault-test', occurred_on: '2026-08-03', merchant_display: 'Corner Cafe', merchant_original: null,
    amount_minor: -1250, currency: 'USD', category_id: 'food', category_source: 'user', category_confidence: 'confirmed', note: null,
    source_type: 'manual', statement_import_id: null, source_row_key: null, review_state: 'confirmed', original_payload: null,
    created_at: '2026-08-03T12:00:00.000Z', updated_at: '2026-08-03T12:00:00.000Z', deleted_at: null, version: 1, last_modified_by: 'web',
  },
  {
    id: 'tx-credit', vault_id: 'vault-test', occurred_on: '2026-08-04', merchant_display: 'Refund', merchant_original: null,
    amount_minor: 500, currency: 'USD', category_id: 'income', category_source: 'user', category_confidence: 'confirmed', note: null,
    source_type: 'manual', statement_import_id: null, source_row_key: null, review_state: 'confirmed', original_payload: null,
    created_at: '2026-08-04T12:00:00.000Z', updated_at: '2026-08-04T12:00:00.000Z', deleted_at: null, version: 1, last_modified_by: 'web',
  },
  {
    id: 'tx-eur', vault_id: 'vault-test', occurred_on: '2026-08-05', merchant_display: 'Euro Cafe', merchant_original: null,
    amount_minor: -900, currency: 'EUR', category_id: 'food', category_source: 'user', category_confidence: 'confirmed', note: null,
    source_type: 'manual', statement_import_id: null, source_row_key: null, review_state: 'confirmed', original_payload: null,
    created_at: '2026-08-05T12:00:00.000Z', updated_at: '2026-08-05T12:00:00.000Z', deleted_at: null, version: 1, last_modified_by: 'web',
  },
];

function fakeDb(): Db {
  return {
    async exec() { return { changes: 0 }; },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      if (sql.includes('FROM categories')) return categories as T[];
      if (sql.includes('FROM transactions')) {
        const vaultId = params[0] as string;
        let index = 1;
        const start = sql.includes('occurred_on >= ?') ? params[index++] as string : null;
        const end = sql.includes('occurred_on <= ?') ? params[index++] as string : null;
        const currency = sql.includes('currency = ?') ? params[index++] as string : null;
        return transactions.filter((row) =>
          row.vault_id === vaultId &&
          row.deleted_at === null &&
          (!start || String(row.occurred_on) >= start) &&
          (!end || String(row.occurred_on) <= end) &&
          (!currency || row.currency === currency),
        ) as T[];
      }
      return [] as T[];
    },
    async get() { return undefined; },
    async transaction<T>(fn: (db: Db) => Promise<T>) { return fn(fakeDb()); },
    async close() {},
  };
}

describe('US3 web dashboard', () => {
  it('shows exact totals, credits, category breakdown, and mixed-currency notice', async () => {
    render(<MemoryRouter><DashboardPage db={fakeDb()} vaultId="vault-test" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('-12.50')).toBeInTheDocument();
    expect(screen.getAllByText('5.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('-7.50')).toBeInTheDocument();
    expect(screen.getByText('This period includes other currencies. Totals below show USD only; no conversion is applied.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Category breakdown' })).toBeInTheDocument();
    expect(screen.getByText('Food and Dining')).toBeInTheDocument();
    expect(screen.getByText('You chose this · Confirmed')).toBeInTheDocument();
  });

  it('switches to a custom range and exposes an accessible empty state', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DashboardPage db={fakeDb()} vaultId="vault-test" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Custom range' }));
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    await user.clear(from);
    await user.type(from, '2026-01-01');
    await user.clear(to);
    await user.type(to, '2026-01-31');

    expect(await screen.findByText('No activity in this period')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Try another range');
  });
});
