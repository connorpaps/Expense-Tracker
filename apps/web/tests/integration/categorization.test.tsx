// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPage } from '../../src/features/imports/ImportPage';
import { SettingsPage } from '../../src/features/settings/SettingsPage';
import type { Db, SqlRow } from '@expense-tracker/domain';

const categoryRows: SqlRow[] = [
  { id: 'food', vault_id: 'v1', name: 'Food and Dining', slug: 'food', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: 1, created_at: 'x', updated_at: 'x', version: 1 },
  { id: 'other', vault_id: 'v1', name: 'Other', slug: 'other', kind: 'other', color_token: 'stone', icon_name: 'ellipsis', position: 1, is_active: 1, created_at: 'x', updated_at: 'x', version: 1 },
];

function fakeDb(): Db {
  const rules: SqlRow[] = [];
  return {
    async exec(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO categorization_rules')) rules.push({ id: params[0] as string, vault_id: params[1] as string, category_id: params[2] as string, matcher: params[4] as string, is_active: 1, priority: 10, confidence: 0.9, evidence_count: 1, rule_type: 'personal_merchant', created_from: 'user_correction', created_at: 'x', updated_at: 'x', version: 1 });
      return { changes: 1 };
    },
    async all<T extends SqlRow = SqlRow>(sql: string) {
      if (sql.includes('FROM categories')) return categoryRows as T[];
      if (sql.includes('FROM categorization_rules')) return rules as T[];
      return [] as T[];
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      if (sql.includes('FROM categories')) return categoryRows.find((row) => row.id === params[1]) as T | undefined;
      if (sql.includes('FROM categorization_rules')) return rules.find((row) => row.id === params[1]) as T | undefined;
      return undefined;
    },
    async transaction<T>(fn: (db: Db) => Promise<T>) { return fn(this); },
    async close() {},
  };
}

describe('US4 web categorization', () => {
  it('exposes explainable category correction and remember control during import review', async () => {
    const user = userEvent.setup();
    const parseFile = vi.fn(async () => ({
      statement: {
        profile: 'test', fileType: 'csv' as const, parserVersion: 'test', totalRows: 1, recognizedRows: 1, warningCount: 0, errorCount: 0, cancelled: false, statementWarnings: [],
        rows: [{ sourceRowNumber: 1, parsedDate: '2026-08-05', parsedMerchant: 'Corner Cafe', merchantOriginal: 'Corner Cafe', parsedAmountMinor: -1250, currency: 'USD', rowStatus: 'valid' as const, diagnostics: [] }],
      },
    }));
    render(<ImportPage db={fakeDb()} vaultId="v1" parseFile={parseFile} />);
    const input = screen.getByLabelText('Choose a statement file to import');
    await user.upload(input, new File(['x'], 'statement.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('table', { name: 'Imported transactions review' })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Category for Corner Cafe' });
    await user.selectOptions(select, 'food');
    expect(screen.getByText('Remember this merchant')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Remember this merchant'));
    const commit = screen.getByRole('button', { name: 'Commit import' });
    expect(commit).toBeEnabled();
    await user.click(commit);
    expect(await screen.findByRole('status')).toHaveTextContent('Import saved');
  });

  it('renders settings rule management controls and accessible status', async () => {
    render(<MemoryRouter><SettingsPage db={fakeDb()} vaultId="v1" onVaultChange={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Personal merchant rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save rule' })).toBeInTheDocument();
    expect(screen.getByText(/No personal rules yet/)).toBeInTheDocument();
  });
});
