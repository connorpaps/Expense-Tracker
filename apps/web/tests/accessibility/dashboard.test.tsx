// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import type { Db, SqlRow } from '@expense-tracker/domain';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';

function fakeDb(): Db {
  const category: SqlRow = {
    id: 'food', vault_id: 'vault-test', name: 'Food and Dining', slug: 'food', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', version: 1,
  };
  return {
    async exec() { return { changes: 0 }; },
    async all<T extends SqlRow = SqlRow>(sql: string) { return (sql.includes('FROM categories') ? [category] : []) as T[]; },
    async get() { return undefined; },
    async transaction<T>(fn: (db: Db) => Promise<T>) { return fn(fakeDb()); },
    async close() {},
  };
}

describe('US3 dashboard accessibility', () => {
  it('exposes labeled period controls and passes serious axe checks', async () => {
    const { container } = render(<MemoryRouter><DashboardPage db={fakeDb()} vaultId="vault-test" /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Choose summary period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true');
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });
});
