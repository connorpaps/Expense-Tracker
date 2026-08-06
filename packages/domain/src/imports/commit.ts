/**
 * Explicit import commit (T035): rows with `accept` decisions become
 * transactions; `exclude` rows are skipped and recorded; `pending`/unresolved
 * rows block the commit. No row is ever silently discarded — excluded and
 * unresolved states are always visible in the review contract.
 */

import type { MutationClock, UserDecision } from '@expense-tracker/contracts';
import { ERROR_CODES, appError } from '@expense-tracker/contracts';
import type { ImportRowReview, StatementImport } from '../entities/import';
import type { Transaction } from '../entities/transaction';
import { newTransaction } from '../entities/transaction';
import { validateTransaction } from '../validation/transaction';
import type { Db } from '../storage/schema';
import { appendMutation, nextMutationClock } from '../sync/mutation-log';
import { recordCategoryCorrection, rememberMerchantRule } from '../categorization/personal-rules';
import {
  getStatementImport,
  insertImportRows,
  insertStatementImport,
  insertTransaction,
  listTransactions,
  updateImportStatus,
} from '../storage/repository';

export interface CommitRow {
  row: ImportRowReview;
  decision: UserDecision;
}

export interface CommitPlan {
  accepted: CommitRow[];
  excluded: CommitRow[];
  unresolved: CommitRow[];
}

export function planCommit(
  rows: ImportRowReview[],
  decisions: Map<string, UserDecision>,
): CommitPlan {
  const accepted: CommitRow[] = [];
  const excluded: CommitRow[] = [];
  const unresolved: CommitRow[] = [];

  for (const row of rows) {
    // Explicit decisions override the row's persisted decision; otherwise the
    // persisted user_decision is the source of truth.
    const decision = decisions.get(row.id) ?? row.user_decision;
    if (decision === 'accept') {
      accepted.push({ row: { ...row, user_decision: decision }, decision });
    } else if (decision === 'exclude') {
      excluded.push({ row: { ...row, user_decision: decision }, decision });
    } else {
      unresolved.push({ row: { ...row, user_decision: decision }, decision });
    }
  }
  return { accepted, excluded, unresolved };
}

export interface BuildTransactionsInput {
  vaultId: string;
  importId: string;
  defaultCurrency: string;
  now: string;
  lastModifiedBy: Transaction['last_modified_by'];
  sourceType?: Transaction['source_type'];
}

/** Convert accepted review rows into validated transactions. */
export function buildTransactionsFromRows(
  plan: CommitPlan,
  input: BuildTransactionsInput,
): { transactions: Transaction[]; skippedRows: ImportRowReview[] } {
  const transactions: Transaction[] = [];
  const skippedRows: ImportRowReview[] = [];

  for (const { row } of plan.accepted) {
    if (
      row.parsed_date === null ||
      row.parsed_merchant === null ||
      row.parsed_amount_minor === null
    ) {
      skippedRows.push(row);
      continue;
    }
    const issues = validateTransaction({
      occurred_on: row.parsed_date,
      merchant_display: row.parsed_merchant,
      amount_minor: row.parsed_amount_minor,
      currency: row.parsed_currency ?? input.defaultCurrency,
    });
    if (issues.length > 0) {
      skippedRows.push(row);
      continue;
    }
    transactions.push(
      newTransaction({
        id: row.id,
        vault_id: input.vaultId,
        occurred_on: row.parsed_date,
        merchant_display: row.parsed_merchant,
        merchant_original: row.parsed_merchant,
        amount_minor: row.parsed_amount_minor,
        currency: row.parsed_currency ?? input.defaultCurrency,
        category_id: row.suggested_category_id,
        category_source: row.category_source,
        category_confidence: row.category_confidence,
        source_type: input.sourceType ?? 'csv',
        statement_import_id: input.importId,
        source_row_key: String(row.source_row_number),
        review_state: 'confirmed',
        now: input.now,
        last_modified_by: input.lastModifiedBy,
      }),
    );
  }

  return { transactions, skippedRows };
}

export interface CategoryCorrectionCommit {
  rowId: string;
  categoryId: string;
  rememberRule: boolean;
}

export interface PersistedImportCommit {
  importId: string;
  committedRows: number;
  excludedRows: number;
  transactionIds: string[];
}

/**
 * Persist a reviewed import atomically. This is the single domain boundary used
 * by clients so a successful UI state always corresponds to durable local rows.
 */
export async function commitImportToDb(
  db: Db,
  input: {
    session: StatementImport;
    rows: ImportRowReview[];
    decisions?: Map<string, UserDecision>;
    defaultCurrency?: string;
    now: string;
    lastModifiedBy?: Transaction['last_modified_by'];
    mutationDeviceId?: string;
    mutationClock?: MutationClock;
    categoryCorrections?: CategoryCorrectionCommit[];
    /** Every committed import has a real encrypted mutation record. */
    mutationCiphertext: string;
  },
): Promise<PersistedImportCommit> {
  const existing = await getStatementImport(db, input.session.vault_id, input.session.id);
  if (existing?.status === 'committed') {
    const committed = await listTransactions(db, { vaultId: input.session.vault_id });
    const transactions = committed.filter(
      (transaction) => transaction.statement_import_id === input.session.id,
    );
    return {
      importId: input.session.id,
      committedRows: transactions.length,
      excludedRows: 0,
      transactionIds: transactions.map((transaction) => transaction.id),
    };
  }

  const decisions = input.decisions ?? new Map<string, UserDecision>();
  const plan = planCommit(input.rows, decisions);
  if (plan.unresolved.length > 0) {
    throw commitError();
  }

  const built = buildTransactionsFromRows(plan, {
    vaultId: input.session.vault_id,
    importId: input.session.id,
    defaultCurrency: input.defaultCurrency ?? 'USD',
    now: input.now,
    lastModifiedBy: input.lastModifiedBy ?? 'web',
    sourceType: input.session.file_type,
  });
  if (built.skippedRows.length > 0) {
    throw appError(
      ERROR_CODES.IMPORT_COMMIT_INCOMPLETE,
      'Some accepted rows are invalid and must be reviewed again.',
      {
        retryable: false,
        rowReference: built.skippedRows[0]?.source_row_number ?? null,
      },
    );
  }

  const corrections = new Map(
    (input.categoryCorrections ?? []).map((correction) => [correction.rowId, correction]),
  );
  const correctedRows = plan.accepted.map(({ row }) => {
    const correction = corrections.get(row.id);
    if (!correction) return row;
    return {
      ...row,
      suggested_category_id: correction.categoryId,
      category_source: 'user' as const,
      category_confidence: 'confirmed' as const,
    };
  });
  const correctedPlan: CommitPlan = {
    ...plan,
    accepted: correctedRows.map((row) => ({ row, decision: 'accept' })),
  };
  if (correctedPlan.accepted.some(({ row }) => row.suggested_category_id === null)) {
    throw commitError();
  }
  const correctedBuilt = buildTransactionsFromRows(correctedPlan, {
    vaultId: input.session.vault_id,
    importId: input.session.id,
    defaultCurrency: input.defaultCurrency ?? 'USD',
    now: input.now,
    lastModifiedBy: input.lastModifiedBy ?? 'web',
    sourceType: input.session.file_type,
  });
  if (correctedBuilt.skippedRows.length > 0) {
    throw appError(
      ERROR_CODES.IMPORT_COMMIT_INCOMPLETE,
      'Some corrected rows are invalid and must be reviewed again.',
      {
        retryable: false,
        rowReference: correctedBuilt.skippedRows[0]?.source_row_number ?? null,
      },
    );
  }
  const persistedRows = [...correctedPlan.accepted, ...plan.excluded].map(({ row }) => row);
  let alreadyCommitted: PersistedImportCommit | null = null;
  await db.transaction(async (transactionDb) => {
    const transactionImport = await getStatementImport(
      transactionDb,
      input.session.vault_id,
      input.session.id,
    );
    if (transactionImport?.status === 'committed') {
      const committed = await listTransactions(transactionDb, { vaultId: input.session.vault_id });
      const transactions = committed.filter(
        (transaction) => transaction.statement_import_id === input.session.id,
      );
      alreadyCommitted = {
        importId: input.session.id,
        committedRows: transactions.length,
        excludedRows: 0,
        transactionIds: transactions.map((transaction) => transaction.id),
      };
      return;
    }
    if (!transactionImport) {
      await insertStatementImport(transactionDb, { ...input.session, status: 'review' });
    }
    await insertImportRows(transactionDb, input.session.vault_id, persistedRows);
    for (const transaction of correctedBuilt.transactions) {
      await insertTransaction(transactionDb, transaction);
    }
    for (const { row } of correctedPlan.accepted) {
      const correction = corrections.get(row.id);
      if (!correction) continue;
      const previousCategoryId =
        input.rows.find((candidate) => candidate.id === row.id)?.suggested_category_id ?? null;
      if (previousCategoryId !== correction.categoryId) {
        await recordCategoryCorrection(transactionDb, {
          vaultId: input.session.vault_id,
          importId: input.session.id,
          merchant: row.parsed_merchant ?? '',
          previousCategoryId,
          nextCategoryId: correction.categoryId,
          now: input.now,
        });
      }
      if (correction.rememberRule) {
        await rememberMerchantRule(transactionDb, {
          vaultId: input.session.vault_id,
          merchant: row.parsed_merchant ?? '',
          categoryId: correction.categoryId,
          now: input.now,
        });
      }
    }
    await appendMutation(transactionDb, {
      mutationId: `import-commit-${input.session.id}`,
      vaultId: input.session.vault_id,
      deviceId: input.mutationDeviceId ?? 'web',
      clock:
        input.mutationClock ??
        (await nextMutationClock(
          transactionDb,
          input.session.vault_id,
          input.mutationDeviceId ?? 'web',
        )),
      entityType: 'statement_import',
      entityId: input.session.id,
      operation: 'import_commit',
      baseVersion: 0,
      changedFields: [
        'transaction_ids',
        ...(corrections.size > 0
          ? ['category_id', 'category_source', 'category_confidence', 'correction_history']
          : []),
        ...(Array.from(corrections.values()).some((correction) => correction.rememberRule)
          ? ['categorization_rule', 'matcher', 'evidence_count', 'confidence', 'is_active']
          : []),
      ],
      ciphertext: input.mutationCiphertext,
      origin: 'importer',
      now: input.now,
    });
    await updateImportStatus(transactionDb, input.session.vault_id, input.session.id, {
      status: 'committed',
      completed_at: input.now,
    });
  });

  if (alreadyCommitted) return alreadyCommitted;

  return {
    importId: input.session.id,
    committedRows: correctedBuilt.transactions.length,
    excludedRows: plan.excluded.length,
    transactionIds: correctedBuilt.transactions.map((transaction) => transaction.id),
  };
}

export async function cancelImportToDb(
  db: Db,
  input: { vaultId: string; importId: string; now: string },
): Promise<void> {
  const existing = await getStatementImport(db, input.vaultId, input.importId);
  if (!existing || existing.status === 'committed') return;
  await updateImportStatus(db, input.vaultId, input.importId, {
    status: 'cancelled',
    completed_at: input.now,
  });
}

export function commitError() {
  return appError(
    ERROR_CODES.IMPORT_COMMIT_INCOMPLETE,
    'Some rows still need a decision before this import can be saved.',
    {
      retryable: false,
    },
  );
}
