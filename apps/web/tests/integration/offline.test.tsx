// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalStatus } from '../../src/components/LocalStatus';
import { TransactionsPage } from '../../src/features/transactions/TransactionsPage';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';
import type { Db, SqlRow } from '@expense-tracker/domain';

vi.mock('../../src/local', () => ({
  encryptMutationPayload: vi.fn(async () => 'offline-test-ciphertext'),
}));

const categories: SqlRow[] = [
  { id: 'category-food', vault_id: 'vault-offline', name: 'Food and Dining', slug: 'food', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01', version: 1 },
  { id: 'category-other', vault_id: 'vault-offline', name: 'Other', slug: 'other', kind: 'other', color_token: 'stone', icon_name: 'ellipsis', position: 1, is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01', version: 1 },
];

function asString(value: unknown): string { return typeof value === 'string' ? value : ''; }
function asNumber(value: unknown): number { return typeof value === 'number' ? value : 0; }
function rows<T extends SqlRow>(value: T[]): T[] { return value; }

function createOfflineDb(): Db {
  const transactions: SqlRow[] = [];
  const mutations: SqlRow[] = [];
  const corrections: SqlRow[] = [];

  const db: Db = {
    async exec(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT OR IGNORE INTO mutation_log')) {
        mutations.push({ id: asString(params[0]), vault_id: asString(params[1]), entity_type: asString(params[2]), entity_id: asString(params[3]), operation: asString(params[4]), base_version: asNumber(params[5]), device_id: asString(params[6]), lamport_clock: asNumber(params[7]), vector_clock: asString(params[8]), changed_fields: asString(params[9]), ciphertext: asString(params[10]), origin: asString(params[11]), status: 'pending', conflict_id: null, created_at: asString(params[14]), applied_at: null, retry_count: 0, last_error_code: null });
      } else if (sql.includes('INSERT INTO transactions')) {
        const [id, vaultId, occurredOn, merchant, original, amount, currency, categoryId, categorySource, categoryConfidence, note, sourceType, importId, sourceRowKey, reviewState, originalPayload, createdAt, updatedAt, deletedAt, version, modifiedBy] = params;
        transactions.push({ id: asString(id), vault_id: asString(vaultId), occurred_on: asString(occurredOn), merchant_display: asString(merchant), merchant_original: typeof original === 'string' ? original : null, amount_minor: asNumber(amount), currency: asString(currency), category_id: typeof categoryId === 'string' ? categoryId : null, category_source: typeof categorySource === 'string' ? categorySource : null, category_confidence: typeof categoryConfidence === 'string' ? categoryConfidence : null, note: typeof note === 'string' ? note : null, source_type: asString(sourceType), statement_import_id: typeof importId === 'string' ? importId : null, source_row_key: typeof sourceRowKey === 'string' ? sourceRowKey : null, review_state: asString(reviewState), original_payload: typeof originalPayload === 'string' ? originalPayload : null, created_at: asString(createdAt), updated_at: asString(updatedAt), deleted_at: typeof deletedAt === 'string' ? deletedAt : null, version: asNumber(version), last_modified_by: asString(modifiedBy) });
      } else if (sql.includes('INSERT INTO category_correction_history')) {
        corrections.push({
          id: asString(params[0]),
          vault_id: asString(params[1]),
          transaction_id: typeof params[2] === 'string' ? params[2] : null,
          import_id: typeof params[3] === 'string' ? params[3] : null,
          merchant_normalized: asString(params[4]),
          previous_category_id: typeof params[5] === 'string' ? params[5] : null,
          next_category_id: asString(params[6]),
          source: asString(params[7]),
          created_at: asString(params[8]),
        });
      } else if (sql.startsWith('UPDATE transactions SET deleted_at')) {
        const vaultId = asString(params[params.length - 2]);
        const id = asString(params[params.length - 1]);
        const transaction = transactions.find((candidate) => candidate.vault_id === vaultId && candidate.id === id);
        if (transaction) { transaction.deleted_at = asString(params[0]); transaction.version = asNumber(transaction.version) + 1; }
      } else if (sql.startsWith('UPDATE transactions SET')) {
        const vaultId = asString(params[params.length - 2]);
        const id = asString(params[params.length - 1]);
        const transaction = transactions.find((candidate) => candidate.vault_id === vaultId && candidate.id === id);
        if (transaction) {
          transaction.updated_at = asString(params[0]);
          transaction.last_modified_by = asString(params[1]);
          transaction.version = asNumber(transaction.version) + 1;
          let index = 2;
          if (sql.includes('occurred_on = ?')) index += 1;
          if (sql.includes('merchant_display = ?')) transaction.merchant_display = asString(params[index++]);
          if (sql.includes('amount_minor = ?')) transaction.amount_minor = asNumber(params[index++]);
          if (sql.includes('category_id = ?')) transaction.category_id = asString(params[index++]);
        }
      }
      return { changes: 1 };
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes('FROM categories')) return rows(categories) as T[];
      if (sql.includes('FROM category_correction_history')) return rows(corrections) as T[];
      if (sql.includes('FROM transactions')) {
        const vaultId = asString(params[0]);
        const hasStart = sql.includes('occurred_on >= ?');
        const hasEnd = sql.includes('occurred_on <= ?');
        const start = hasStart ? asString(params[1]) : '';
        const end = hasEnd ? asString(params[hasStart ? 2 : 1]) : '';
        const currency = sql.includes('currency = ?') ? asString(params[params.length - 1]) : '';
        return rows(transactions.filter((transaction) => transaction.vault_id === vaultId && transaction.deleted_at === null && (!start || asString(transaction.occurred_on) >= start) && (!end || asString(transaction.occurred_on) <= end) && (!currency || transaction.currency === currency))) as T[];
      }
      return [] as T[];
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      if (sql.includes('COUNT(*) AS n')) return { n: mutations.filter((mutation) => mutation.vault_id === params[0] && mutation.status === 'pending').length } as unknown as T;
      if (sql.includes('MAX(lamport_clock)')) {
        const clocks = mutations
          .filter((mutation) => mutation.vault_id === params[0] && mutation.device_id === params[1])
          .map((mutation) => asNumber(mutation.lamport_clock));
        return { lamport: clocks.length > 0 ? Math.max(...clocks) : null } as unknown as T;
      }
      if (sql.includes('FROM categories')) return categories.find((category) => category.vault_id === params[0] && category.id === params[1]) as unknown as T | undefined;
      if (sql.includes('FROM mutation_log WHERE')) return mutations.find((mutation) => mutation.vault_id === params[0] && mutation.id === params[1]) as unknown as T | undefined;
      return undefined;
    },
    async transaction<T>(fn: (transactionDb: Db) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> {},
  };
  return db;
}

describe('US5 web offline and remount persistence integration', () => {
  it('saves, edits, categorizes, summarizes, and remounts locally while offline', async () => {
    const user = userEvent.setup();
    const db = createOfflineDb();
    const firstView = render(<MemoryRouter><TransactionsPage db={db} vaultId="vault-offline" defaultCurrency="USD" /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Transactions' });
    window.dispatchEvent(new Event('offline'));
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'Offline Cafe');
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '-12.34');
    await user.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved locally.');
    expect(screen.getByText('Offline Cafe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'category-other');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Transaction updated locally.');
    const correctionRows = await db.all<SqlRow>('SELECT * FROM category_correction_history WHERE vault_id = ?', ['vault-offline']);
    expect(correctionRows).toHaveLength(1);
    expect(correctionRows[0]).toMatchObject({ next_category_id: 'category-other', previous_category_id: 'category-food' });
    firstView.unmount();

    const statusView = render(<LocalStatus db={db} vaultId="vault-offline" />);
    await waitFor(() => expect(statusView.getByText(/local change/)).toBeInTheDocument());
    window.dispatchEvent(new Event('offline'));
    expect(await statusView.findByText(/Browser offline · saved locally/)).toBeInTheDocument();
    statusView.unmount();

    const dashboardView = render(<MemoryRouter><DashboardPage db={db} vaultId="vault-offline" defaultCurrency="USD" /></MemoryRouter>);
    expect(await dashboardView.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect((await dashboardView.findAllByText('-12.34')).length).toBeGreaterThan(0);
    dashboardView.unmount();

    const remountedView = render(<MemoryRouter><TransactionsPage db={db} vaultId="vault-offline" defaultCurrency="USD" /></MemoryRouter>);
    expect(await remountedView.findByText('Offline Cafe')).toBeInTheDocument();
    expect(remountedView.getByText('Other')).toBeInTheDocument();
    cleanup();
  });
});

describe('US5 web offline status', () => {
  it('shows durable local status and pending changes without implying sync is active', async () => {
    const view = render(<LocalStatus db={createOfflineDb()} vaultId="vault-offline" />);
    expect(view.getByRole('status')).toHaveTextContent('Saved locally');
    expect(view.getByRole('status')).toHaveTextContent('sync not connected');
    await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('No local changes awaiting synchronization'));
  });

  it('responds to offline and online browser transitions', async () => {
    const view = render(<LocalStatus db={createOfflineDb()} vaultId="vault-offline" />);
    const status = view.getByRole('status');
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(status).toHaveTextContent('Browser offline · saved locally'));
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(status).toHaveTextContent('Saved locally'));
  });
});
