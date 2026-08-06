import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeSummary,
  customRange,
  formatMinor,
  listCategories,
  listTransactions,
  periodRange,
} from '@expense-tracker/domain';
import { CATEGORY_CONFIDENCE_LABELS, CATEGORY_SOURCE_LABELS } from '@expense-tracker/contracts';
import type { Category, Db, SpendingSummary, Transaction } from '@expense-tracker/domain';

interface DashboardPageProps {
  db: Db;
  vaultId: string;
  defaultCurrency?: string;
}

type PeriodChoice = 'week' | 'month' | 'custom';

export function DashboardPage({ db, vaultId, defaultCurrency = 'CAD' }: DashboardPageProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<PeriodChoice>('month');
  const [customStart, setCustomStart] = useState(today.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState(today);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    try {
      return period === 'custom'
        ? customRange(customStart, customEnd)
        : periodRange({ type: period, anchor: today, weekStart: 'locale_default' });
    } catch {
      return null;
    }
  }, [period, customStart, customEnd, today]);

  const refresh = useCallback(async () => {
    if (!range) return;
    try {
      const [nextCategories, nextTransactions, nextAllTransactions, nextHistoryTransactions] =
        await Promise.all([
          listCategories(db, vaultId),
          listTransactions(db, { vaultId, range, currency: defaultCurrency }),
          listTransactions(db, { vaultId, range }),
          listTransactions(db, { vaultId }),
        ]);
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setAllTransactions(nextAllTransactions);
      setHistoryTransactions(nextHistoryTransactions);
      const transferCategoryIds = nextCategories
        .filter((category) => category.kind === 'transfer')
        .map((category) => category.id);
      setSummary(
        computeSummary(nextTransactions, range, {
          currency: defaultCurrency,
          excludeCategoryIds: transferCategoryIds,
        }),
      );
      setError(null);
    } catch (cause) {
      console.error('Dashboard refresh failed', cause);
      setError('The overview could not be refreshed. Your local data is unchanged.');
    }
  }, [db, vaultId, range, defaultCurrency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const categoryTotal =
    summary?.categoryTotals.reduce((total, item) => total + Math.abs(item.spentMinor), 0) ?? 0;

  return (
    <section className="page" aria-labelledby="dashboard-heading">
      <header className="page__header page__header--row">
        <div>
          <h1 id="dashboard-heading">Overview</h1>
          <p className="page__subtitle">
            A calm, local read on what moved through your vault during the selected period.
          </p>
        </div>
        <div className="page-header__actions">
          <Link className="button button--secondary" to="/transactions">
            View history
          </Link>
          <Link className="button button--primary" to="/import">
            Import statement
          </Link>
        </div>
      </header>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {allTransactions.length !== transactions.length && (
        <p className="notice notice--warning" role="status">
          This period includes other currencies. Totals below show {defaultCurrency} only; no
          conversion is applied.
        </p>
      )}

      <div className="period-bar" aria-label="Summary period">
        <div className="period-bar__choices" role="group" aria-label="Choose summary period">
          {(['week', 'month', 'custom'] as PeriodChoice[]).map((choice) => (
            <button
              key={choice}
              type="button"
              className={`segmented${period === choice ? ' segmented--active' : ''}`}
              aria-pressed={period === choice}
              onClick={() => setPeriod(choice)}
            >
              {choice === 'week' ? 'This week' : choice === 'month' ? 'This month' : 'Custom range'}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="period-bar__dates">
            <label>
              From{' '}
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label>
              To{' '}
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {summary && (
        <>
          <div className="summary-strip" aria-label="Spending summary">
            <div className="summary-stat summary-stat--accent">
              <span>Total spent</span>
              <strong>{formatMinor(Math.abs(summary.totalSpendMinor), defaultCurrency)}</strong>
              <small>outgoing activity</small>
            </div>
            <div className="summary-stat">
              <span>Credits</span>
              <strong>{formatMinor(summary.totalCreditsMinor, defaultCurrency)}</strong>
              <small>refunds and income</small>
            </div>
            <div className="summary-stat">
              <span>Net activity</span>
              <strong>{formatMinor(summary.netActivityMinor, defaultCurrency)}</strong>
              <small>spend plus credits</small>
            </div>
            <div className="summary-stat">
              <span>Records</span>
              <strong>{summary.transactionCount}</strong>
              <small>in this period</small>
            </div>
          </div>

          {summary.transactionCount === 0 ? (
            <div className="panel panel--empty" role="status">
              {allTransactions.length > 0 ? (
                <>
                  <h2>No {defaultCurrency} activity in this period</h2>
                  <p>
                    Your vault has {allTransactions.length} record
                    {allTransactions.length === 1 ? '' : 's'} in the selected dates, but none use{' '}
                    {defaultCurrency}. Overview does not convert currencies.
                  </p>
                  <div className="empty-actions">
                    <Link className="button button--primary" to="/transactions">
                      View transactions
                    </Link>
                  </div>
                </>
              ) : historyTransactions.length > 0 ? (
                <>
                  <h2>No activity in this period</h2>
                  <p>
                    Your vault has {historyTransactions.length} saved record
                    {historyTransactions.length === 1 ? '' : 's'}, but none fall within the selected
                    dates.
                  </p>
                  <div className="empty-actions">
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => {
                        const dates = historyTransactions
                          .map((transaction) => transaction.occurred_on)
                          .sort();
                        setCustomStart(dates[0] ?? customStart);
                        setCustomEnd(dates[dates.length - 1] ?? customEnd);
                        setPeriod('custom');
                      }}
                    >
                      Show all history
                    </button>
                    <Link className="button button--secondary" to="/transactions">
                      View transactions
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2>No activity in this period</h2>
                  <p>
                    Try another range, add a manual expense, or import a statement to give this view
                    something to read.
                  </p>
                  <div className="empty-actions">
                    <Link className="button button--primary" to="/transactions">
                      Add expense
                    </Link>
                    <Link className="button button--secondary" to="/import">
                      Import statement
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="dashboard-grid">
              <section className="panel category-breakdown" aria-labelledby="category-heading">
                <div className="section-heading">
                  <div>
                    <h2 id="category-heading">Category breakdown</h2>
                  </div>
                  <span className="section-heading__meta">
                    {summary.categoryTotals.length} categories
                  </span>
                </div>
                <div className="category-breakdown__list">
                  {summary.categoryTotals.map((item) => {
                    const category = categoryById.get(item.categoryId);
                    const share =
                      categoryTotal > 0
                        ? Math.round((Math.abs(item.spentMinor) / categoryTotal) * 100)
                        : 0;
                    const provenance = item.provenance;
                    const sourceLabels = provenance.sources
                      .map((source) => CATEGORY_SOURCE_LABELS[source])
                      .join(' · ');
                    const confidenceLabels = provenance.confidences
                      .map((confidence) => CATEGORY_CONFIDENCE_LABELS[confidence])
                      .join(' · ');
                    return (
                      <div className="category-line" key={item.categoryId}>
                        <div className="category-line__label">
                          <span>{category?.name ?? 'Needs review'}</span>
                          <strong>{formatMinor(Math.abs(item.spentMinor), defaultCurrency)}</strong>
                        </div>
                        <div className="category-line__track" aria-hidden="true">
                          <span style={{ width: `${share}%` }} />
                        </div>
                        <small>
                          {share}% · {item.count} record{item.count === 1 ? '' : 's'}
                        </small>
                        <small className="category-line__provenance">
                          {sourceLabels} · {confidenceLabels}
                          {provenance.reviewCount > 0
                            ? ` · ${provenance.reviewCount} needs review`
                            : ''}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel recent-panel" aria-labelledby="recent-heading">
                <div className="section-heading">
                  <div>
                    <h2 id="recent-heading">Recent activity</h2>
                  </div>
                  <Link to="/transactions">See all</Link>
                </div>
                <div className="recent-list">
                  {transactions.slice(0, 6).map((transaction) => (
                    <div className="recent-line" key={transaction.id}>
                      <div>
                        <strong>{transaction.merchant_display}</strong>
                        <small>
                          {transaction.occurred_on} ·{' '}
                          {transaction.category_id
                            ? (categoryById.get(transaction.category_id)?.name ?? 'Needs review')
                            : 'Needs review'}
                        </small>
                      </div>
                      <span className={transaction.amount_minor > 0 ? 'amount--credit' : ''}>
                        {formatMinor(transaction.amount_minor, transaction.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
