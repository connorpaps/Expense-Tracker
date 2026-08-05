import type { RowStatus } from '@expense-tracker/contracts';

const STATUS_LABELS: Record<RowStatus, string> = {
  valid: 'Ready',
  warning: 'Needs attention',
  error: 'Needs review',
  duplicate_candidate: 'Possible duplicate',
  excluded: 'Excluded',
  accepted: 'Accepted',
};

const STATUS_TONES: Record<RowStatus, string> = {
  valid: 'var(--color-positive)',
  warning: 'var(--color-warning)',
  error: 'var(--color-destructive)',
  duplicate_candidate: 'var(--color-review)',
  excluded: 'var(--color-muted-text)',
  accepted: 'var(--color-positive)',
};

export function StatusBadge({ status }: { status: RowStatus }) {
  return (
    <span
      className="status-badge"
      style={{ color: STATUS_TONES[status] }}
      role="status"
      aria-label={STATUS_LABELS[status]}
    >
      <span className="status-badge__dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
