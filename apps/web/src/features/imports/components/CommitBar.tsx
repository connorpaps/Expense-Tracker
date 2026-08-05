import type { CommitCounts } from '@expense-tracker/contracts';

interface CommitBarProps {
  counts: CommitCounts;
  committed?: boolean;
  disabled?: boolean;
  onCommit: () => void;
  onCancel: () => void;
}

export function CommitBar({ counts, committed, disabled, onCommit, onCancel }: CommitBarProps) {
  const blocked = counts.unresolved > 0 || counts.errors > 0;
  const hint = blocked
    ? 'Resolve the rows that need attention before saving. Nothing is imported until you confirm.'
    : 'Rows you excluded are skipped. You can review the import history later.';

  if (committed) {
    return (
      <div className="commit-bar commit-bar--success" role="status">
        <p className="commit-bar__title">Import saved</p>
        <p className="commit-bar__hint">
          {counts.accepted} transaction{counts.accepted === 1 ? '' : 's'} added to your history.
        </p>
      </div>
    );
  }

  return (
    <div className="commit-bar">
      <div className="commit-bar__counts" aria-label="Commit summary">
        <span className="commit-count commit-count--accept">Accept {counts.accepted}</span>
        <span className="commit-count commit-count--exclude">Exclude {counts.excluded}</span>
        <span className="commit-count commit-count--pending">Review {counts.unresolved}</span>
        <span className="commit-count commit-count--duplicate">Duplicates {counts.duplicate_candidates}</span>
        <span className="commit-count commit-count--error">Errors {counts.errors}</span>
      </div>
      <p className="commit-bar__hint">{hint}</p>
      <div className="commit-bar__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Discard
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={disabled || blocked}
          onClick={onCommit}
        >
          Commit import
        </button>
      </div>
    </div>
  );
}
