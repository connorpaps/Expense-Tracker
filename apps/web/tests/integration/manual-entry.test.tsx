// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Db, SqlRow } from '@expense-tracker/domain';
import { TransactionsPage } from '../../src/features/transactions/TransactionsPage';
import { encryptMutationPayload, mutationEnvelopeContext } from '../../src/local';

vi.mock('../../src/local', () => ({
  encryptMutationPayload: vi.fn(async () => 'opaque-ciphertext'),
  mutationEnvelopeContext: vi.fn((input: unknown) => JSON.stringify(input)),
}));

const categoryRow: SqlRow = {
  id: 'category-food',
  vault_id: 'vault-test',
  name: 'Food and Dining',
  slug: 'food-and-dining',
  kind: 'expense',
  color_token: 'copper',
  icon_name: 'utensils',
  position: 0,
  is_active: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

type ManualEntryTestDb = Db & { mutations: SqlRow[] };

function createFakeDb(): ManualEntryTestDb {
  const transactions: SqlRow[] = [];
  const mutations: SqlRow[] = [];

  const db: Db = {
    async exec(sql, params = []) {
      if (
        sql.includes('INSERT INTO mutation_log') ||
        sql.includes('INSERT OR IGNORE INTO mutation_log')
      ) {
        mutations.push({
          id: params[0] as unknown as string,
          vault_id: params[1] as unknown as string,
          entity_type: params[2] as unknown as string,
          entity_id: params[3] as unknown as string,
          operation: params[4] as unknown as string,
          base_version: params[5] as number,
          device_id: params[6] as unknown as string,
          lamport_clock: params[7] as number,
          vector_clock: params[8] as unknown as string,
          changed_fields: params[9] as unknown as string,
          ciphertext: params[10] as unknown as string,
          origin: params[11] as unknown as string,
          status: params[12] as unknown as string,
          conflict_id: params[13] as unknown as string | null,
          created_at: params[14] as unknown as string,
          applied_at: params[15] as unknown as string | null,
          retry_count: params[16] as number,
          last_error_code: params[17] as unknown as string | null,
        });
      } else if (sql.includes('INSERT INTO transactions')) {
        const [
          id,
          vaultId,
          occurredOn,
          merchant,
          original,
          amount,
          currency,
          categoryId,
          categorySource,
          categoryConfidence,
          note,
          sourceType,
          importId,
          sourceRowKey,
          reviewState,
          originalPayload,
          createdAt,
          updatedAt,
          deletedAt,
          version,
          modifiedBy,
        ] = params;
        transactions.push({
          id: id as unknown as string,
          vault_id: vaultId as unknown as string,
          occurred_on: occurredOn as unknown as string,
          merchant_display: merchant as unknown as string,
          merchant_original: original as unknown as string | null,
          amount_minor: amount as number,
          currency: currency as unknown as string,
          category_id: categoryId as unknown as string | null,
          category_source: categorySource as unknown as string | null,
          category_confidence: categoryConfidence as unknown as string | null,
          note: note as unknown as string | null,
          source_type: sourceType as unknown as string,
          statement_import_id: importId as unknown as string | null,
          source_row_key: sourceRowKey as unknown as string | null,
          review_state: reviewState as unknown as string,
          original_payload: originalPayload as unknown as string | null,
          created_at: createdAt as unknown as string,
          updated_at: updatedAt as unknown as string,
          deleted_at: deletedAt as unknown as string | null,
          version: version as number,
          last_modified_by: modifiedBy as unknown as unknown as string,
        });
      } else if (sql.startsWith('UPDATE transactions SET deleted_at')) {
        const [deletedAt, updatedAt, modifiedBy, vaultId, id] = params;
        const row = transactions.find(
          (candidate) => candidate.vault_id === vaultId && candidate.id === id,
        );
        if (row) {
          row.deleted_at = deletedAt as unknown as string;
          row.updated_at = updatedAt as unknown as string;
          row.last_modified_by = modifiedBy as unknown as string;
          row.version = (row.version as number) + 1;
        }
      } else if (sql.startsWith('UPDATE transactions SET')) {
        const vaultId = params[params.length - 2] as unknown as string;
        const id = params[params.length - 1] as unknown as string;
        const row = transactions.find(
          (candidate) => candidate.vault_id === vaultId && candidate.id === id,
        );
        if (row) {
          const updatedAt = params[0] as unknown as string;
          const modifiedBy = params[1] as unknown as string;
          row.updated_at = updatedAt;
          row.last_modified_by = modifiedBy;
          row.version = (row.version as number) + 1;
          if (sql.includes('occurred_on = ?')) row.occurred_on = params[2] as unknown as string;
          if (sql.includes('merchant_display = ?'))
            row.merchant_display = params[3] as unknown as string;
          if (sql.includes('amount_minor = ?')) row.amount_minor = params[4] as number;
          if (sql.includes('category_id = ?')) row.category_id = params[5] as unknown as string;
          if (sql.includes('note = ?')) row.note = params[6] as unknown as string | null;
        }
      }
      return { changes: 1 };
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params = []) {
      if (sql.includes('FROM categories')) return [categoryRow] as T[];
      if (sql.includes('FROM transactions')) {
        const vaultId = params[0] as unknown as unknown as string;
        const search = sql.includes('merchant_display LIKE')
          ? String(params[1] ?? '').replaceAll('%', '')
          : '';
        return transactions.filter(
          (row) =>
            row.vault_id === vaultId &&
            row.deleted_at === null &&
            (!search || String(row.merchant_display).includes(search)),
        ) as T[];
      }
      return [] as T[];
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params = []) {
      if (sql.includes('FROM categories'))
        return (params[0] === categoryRow.vault_id && params[1] === categoryRow.id
          ? categoryRow
          : undefined) as unknown as T | undefined;
      if (sql.includes('FROM mutation_log WHERE'))
        return mutations.find(
          (row) => row.vault_id === params[0] && row.id === params[1],
        ) as unknown as T | undefined;
      if (sql.includes('MAX(lamport_clock)')) {
        const rows = mutations.filter(
          (row) => row.vault_id === params[0] && row.device_id === params[1],
        );
        return {
          lamport: rows.reduce((max, row) => Math.max(max, row.lamport_clock as number), 0),
        } as unknown as T;
      }
      return undefined;
    },
    async transaction<T>(fn: (transactionDb: Db) => Promise<T>) {
      return fn(db);
    },
    async close() {},
  };
  return Object.assign(db, { mutations });
}

describe('US2 web manual entry', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: vi.fn(() => `id-${Math.random()}`),
    });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates, creates, edits, and deletes a transaction with local feedback', async () => {
    const user = userEvent.setup();
    const db = createFakeDb();
    render(
      <MemoryRouter>
        <TransactionsPage db={db} vaultId="vault-test" />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Transactions' });
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    await user.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByText('A merchant is required.')).toBeInTheDocument();
    expect(screen.getByText('Enter a non-zero amount.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'Corner Cafe');
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '-12.50');
    await user.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved locally.');
    expect(screen.getByText('Corner Cafe')).toBeInTheDocument();
    const encryptedContext = vi.mocked(mutationEnvelopeContext).mock.calls[0]?.[0] as {
      mutation_id: string;
    };
    expect(db.mutations[0]?.id).toBe(encryptedContext.mutation_id);
    expect(vi.mocked(encryptMutationPayload).mock.calls[0]?.[1]).toBe(
      JSON.stringify(encryptedContext),
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const merchant = screen.getByRole('textbox', { name: 'Merchant' });
    await user.clear(merchant);
    await user.type(merchant, 'Corner Cafe Updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Transaction updated locally.');
    expect(screen.getByText('Corner Cafe Updated')).toBeInTheDocument();

    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Corner Cafe Updated'));
    expect(screen.getByText('Corner Cafe Updated')).toBeInTheDocument();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.getByText('Transaction deleted locally.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Corner Cafe Updated')).not.toBeInTheDocument();
  });
});
