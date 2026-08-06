import { useCallback, useMemo, useState } from 'react';
import type { CommitCounts, ImportPreviewDto, UserDecision } from '@expense-tracker/contracts';
import { ERROR_CODES, SAFE_MESSAGES, isAppError } from '@expense-tracker/contracts';
import {
  commitImportToDb,
  listCategories,
  listRules,
  listTransactions,
} from '@expense-tracker/domain';
import type { Category, Db } from '@expense-tracker/domain';
import type { ParseProgress } from '@expense-tracker/parsing';
import { ImportDropzone } from './components/ImportDropzone';
import { ReviewTable } from './components/ReviewTable';
import { CommitBar } from './components/CommitBar';
import { buildImportPreview, parseErrorMessage } from './import-pipeline';
import { parseFileInWorker } from './parse-file';
import { encryptMutationPayload } from '../../local';
import type { ParseFileFn } from './parse-file';

type Stage = 'idle' | 'parsing' | 'review' | 'committed' | 'error';

interface ImportPageProps {
  db: Db | null;
  vaultId: string | null;
  defaultCurrency?: string;
  parseFile?: ParseFileFn;
}

export function ImportPage({
  db,
  vaultId,
  defaultCurrency = 'CAD',
  parseFile = parseFileInWorker,
}: ImportPageProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [decisions, setDecisions] = useState<Map<string, UserDecision>>(new Map());
  const [corrections, setCorrections] = useState<
    Map<string, { categoryId: string; rememberRule: boolean }>
  >(new Map());
  const [categories, setCategories] = useState<Category[]>([]);
  const [committing, setCommitting] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!db || !vaultId) {
        setStage('error');
        setErrorMessage('The local vault is not ready yet. Reload the page and try again.');
        return;
      }
      setStage('parsing');
      setProgress(null);
      setErrorMessage(null);
      setPreview(null);
      setDecisions(new Map());
      setCorrections(new Map());

      try {
        const outcome = await parseFile(file, setProgress, defaultCurrency);
        const categoryRows = await listCategories(db, vaultId);
        setCategories(categoryRows);

        const existing = await listTransactions(db, { vaultId });
        const nextPreview = buildImportPreview(outcome.statement, {
          vaultId,
          categories: categoryRows,
          personalRules: await listRules(db, vaultId),
          existingTransactions: existing,
          now: new Date().toISOString(),
          fileName: file.name,
          fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv',
          fileSizeBytes: file.size,
        });
        if (nextPreview.rows.length === 0) {
          setStage('error');
          setErrorMessage(SAFE_MESSAGES.IMPORT_EMPTY);
          return;
        }
        setPreview(nextPreview);
        setStage('review');
      } catch (error) {
        // The raw failure is preserved for local debugging; the UI only shows a
        // safe message derived from the structured error code (if any).
        console.error('Import failed:', error);
        const code =
          error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
        setStage('error');
        setErrorMessage(parseErrorMessage(code));
      }
    },
    [db, vaultId, defaultCurrency, parseFile],
  );

  const handleDecision = useCallback((rowId: string, decision: 'accept' | 'exclude') => {
    setDecisions((previous) => {
      const next = new Map(previous);
      next.set(rowId, decision);
      return next;
    });
  }, []);

  const handleCategoryCorrection = useCallback(
    (rowId: string, categoryId: string, rememberRule: boolean) => {
      if (!categoryId) {
        setCorrections((previous) => {
          const next = new Map(previous);
          next.delete(rowId);
          return next;
        });
        setDecisions((previous) => {
          const next = new Map(previous);
          const original = preview?.rows.find((row) => row.id === rowId);
          if (original?.suggested_category_id === null) next.set(rowId, 'pending');
          else next.delete(rowId);
          return next;
        });
        return;
      }
      setCorrections((previous) => new Map(previous).set(rowId, { categoryId, rememberRule }));
      setDecisions((previous) => new Map(previous).set(rowId, 'accept'));
    },
    [preview],
  );

  const effectiveDecisions = useMemo(() => {
    const map = new Map<string, UserDecision>();
    if (preview) {
      for (const row of preview.rows) {
        map.set(row.id, decisions.get(row.id) ?? row.user_decision);
      }
    }
    return map;
  }, [preview, decisions]);

  const counts: CommitCounts = useMemo(() => {
    if (!preview) {
      return { accepted: 0, excluded: 0, unresolved: 0, duplicate_candidates: 0, errors: 0 };
    }
    let accepted = 0;
    let excluded = 0;
    let unresolved = 0;
    for (const row of preview.rows) {
      const decision = effectiveDecisions.get(row.id) ?? 'pending';
      if (decision === 'accept') accepted += 1;
      else if (decision === 'exclude') excluded += 1;
      else unresolved += 1;
    }
    return {
      accepted,
      excluded,
      unresolved,
      duplicate_candidates: preview.commit_counts.duplicate_candidates,
      errors: preview.commit_counts.errors,
    };
  }, [preview, effectiveDecisions]);

  const handleCommit = useCallback(async () => {
    if (!preview || !db || !vaultId || counts.unresolved > 0) return;

    if (committing) return;
    setCommitting(true);
    try {
      const mutationCiphertext = await encryptMutationPayload(
        {
          import_id: preview.session.import_id,
          decisions: [...effectiveDecisions.entries()],
          corrections: [...corrections.entries()],
          rows: preview.rows.map((row) => ({
            id: row.id,
            date: row.parsed_date,
            merchant: row.parsed_merchant,
            amount_minor: row.parsed_amount_minor,
            currency: row.parsed_currency ?? defaultCurrency,
            category_id: corrections.get(row.id)?.categoryId ?? row.suggested_category_id,
            decision: effectiveDecisions.get(row.id) ?? row.user_decision,
          })),
        },
        `${vaultId}:statement-import:${preview.session.import_id}`,
      );
      await commitImportToDb(db, {
        session: {
          id: preview.session.import_id,
          vault_id: preview.session.vault_id,
          file_name: preview.session.file_name,
          file_type: preview.session.file_type,
          file_size_bytes: preview.session.file_size_bytes,
          source_fingerprint: preview.session.source_fingerprint,
          bank_profile: preview.session.bank_profile,
          parser_version: preview.session.parser_version,
          status: preview.session.status,
          total_rows: preview.session.total_rows,
          recognized_rows: preview.session.recognized_rows,
          warning_count: preview.session.warning_count,
          error_count: preview.session.error_count,
          storage_reference: null,
          created_at: preview.session.created_at,
          completed_at: null,
          deleted_at: null,
        },
        rows: preview.rows.map((row) => ({
          id: row.id,
          import_id: row.import_id,
          source_row_number: row.source_row_number,
          parsed_date: row.parsed_date,
          parsed_merchant: row.parsed_merchant,
          parsed_amount_minor: row.parsed_amount_minor,
          parsed_currency: row.parsed_currency,
          suggested_category_id: row.suggested_category_id,
          category_source: row.category_source,
          category_confidence: row.category_confidence,
          row_status: row.row_status,
          diagnostics: row.diagnostics,
          duplicate_candidate_ids: row.duplicate_candidate_ids,
          user_decision: effectiveDecisions.get(row.id) ?? row.user_decision,
        })),
        decisions: effectiveDecisions,
        defaultCurrency,
        now: new Date().toISOString(),
        lastModifiedBy: 'web',
        mutationDeviceId: 'web',
        categoryCorrections: [...corrections.entries()].map(([rowId, correction]) => ({
          rowId,
          ...correction,
        })),
        mutationCiphertext,
      });
      setStage('committed');
    } catch (error) {
      console.error('Commit import failed:', error);
      const code = isAppError(error)
        ? error.code
        : error instanceof Error && 'code' in error
          ? String((error as { code: string }).code)
          : '';
      setStage('error');
      setErrorMessage(parseErrorMessage(code));
    } finally {
      setCommitting(false);
    }
  }, [
    db,
    vaultId,
    defaultCurrency,
    preview,
    counts.unresolved,
    effectiveDecisions,
    corrections,
    committing,
  ]);

  const reset = useCallback(() => {
    setStage('idle');
    setPreview(null);
    setDecisions(new Map());
    setCorrections(new Map());
    setErrorMessage(null);
    setProgress(null);
  }, []);

  return (
    <section className="page" aria-labelledby="import-heading">
      <header className="page__header">
        <h1 id="import-heading">Review import</h1>
        <p className="page__subtitle">
          Statements are parsed on this device, shown for review, and only added to your history
          after you commit.
        </p>
      </header>

      {stage === 'idle' && (
        <div className="page__body">
          <ImportDropzone onFile={(file) => void handleFile(file)} />
        </div>
      )}

      {stage === 'parsing' && (
        <div className="panel panel--progress" role="status" aria-live="polite">
          <p className="panel__title">Parsing your statement…</p>
          <div className="progress" aria-hidden="true">
            <div
              className="progress__bar"
              style={{
                width:
                  progress && progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : '30%',
              }}
            />
          </div>
          <p className="panel__hint">Nothing leaves your device. Large files may take a moment.</p>
        </div>
      )}

      {stage === 'review' && preview && (
        <div className="page__body">
          <ReviewTable
            preview={preview}
            categories={categories}
            decisions={decisions}
            corrections={corrections}
            attentionOnly={attentionOnly}
            onToggleAttention={() => setAttentionOnly((value) => !value)}
            onDecision={handleDecision}
            onCategoryCorrection={handleCategoryCorrection}
          />
          <CommitBar
            counts={counts}
            disabled={committing}
            onCommit={() => void handleCommit()}
            onCancel={reset}
          />
        </div>
      )}

      {stage === 'committed' && preview && (
        <div className="page__body">
          <CommitBar counts={counts} committed onCommit={handleCommit} onCancel={reset} />
          <button type="button" className="button button--secondary" onClick={reset}>
            Import another statement
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="panel panel--error" role="alert">
          <p className="panel__title">{errorMessage ?? 'This file could not be imported.'}</p>
          <p className="panel__hint">The file was not changed and no transactions were added.</p>
          <button type="button" className="button button--secondary" onClick={reset}>
            Try another file
          </button>
        </div>
      )}
    </section>
  );
}

export { ERROR_CODES };
