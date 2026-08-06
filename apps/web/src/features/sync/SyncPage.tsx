import { useCallback, useEffect, useState } from 'react';
import type { ConflictResolution } from '@expense-tracker/contracts';
import {
  listFailedMutations,
  listOpenConflicts,
  pendingMutationCount,
  resolveConflict,
  isCurrencyCode,
} from '@expense-tracker/domain';
import type { ConflictRecord, Db, MutationLogRow } from '@expense-tracker/domain';
import { encryptMutationPayload, mutationEnvelopeContext, syncOnce } from '../../local';
import type { RemoteMutationDecoder, SyncResult, WebSyncConfig } from '../../local';

interface SyncPageProps {
  db: Db;
  vaultId: string;
  syncConfig?: WebSyncConfig;
  remoteMutationDecoder?: RemoteMutationDecoder;
}

const RESOLUTION_LABELS: Record<ConflictResolution, string> = {
  keep_local: 'Keep local',
  keep_remote: 'Keep remote',
  manual_edit: 'Manual edit',
  keep_both: 'Keep both',
};

const RESOLUTION_HELP: Record<ConflictResolution, string> = {
  keep_local: 'Use the version already held in this vault.',
  keep_remote: 'Use the encrypted remote candidate already stored in this vault.',
  manual_edit: 'Enter an encrypted replacement payload for this record.',
  keep_both: 'Enter an encrypted merged payload that preserves both edits.',
};

function formatConflictDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const TRANSACTION_FIELDS = new Set([
  'occurred_on',
  'merchant_display',
  'amount_minor',
  'currency',
  'category_id',
  'category_source',
  'category_confidence',
  'note',
  'review_state',
  'deleted_at',
]);
const CATEGORY_FIELDS = new Set(['name', 'slug', 'position', 'is_active']);
const RULE_FIELDS = new Set([
  'category_id',
  'matcher',
  'priority',
  'confidence',
  'evidence_count',
  'is_active',
]);
const CATEGORY_SOURCES = new Set(['user', 'personal_rule', 'default_rule', 'manual_required']);
const CATEGORY_CONFIDENCES = new Set(['confirmed', 'high', 'medium', 'low', 'unresolved']);
const REVIEW_STATES = new Set(['confirmed', 'needs_review', 'excluded', 'conflict']);

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateManualRecord(
  entityType: string,
  record: Record<string, unknown>,
  fields: string[],
  allowed: Set<string>,
): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0)
    throw new Error(`Manual resolution contains unsupported fields: ${unknown.join(', ')}.`);
  const missing = fields.filter((field) => !Object.prototype.hasOwnProperty.call(record, field));
  if (missing.length > 0)
    throw new Error(`Manual resolution is missing overlapping fields: ${missing.join(', ')}.`);

  if (entityType === 'transaction') {
    if ('occurred_on' in record && !isIsoDate(record.occurred_on))
      throw new Error('Manual resolution occurred_on must be a valid YYYY-MM-DD date.');
    if (
      'merchant_display' in record &&
      (typeof record.merchant_display !== 'string' || record.merchant_display.trim() === '')
    )
      throw new Error('Manual resolution merchant_display must be a non-empty string.');
    if (
      'amount_minor' in record &&
      (!Number.isSafeInteger(record.amount_minor) || record.amount_minor === 0)
    )
      throw new Error('Manual resolution amount_minor must be a non-zero integer.');
    if (
      'currency' in record &&
      (typeof record.currency !== 'string' || !isCurrencyCode(record.currency))
    )
      throw new Error('Manual resolution currency must be a supported ISO code.');
    if (
      'category_id' in record &&
      record.category_id !== null &&
      typeof record.category_id !== 'string'
    )
      throw new Error('Manual resolution category_id must be a string or null.');
    if (
      'category_source' in record &&
      record.category_source !== null &&
      (typeof record.category_source !== 'string' || !CATEGORY_SOURCES.has(record.category_source))
    )
      throw new Error('Manual resolution category_source is invalid.');
    if (
      'category_confidence' in record &&
      record.category_confidence !== null &&
      (typeof record.category_confidence !== 'string' ||
        !CATEGORY_CONFIDENCES.has(record.category_confidence))
    )
      throw new Error('Manual resolution category_confidence is invalid.');
    if ('note' in record && record.note !== null && typeof record.note !== 'string')
      throw new Error('Manual resolution note must be a string or null.');
    if (
      'review_state' in record &&
      (typeof record.review_state !== 'string' || !REVIEW_STATES.has(record.review_state))
    )
      throw new Error('Manual resolution review_state is invalid.');
    if ('deleted_at' in record && record.deleted_at !== null && !isIsoTimestamp(record.deleted_at))
      throw new Error('Manual resolution deleted_at must be an ISO timestamp or null.');
    return;
  }

  if (entityType === 'category') {
    if ('name' in record && (typeof record.name !== 'string' || record.name.trim() === ''))
      throw new Error('Manual resolution name must be a non-empty string.');
    if ('slug' in record && (typeof record.slug !== 'string' || record.slug.trim() === ''))
      throw new Error('Manual resolution slug must be a non-empty string.');
    if ('position' in record && !Number.isSafeInteger(record.position))
      throw new Error('Manual resolution position must be an integer.');
    if ('is_active' in record && typeof record.is_active !== 'boolean')
      throw new Error('Manual resolution is_active must be boolean.');
    return;
  }

  if (entityType === 'categorization_rule') {
    if (
      'category_id' in record &&
      (typeof record.category_id !== 'string' || record.category_id.trim() === '')
    )
      throw new Error('Manual resolution category_id must be a non-empty string.');
    if ('matcher' in record && (typeof record.matcher !== 'string' || record.matcher.trim() === ''))
      throw new Error('Manual resolution matcher must be a non-empty string.');
    if ('priority' in record && !Number.isSafeInteger(record.priority))
      throw new Error('Manual resolution priority must be an integer.');
    if (
      'confidence' in record &&
      (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1)
    )
      throw new Error('Manual resolution confidence must be between 0 and 1.');
    if (
      'evidence_count' in record &&
      (typeof record.evidence_count !== 'number' ||
        !Number.isSafeInteger(record.evidence_count) ||
        record.evidence_count < 0)
    )
      throw new Error('Manual resolution evidence_count must be a non-negative integer.');
    if ('is_active' in record && typeof record.is_active !== 'boolean')
      throw new Error('Manual resolution is_active must be boolean.');
    return;
  }

  throw new Error(`Manual resolution is not supported for ${entityType} conflicts.`);
}

function validateManualPayload(
  entityType: string,
  payload: unknown,
  fields: string[],
  resolution: ConflictResolution,
): void {
  if (fields.includes('*'))
    throw new Error('Manual resolution is unavailable because the overlapping fields are unknown.');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    throw new Error('The manual resolution must be a JSON object.');
  const record = payload as Record<string, unknown>;
  const allowed =
    entityType === 'transaction'
      ? TRANSACTION_FIELDS
      : entityType === 'category'
        ? CATEGORY_FIELDS
        : entityType === 'categorization_rule'
          ? RULE_FIELDS
          : new Set<string>();
  if (allowed.size === 0)
    throw new Error(`Manual resolution is not supported for ${entityType} conflicts.`);
  if (resolution === 'keep_both') {
    if (
      !Object.prototype.hasOwnProperty.call(record, 'local') ||
      !Object.prototype.hasOwnProperty.call(record, 'remote')
    )
      throw new Error('Keep both requires local and remote JSON objects.');
    if (Object.keys(record).some((key) => !['local', 'remote'].includes(key)))
      throw new Error('Keep both accepts only local and remote payloads.');
    for (const side of ['local', 'remote'] as const) {
      const candidate = record[side];
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
        throw new Error(`Keep both ${side} payload must be a JSON object.`);
      validateManualRecord(entityType, candidate as Record<string, unknown>, fields, allowed);
    }
    return;
  }
  validateManualRecord(entityType, record, fields, allowed);
}

export function SyncPage({ db, vaultId, syncConfig, remoteMutationDecoder }: SyncPageProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedMutations, setFailedMutations] = useState<MutationLogRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [selectedResolution, setSelectedResolution] = useState<Record<string, ConflictResolution>>(
    {},
  );
  const [manualConflictId, setManualConflictId] = useState<string | null>(null);
  const [manualValues, setManualValues] = useState('{\n  \n}');
  const [busyConflictId, setBusyConflictId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const refresh = useCallback(async () => {
    const [nextPendingCount, nextFailedMutations, nextConflicts] = await Promise.all([
      pendingMutationCount(db, vaultId),
      listFailedMutations(db, vaultId),
      listOpenConflicts(db, vaultId),
    ]);
    setPendingCount(nextPendingCount);
    setFailedMutations(nextFailedMutations);
    setConflicts(nextConflicts);
    setSelectedResolution((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, resolution]) => {
          const conflict = nextConflicts.find((candidate) => candidate.id === id);
          return (
            conflict &&
            !(
              conflict.conflicting_fields.includes('*') &&
              (resolution === 'manual_edit' || resolution === 'keep_both')
            )
          );
        }),
      ),
    );
    setManualConflictId((current) =>
      current &&
      nextConflicts.some(
        (conflict) => conflict.id === current && !conflict.conflicting_fields.includes('*'),
      )
        ? current
        : null,
    );
  }, [db, vaultId]);

  useEffect(() => {
    let cancelled = false;
    const refreshSafely = async () => {
      try {
        await refresh();
      } catch (cause) {
        console.error('Sync review refresh failed', cause);
        if (!cancelled)
          setError('Sync status could not be loaded. Your local records are unchanged.');
      }
    };
    void refreshSafely();
    const interval = window.setInterval(() => void refreshSafely(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const runSync = async () => {
    if (!syncConfig) {
      setError(
        'A paired relay is not configured for this browser. Local changes remain safe and pending.',
      );
      return;
    }
    setSyncBusy(true);
    setError(null);
    try {
      const result = await syncOnce(db, vaultId, syncConfig, remoteMutationDecoder);
      setSyncResult(result);
      if (result.status === 'relay_accepted') {
        setNotice(
          `Relay accepted ${result.relayAccepted} local change${result.relayAccepted === 1 ? '' : 's'}. This confirms opaque delivery only; ${result.projectionApplied} remote change${result.projectionApplied === 1 ? '' : 's'} applied here.`,
        );
      } else {
        setError(
          result.errors[0] ?? 'The exchange completed partially. Unapplied changes remain pending.',
        );
      }
      await refresh();
    } catch (cause) {
      console.error('Sync exchange failed', cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The relay exchange failed. Local records are unchanged.',
      );
    } finally {
      setSyncBusy(false);
    }
  };

  const resolve = async (
    conflict: ConflictRecord,
    resolution: ConflictResolution,
    values?: string,
  ) => {
    const conflictId = conflict.id;
    setBusyConflictId(conflictId);
    setError(null);
    try {
      let manualCiphertext: string | undefined;
      if (resolution === 'manual_edit' || resolution === 'keep_both') {
        if (!values?.trim()) throw new Error('Enter a JSON payload before saving this resolution.');
        let parsed: unknown;
        try {
          parsed = JSON.parse(values);
        } catch {
          throw new Error('The manual resolution must be valid JSON.');
        }
        validateManualPayload(
          conflict.entity_type,
          parsed,
          conflict.conflicting_fields,
          resolution,
        );
        const resolutionMutationId = `resolve-conflict-${conflictId}`;
        manualCiphertext = await encryptMutationPayload(
          parsed,
          mutationEnvelopeContext({
            mutation_id: resolutionMutationId,
            vault_id: vaultId,
            entity_type: 'conflict',
            entity_id: conflictId,
            operation: 'update',
            base_version: 0,
            changed_fields: conflict.conflicting_fields,
          }),
        );
      }
      await resolveConflict(db, {
        conflictId,
        vaultId,
        resolution,
        deviceId: 'web',
        origin: 'web',
        now: new Date().toISOString(),
        manualCiphertext,
      });
      setManualConflictId(null);
      setNotice(
        `${RESOLUTION_LABELS[resolution]} decision saved locally. The financial record is unchanged until a client applies this encrypted mutation; it remains pending until sync is connected.`,
      );
      await refresh();
    } catch (cause) {
      console.error('Conflict resolution failed', cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'That conflict could not be resolved. Refresh and try again.',
      );
      await refresh().catch((refreshCause) =>
        console.error('Conflict refresh after failure failed', refreshCause),
      );
    } finally {
      setBusyConflictId(null);
    }
  };

  const chooseResolution = (conflictId: string, resolution: ConflictResolution) => {
    const conflict = conflicts.find((candidate) => candidate.id === conflictId);
    if (!conflict) {
      setError('The selected conflict is no longer available. Refresh and try again.');
      return;
    }
    setSelectedResolution((current) => ({ ...current, [conflictId]: resolution }));
    setError(null);
    if (resolution === 'manual_edit' || resolution === 'keep_both') {
      setManualConflictId(conflictId);
      setManualValues('{\n  \n}');
    } else {
      setManualConflictId(null);
      void resolve(conflict, resolution);
    }
  };

  return (
    <section className="page" aria-labelledby="sync-heading">
      <header className="page__header">
        <p className="panel__eyebrow">LOCAL SYNC BOUNDARY</p>
        <h1 id="sync-heading">Sync and review</h1>
        <p className="page__subtitle">
          Review local changes and resolve encrypted conflict records without exposing their
          financial payloads.
        </p>
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

      <section className="panel sync-transport" aria-labelledby="sync-transport-heading">
        <div className="section-heading">
          <div>
            <p className="panel__eyebrow">FOREGROUND EXCHANGE</p>
            <h2 id="sync-transport-heading">
              {syncConfig ? 'Relay connection' : 'Local-only mode'}
            </h2>
          </div>
          <span
            className={`sync-transport__state sync-transport__state--${syncResult?.status ?? 'disconnected'}`}
            role="status"
          >
            {syncResult?.status ?? 'disconnected'}
          </span>
        </div>
        <p>
          {syncConfig
            ? `Opaque transport is configured at ${syncConfig.relayUrl}. Relay acceptance means the envelope was stored, not that another projection applied it. ${remoteMutationDecoder ? 'This browser can apply complete same-origin transaction envelopes after local decryption.' : 'Remote projection remains unavailable until a vault-key decoder is configured.'}`
            : 'No relay credentials are configured. The app remains fully usable offline, and no local change is falsely reported as remotely synchronized.'}
        </p>
        {syncResult && syncResult.errors.length > 0 && (
          <ul className="sync-failure-list">
            {syncResult.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        <div className="page-header__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void runSync()}
            disabled={syncBusy || !syncConfig}
          >
            {syncBusy
              ? 'Exchanging…'
              : syncResult?.status === 'failed'
                ? 'Retry exchange'
                : 'Exchange now'}
          </button>
          <small className="form-hint">
            {remoteMutationDecoder
              ? 'Decoded same-origin transaction projections are applied transactionally; unsupported local-only records remain retryable and visible.'
              : 'Remote payload application requires a configured vault-key decoder; unconfigured remote envelopes remain retryable locally.'}
          </small>
        </div>
      </section>

      <div className="sync-summary" aria-label="Local synchronization status">
        <article className="sync-summary__card">
          <span>Pending locally</span>
          <strong>{pendingCount}</strong>
          <small>Changes waiting for a connected relay</small>
        </article>
        <article
          className={`sync-summary__card${conflicts.length > 0 ? ' sync-summary__card--warning' : ''}`}
        >
          <span>Needs review</span>
          <strong>{conflicts.length}</strong>
          <small>
            {conflicts.length === 0
              ? 'No open local conflicts'
              : 'Opaque candidates are ready for a decision'}
          </small>
        </article>
        <article
          className={`sync-summary__card${failedMutations.length > 0 ? ' sync-summary__card--warning' : ''}`}
        >
          <span>Local retry queue</span>
          <strong>
            {failedMutations.filter((mutation) => mutation.status === 'failed').length}
          </strong>
          <small>
            {failedMutations.some((mutation) => mutation.status === 'local_only')
              ? `${failedMutations.filter((mutation) => mutation.status === 'local_only').length} local-only action${failedMutations.filter((mutation) => mutation.status === 'local_only').length === 1 ? '' : 's'} excluded from exchange`
              : failedMutations.length === 0
                ? 'No local failures recorded'
                : 'Failed subset of pending; retry is available'}
          </small>
        </article>
      </div>
      {failedMutations.length > 0 && (
        <section className="panel" aria-labelledby="failed-mutations-heading">
          <p className="panel__eyebrow">LOCAL RETRY DETAILS</p>
          <h2 id="failed-mutations-heading">Failures waiting locally</h2>
          <p>
            Failed records were not acknowledged by a relay. Local-only records are intentionally
            excluded from this web exchange because their payloads are not safe to project here.
            Retry failed records with an explicit foreground exchange; local data remains usable.
          </p>
          <ul className="sync-failure-list">
            {failedMutations.map((mutation) => (
              <li key={mutation.id}>
                <strong>
                  {mutation.entity_type} · {mutation.entity_id}
                </strong>
                <span>
                  {mutation.last_error_code ?? 'Unknown local error'} ·{' '}
                  {mutation.retry_count > 10 ? '10+' : mutation.retry_count} attempt
                  {mutation.retry_count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel sync-boundary" aria-labelledby="sync-boundary-heading">
        <p className="panel__eyebrow">WHAT THIS MEANS</p>
        <h2 id="sync-boundary-heading">Saved here, not sent yet</h2>
        <p>
          Local entries and resolution choices are durable encrypted mutations in this browser. This
          review records a decision but does not rewrite the transaction projection until a trusted
          applying client handles it. A relay exchange, when configured, acknowledges opaque
          delivery separately from projection application; nothing on this screen claims remote
          application before that succeeds.
        </p>
        <p className="form-hint">
          Candidate values stay encrypted and are never rendered here. Review the field names and
          choose the safest resolution for your situation.
        </p>
      </section>

      <section className="panel" aria-labelledby="conflicts-heading">
        <div className="section-heading">
          <div>
            <p className="panel__eyebrow">CONFLICT REVIEW</p>
            <h2 id="conflicts-heading">Open conflicts</h2>
          </div>
          <span className="section-heading__meta">{conflicts.length} open</span>
        </div>
        {conflicts.length === 0 ? (
          <div className="sync-empty" role="status">
            <strong>Nothing needs your attention.</strong>
            <p>
              When concurrent encrypted edits cannot be merged safely, they will appear here with
              the fields that overlap.
            </p>
          </div>
        ) : (
          <div className="conflict-list">
            {conflicts.map((conflict) => {
              const resolution = selectedResolution[conflict.id];
              const isManual = manualConflictId === conflict.id;
              const isBusy = busyConflictId === conflict.id;
              const hasUnknownFields = conflict.conflicting_fields.includes('*');
              return (
                <article
                  className="conflict-card"
                  key={conflict.id}
                  aria-labelledby={`conflict-${conflict.id}`}
                >
                  <div className="conflict-card__header">
                    <div>
                      <p className="panel__eyebrow">
                        {conflict.entity_type} · {conflict.entity_id}
                      </p>
                      <h3 id={`conflict-${conflict.id}`}>Concurrent change needs a decision</h3>
                    </div>
                    <time dateTime={conflict.created_at}>
                      {formatConflictDate(conflict.created_at)}
                    </time>
                  </div>
                  <p className="conflict-card__fields">
                    <strong>Overlapping fields:</strong>{' '}
                    {conflict.conflicting_fields.length > 0
                      ? conflict.conflicting_fields.join(', ')
                      : 'unknown fields'}
                    {hasUnknownFields && (
                      <span className="form-hint">
                        {' '}
                        Manual and merged payloads are unavailable until the fields are known.
                      </span>
                    )}
                  </p>
                  <p className="conflict-card__privacy">
                    Encrypted local and remote candidates are hidden by design. Choosing an option
                    records a decision; a trusted applying client must still project it before
                    another device can use the resolved value.
                  </p>
                  <div
                    className="conflict-actions"
                    role="group"
                    aria-label={`Resolution choices for ${conflict.entity_id}`}
                  >
                    {(Object.keys(RESOLUTION_LABELS) as ConflictResolution[]).map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        className={`button ${resolution === candidate ? 'button--secondary' : 'button--ghost'}`}
                        disabled={
                          isBusy ||
                          (hasUnknownFields &&
                            (candidate === 'manual_edit' || candidate === 'keep_both'))
                        }
                        title={
                          hasUnknownFields &&
                          (candidate === 'manual_edit' || candidate === 'keep_both')
                            ? 'Unavailable because the overlapping fields are unknown.'
                            : undefined
                        }
                        aria-pressed={resolution === candidate}
                        onClick={() => chooseResolution(conflict.id, candidate)}
                      >
                        {candidate === 'keep_local' || candidate === 'keep_remote'
                          ? `Record ${RESOLUTION_LABELS[candidate].toLowerCase()} decision`
                          : RESOLUTION_LABELS[candidate]}
                      </button>
                    ))}
                  </div>
                  {resolution && (
                    <p className="conflict-card__help">{RESOLUTION_HELP[resolution]}</p>
                  )}
                  {isManual &&
                    !hasUnknownFields &&
                    resolution &&
                    (resolution === 'manual_edit' || resolution === 'keep_both') && (
                      <form
                        className="conflict-manual"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void resolve(conflict, resolution, manualValues);
                        }}
                      >
                        <label htmlFor={`manual-${conflict.id}`}>
                          {resolution === 'keep_both'
                            ? 'Encrypted merged payload'
                            : 'Encrypted replacement payload'}{' '}
                          <span className="label-hint">
                            Advanced opaque JSON; it is encrypted before storage and validated by a
                            future applying client.
                          </span>
                        </label>
                        <textarea
                          id={`manual-${conflict.id}`}
                          value={manualValues}
                          onChange={(event) => setManualValues(event.target.value)}
                          rows={6}
                          spellCheck={false}
                        />
                        <div className="page-header__actions">
                          <button
                            type="submit"
                            className="button button--primary"
                            disabled={isBusy}
                          >
                            {isBusy
                              ? 'Saving locally…'
                              : `Save ${RESOLUTION_LABELS[resolution].toLowerCase()} decision`}
                          </button>
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() => setManualConflictId(null)}
                            disabled={isBusy}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
