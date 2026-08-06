import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_CONFIDENCE_LABELS, CATEGORY_SOURCE_LABELS } from '@expense-tracker/contracts';
import {
  getCategory,
  insertTransaction,
  listCategories,
  listTransactions,
  newTransaction,
  persistTransactionMutation,
  softDeleteTransaction,
  updateTransaction,
  recordCategoryCorrection,
  rememberMerchantRule,
} from '@expense-tracker/domain';
import type { Category, Db, Transaction } from '@expense-tracker/domain';
import { validateTransaction } from '@expense-tracker/domain';
import { formatMinor } from '@expense-tracker/domain';
import { encryptMutationPayload, mutationEnvelopeContext } from '../../local';

interface TransactionsPageProps {
  db: Db;
  vaultId: string;
  defaultCurrency?: string;
}

type FormState = {
  occurred_on: string;
  merchant_display: string;
  amount: string;
  category_id: string;
  note: string;
};

const emptyForm = (categoryId = ''): FormState => ({
  occurred_on: new Date().toISOString().slice(0, 10),
  merchant_display: '',
  amount: '',
  category_id: categoryId,
  note: '',
});

function buildRange(start: string, end: string): { start: string; end: string } | undefined {
  if (!start && !end) return undefined;
  return { start: start || '0000-01-01', end: end || '9999-12-31' };
}

export function TransactionsPage({ db, vaultId, defaultCurrency = 'CAD' }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [rememberCategoryRule, setRememberCategoryRule] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryName = useCallback(
    (id: string | null) =>
      categories.find((category) => category.id === id)?.name ?? 'Needs review',
    [categories],
  );

  const refresh = useCallback(async () => {
    const [nextCategories, nextTransactions] = await Promise.all([
      listCategories(db, vaultId),
      listTransactions(db, {
        vaultId,
        search: search.trim() || null,
        categoryId: categoryId || null,
        range: buildRange(startDate, endDate),
      }),
    ]);
    setCategories(nextCategories);
    setTransactions(sortNewest ? nextTransactions : [...nextTransactions].reverse());
    if (!form.category_id && nextCategories[0]) {
      setForm((current) => ({ ...current, category_id: nextCategories[0]!.id }));
    }
  }, [db, vaultId, search, categoryId, startDate, endDate, sortNewest, form.category_id]);

  useEffect(() => {
    void refresh().catch((cause) => {
      console.error('Transactions refresh failed', cause);
      setError('Transactions could not be loaded. Reload the app and try again.');
    });
  }, [refresh]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm(categories.find((category) => category.is_active)?.id ?? ''));
    setIssues({});
    setShowForm(false);
  };

  const beginEdit = (transaction: Transaction) => {
    setEditing(transaction);
    setForm({
      occurred_on: transaction.occurred_on,
      merchant_display: transaction.merchant_display,
      amount: (transaction.amount_minor / 100).toFixed(2),
      category_id: transaction.category_id ?? '',
      note: transaction.note ?? '',
    });
    setIssues({});
    setRememberCategoryRule(false);
    setShowForm(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(form.amount.replace(/,/g, ''));
    const amountMinor = Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
    const validation = validateTransaction({
      occurred_on: form.occurred_on,
      merchant_display: form.merchant_display,
      amount_minor: amountMinor,
      currency: defaultCurrency,
      category_id: form.category_id || null,
      require_category: true,
    });
    const nextIssues = Object.fromEntries(validation.map((issue) => [issue.field, issue.message]));
    setIssues(nextIssues);
    setError(null);
    if (validation.length > 0) return;

    const now = new Date().toISOString();
    try {
      const category = await getCategory(db, vaultId, form.category_id);
      if (!category || !category.is_active) {
        setIssues({ category_id: 'Choose an active category.' });
        return;
      }
      const id = editing?.id ?? crypto.randomUUID();
      const payload = {
        occurred_on: form.occurred_on,
        merchant_display: form.merchant_display.trim(),
        amount_minor: amountMinor,
        currency: defaultCurrency,
        category_id: form.category_id,
        note: form.note.trim() || null,
      };
      const nextTransaction = editing
        ? {
            ...editing,
            ...payload,
            category_source: 'user' as const,
            category_confidence: 'confirmed' as const,
            review_state: 'confirmed' as const,
            updated_at: now,
            last_modified_by: 'web' as const,
          }
        : newTransaction({
            id,
            vault_id: vaultId,
            ...payload,
            merchant_original: null,
            category_source: 'user',
            category_confidence: 'confirmed',
            source_type: 'manual',
            review_state: 'confirmed',
            now,
            last_modified_by: 'web',
          });
      const mutationPayload = editing
        ? {
            entity: 'transaction',
            value: {
              id,
              vault_id: vaultId,
              occurred_on: payload.occurred_on,
              merchant_display: payload.merchant_display,
              amount_minor: payload.amount_minor,
              category_id: payload.category_id,
              category_source: 'user',
              category_confidence: 'confirmed',
              note: payload.note,
              review_state: 'confirmed',
              updated_at: now,
            },
          }
        : { entity: 'transaction', value: nextTransaction };
      const mutationChangedFields = editing
        ? [
            'occurred_on',
            'merchant_display',
            'amount_minor',
            'category_id',
            'category_source',
            'category_confidence',
            'note',
            'review_state',
          ]
        : Object.keys(payload);
      const mutationId = crypto.randomUUID();
      const operation = editing ? ('update' as const) : ('create' as const);
      const ciphertext = await encryptMutationPayload(
        mutationPayload,
        mutationEnvelopeContext({
          mutation_id: mutationId,
          vault_id: vaultId,
          entity_type: 'transaction',
          entity_id: id,
          operation,
          base_version: editing?.version ?? 0,
          changed_fields: mutationChangedFields,
        }),
      );
      if (editing) {
        await persistTransactionMutation(db, {
          mutationId,
          vaultId,
          deviceId: 'web',
          entityId: id,
          operation: 'update',
          baseVersion: editing.version,
          changedFields: mutationChangedFields,
          ciphertext,
          origin: 'web',
          now,
          apply: async (transactionDb) => {
            await updateTransaction(transactionDb, vaultId, id, {
              ...payload,
              category_source: 'user',
              category_confidence: 'confirmed',
              review_state: 'confirmed',
              updated_at: now,
              last_modified_by: 'web',
            });
            if (editing.category_id !== form.category_id) {
              await recordCategoryCorrection(transactionDb, {
                vaultId,
                transactionId: id,
                merchant: payload.merchant_display,
                previousCategoryId: editing.category_id,
                nextCategoryId: form.category_id,
                now,
              });
              if (rememberCategoryRule) {
                await rememberMerchantRule(transactionDb, {
                  vaultId,
                  merchant: payload.merchant_display,
                  categoryId: form.category_id,
                  now,
                });
              }
            }
          },
        });
        setNotice('Transaction updated locally.');
      } else {
        const transaction = nextTransaction;
        await persistTransactionMutation(db, {
          mutationId,
          vaultId,
          deviceId: 'web',
          entityId: id,
          operation: 'create',
          changedFields: mutationChangedFields,
          ciphertext,
          origin: 'web',
          now,
          apply: (transactionDb) => insertTransaction(transactionDb, transaction),
        });
        setNotice('Expense saved locally.');
      }
      resetForm();
      await refresh();
    } catch (cause) {
      console.error('Transaction save failed', cause);
      setError('The transaction could not be saved. Your existing data is unchanged.');
    }
  };

  const deleteTransaction = async (transaction: Transaction) => {
    if (
      !window.confirm(
        `Delete ${transaction.merchant_display}? This removes it from active history.`,
      )
    )
      return;
    try {
      const now = new Date().toISOString();
      const mutationId = crypto.randomUUID();
      const ciphertext = await encryptMutationPayload(
        {
          entity: 'transaction',
          value: { id: transaction.id, vault_id: vaultId, deleted_at: now, updated_at: now },
        },
        mutationEnvelopeContext({
          mutation_id: mutationId,
          vault_id: vaultId,
          entity_type: 'transaction',
          entity_id: transaction.id,
          operation: 'delete',
          base_version: transaction.version,
          changed_fields: ['deleted_at'],
        }),
      );
      await persistTransactionMutation(db, {
        mutationId,
        vaultId,
        deviceId: 'web',
        entityId: transaction.id,
        operation: 'delete',
        baseVersion: transaction.version,
        changedFields: ['deleted_at'],
        ciphertext,
        origin: 'web',
        now,
        apply: (transactionDb) =>
          softDeleteTransaction(transactionDb, vaultId, transaction.id, now, 'web'),
      });
      setNotice('Transaction deleted locally.');
      await refresh();
    } catch (cause) {
      console.error('Transaction deletion failed', cause);
      setError('The transaction could not be deleted.');
    }
  };

  const hasFilters = Boolean(search || categoryId || startDate || endDate);
  const activeCategoryCount = useMemo(
    () => categories.filter((category) => category.is_active).length,
    [categories],
  );

  return (
    <section className="page" aria-labelledby="transactions-heading">
      <header className="page__header page__header--row">
        <div>
          <h1 id="transactions-heading">Transactions</h1>
          <p className="page__subtitle">
            Your local history, ready to search, correct, and shape into a clearer picture.
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setEditing(null);
            setRememberCategoryRule(false);
            setForm(emptyForm(categories.find((category) => category.is_active)?.id ?? ''));
            setIssues({});
            setShowForm(true);
          }}
        >
          Add expense
        </button>
      </header>

      {notice && (
        <p className="notice notice--success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form
          className="panel transaction-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <div className="transaction-form__heading">
            <div>
              <p className="panel__eyebrow">{editing ? 'EDIT RECORD' : 'LOCAL ENTRY'}</p>
              <h2>{editing ? 'Edit transaction' : 'Add an expense'}</h2>
            </div>
            <button type="button" className="button button--ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label>
              Date
              <input
                id="transaction-date"
                type="date"
                value={form.occurred_on}
                onChange={(event) => setForm({ ...form, occurred_on: event.target.value })}
                aria-label="Date"
                aria-invalid={Boolean(issues.occurred_on)}
                aria-describedby={issues.occurred_on ? 'transaction-date-error' : undefined}
              />
              {issues.occurred_on && (
                <span id="transaction-date-error" className="field-error">
                  {issues.occurred_on}
                </span>
              )}
            </label>
            <label>
              Merchant
              <input
                id="transaction-merchant"
                value={form.merchant_display}
                onChange={(event) => setForm({ ...form, merchant_display: event.target.value })}
                placeholder="e.g. Corner cafe"
                aria-label="Merchant"
                aria-invalid={Boolean(issues.merchant_display)}
                aria-describedby={
                  issues.merchant_display ? 'transaction-merchant-error' : undefined
                }
              />
              {issues.merchant_display && (
                <span id="transaction-merchant-error" className="field-error">
                  {issues.merchant_display}
                </span>
              )}
            </label>
            <label>
              Amount
              <input
                id="transaction-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="-12.50 for spending"
                aria-label="Amount"
                aria-invalid={Boolean(issues.amount_minor)}
                aria-describedby={issues.amount_minor ? 'transaction-amount-error' : undefined}
              />
              {issues.amount_minor && (
                <span id="transaction-amount-error" className="field-error">
                  {issues.amount_minor}
                </span>
              )}
            </label>
            <label>
              Category
              <select
                id="transaction-category"
                value={form.category_id}
                onChange={(event) => setForm({ ...form, category_id: event.target.value })}
                aria-label="Category"
                aria-invalid={Boolean(issues.category_id)}
                aria-describedby={issues.category_id ? 'transaction-category-error' : undefined}
              >
                <option value="">Choose a category</option>
                {categories
                  .filter((category) => category.is_active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              {issues.category_id && (
                <span id="transaction-category-error" className="field-error">
                  {issues.category_id}
                </span>
              )}
            </label>
            {editing && (
              <label className="form-grid__wide form-check">
                <input
                  type="checkbox"
                  checked={rememberCategoryRule}
                  onChange={(event) => setRememberCategoryRule(event.target.checked)}
                />
                Remember this merchant’s category for future imports
              </label>
            )}
            <label className="form-grid__wide">
              Note <span className="label-hint">optional</span>
              <textarea
                id="transaction-note"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={3}
                placeholder="Anything useful to remember"
                aria-label="Note"
              />
            </label>
          </div>
          <div className="transaction-form__footer">
            <span className="form-hint">
              {activeCategoryCount} active categories · saved only on this device
            </span>
            <button type="submit" className="button button--primary">
              {editing ? 'Save changes' : 'Save expense'}
            </button>
          </div>
        </form>
      )}

      <div className="filter-bar" aria-label="Transaction filters">
        <label className="filter-bar__search">
          <span className="sr-only">Search transactions</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant or note"
          />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            aria-label="Start date"
          />
        </label>
        <label>
          <span className="sr-only">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            aria-label="End date"
          />
        </label>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setSortNewest((value) => !value)}
        >
          {sortNewest ? 'Newest first' : 'Oldest first'}
        </button>
        {hasFilters && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              setSearch('');
              setCategoryId('');
              setStartDate('');
              setEndDate('');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="panel panel--empty" role="status">
          <h2>{hasFilters ? 'No matching transactions' : 'Your history starts here'}</h2>
          <p>
            {hasFilters
              ? 'Try a different filter or reset the current view.'
              : 'Add a cash purchase or import a statement. Every saved record stays on this device.'}
          </p>
          {!hasFilters && (
            <Link className="button button--secondary" to="/import">
              Import a statement
            </Link>
          )}
        </div>
      ) : (
        <div className="transaction-list" aria-live="polite">
          <div className="transaction-list__summary">
            {transactions.length} record{transactions.length === 1 ? '' : 's'} shown
          </div>
          {transactions.map((transaction) => (
            <article className="transaction-row" key={transaction.id}>
              <div className="transaction-row__date">{transaction.occurred_on}</div>
              <div className="transaction-row__main">
                <strong>{transaction.merchant_display}</strong>
                <span>
                  {categoryName(transaction.category_id)} · {transaction.source_type}
                </span>
                {transaction.category_source && (
                  <small>
                    {CATEGORY_SOURCE_LABELS[transaction.category_source]}
                    {transaction.category_confidence
                      ? ` · ${CATEGORY_CONFIDENCE_LABELS[transaction.category_confidence]}`
                      : ''}
                  </small>
                )}
                {transaction.note && <small>{transaction.note}</small>}
              </div>
              <div
                className={`transaction-row__amount${transaction.amount_minor > 0 ? ' transaction-row__amount--credit' : ''}`}
              >
                {formatMinor(transaction.amount_minor, transaction.currency)}
              </div>
              <div className="transaction-row__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => beginEdit(transaction)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button button--ghost button--danger"
                  onClick={() => void deleteTransaction(transaction)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
