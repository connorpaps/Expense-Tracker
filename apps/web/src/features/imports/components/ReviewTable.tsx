import type { ImportPreviewDto, ImportRowReviewDto, UserDecision } from '@expense-tracker/contracts';
import { CATEGORY_CONFIDENCE_LABELS, CATEGORY_SOURCE_LABELS } from '@expense-tracker/contracts';
import { formatMinor } from '@expense-tracker/domain';
import { StatusBadge } from './StatusBadge';

interface ReviewTableProps {
  preview: ImportPreviewDto;
  categories: Array<{ id: string; name: string }>;
  decisions: Map<string, UserDecision>;
  attentionOnly: boolean;
  onToggleAttention: () => void;
  onDecision: (rowId: string, decision: 'accept' | 'exclude') => void;
}

export function ReviewTable({
  preview,
  categories,
  decisions,
  attentionOnly,
  onToggleAttention,
  onDecision,
}: ReviewTableProps) {
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'No category';

  const needsAttention = (row: ImportRowReviewDto) =>
    row.row_status === 'error' || row.row_status === 'duplicate_candidate' || row.diagnostics.length > 0;

  const visibleRows = attentionOnly ? preview.rows.filter(needsAttention) : preview.rows;
  const attentionCount = preview.rows.filter(needsAttention).length;

  if (preview.rows.length === 0) {
    return (
      <div className="panel panel--empty" role="status">
        <h2>No transactions found</h2>
        <p>This file does not contain any recognizable transactions. Check the file and try again.</p>
      </div>
    );
  }

  return (
    <div className="review">
      <div className="review__toolbar">
        <button
          type="button"
          className={`chip${attentionOnly ? ' chip--active' : ''}`}
          aria-pressed={attentionOnly}
          onClick={onToggleAttention}
        >
          Needs attention {attentionCount > 0 ? `(${attentionCount})` : ''}
        </button>
        <p className="review__count" role="status">
          {visibleRows.length} of {preview.rows.length} rows shown
        </p>
      </div>

      <div className="review__table-wrap" tabIndex={0} role="group" aria-label="Imported transactions review">
        <table className="review__table">
          <caption className="sr-only">Imported transactions review</caption>
          <thead>
            <tr>
              <th scope="col">Merchant</th>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
              <th scope="col">Category</th>
              <th scope="col">Status</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const decision = decisions.get(row.id) ?? row.user_decision;
              return (
                <tr key={row.id} data-row-status={row.row_status}>
                  <td>
                    <span className="review__merchant">{row.parsed_merchant ?? '—'}</span>
                    {row.diagnostics.length > 0 && (
                      <ul className="review__diagnostics">
                        {row.diagnostics.map((diagnostic, index) => (
                          <li key={index} aria-label={diagnostic.message}>
                            {diagnostic.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{row.parsed_date ?? '—'}</td>
                  <td className="review__amount">
                    {row.parsed_amount_minor === null
                      ? '—'
                      : formatMinor(row.parsed_amount_minor, row.parsed_currency ?? 'USD')}
                  </td>
                  <td>
                    <span className="review__category">
                      {categoryName(row.suggested_category_id)}
                      {row.category_source && row.category_confidence && (
                        <span className="review__provenance">
                          {CATEGORY_SOURCE_LABELS[row.category_source]} · {CATEGORY_CONFIDENCE_LABELS[row.category_confidence]}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={row.row_status} />
                  </td>
                  <td>
                    <div className="review__decision" role="group" aria-label={`Decision for ${row.parsed_merchant ?? 'row'}`}>
                      <button
                        type="button"
                        className={`segmented${decision === 'accept' ? ' segmented--active' : ''}`}
                        aria-pressed={decision === 'accept'}
                        onClick={() => onDecision(row.id, 'accept')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className={`segmented${decision === 'exclude' ? ' segmented--active' : ''}`}
                        aria-pressed={decision === 'exclude'}
                        onClick={() => onDecision(row.id, 'exclude')}
                      >
                        Exclude
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
