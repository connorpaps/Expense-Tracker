/**
 * Append-only mutation log (T013). Local writes append a durable mutation
 * before updating UI; applying the same mutation_id more than once is a no-op;
 * retries remain pending with backoff until a safe compaction checkpoint.
 */

import type {
  EntityType,
  KnownClock,
  MutationClock,
  MutationOperation,
  MutationOrigin,
  MutationStatus,
} from '@expense-tracker/contracts';
import { clockHappenedBefore, clocksAreConcurrent } from '@expense-tracker/contracts';
import type { Db, SqlRow } from '../storage/schema';
import { mergeCheckpoint, parseVector, serializeVector } from './clocks';

export interface AppendMutationInput {
  mutationId: string;
  vaultId: string;
  deviceId: string;
  clock: MutationClock;
  entityType: EntityType;
  entityId: string;
  operation: MutationOperation;
  baseVersion: number;
  changedFields: string[];
  ciphertext: string;
  origin: MutationOrigin;
  now: string;
}

export interface MutationLogRow {
  id: string;
  vault_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: MutationOperation;
  base_version: number;
  device_id: string;
  clock: MutationClock;
  changed_fields: string[];
  ciphertext: string;
  origin: MutationOrigin;
  status: MutationStatus;
  conflict_id: string | null;
  created_at: string;
  applied_at: string | null;
  retry_count: number;
  last_error_code: string | null;
}

export type AppliedResult =
  | { kind: 'applied'; mutation: MutationLogRow }
  | { kind: 'duplicate'; mutation: MutationLogRow | null }
  | { kind: 'conflict'; mutation: MutationLogRow; conflictId: string };


/**
 * Append a mutation to the durable log. Duplicate mutation_ids are rejected as
 * no-ops (idempotency index).
 */
export async function appendMutation(db: Db, input: AppendMutationInput): Promise<MutationLogRow> {
  const existing = await findMutation(db, input.vaultId, input.mutationId);
  if (existing) {
    return existing;
  }
  await db.exec(
    `INSERT INTO mutation_log (id, vault_id, entity_type, entity_id, operation, base_version, device_id, lamport_clock, vector_clock, changed_fields, ciphertext, origin, status, conflict_id, created_at, applied_at, retry_count, last_error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.mutationId,
      input.vaultId,
      input.entityType,
      input.entityId,
      input.operation,
      input.baseVersion,
      input.deviceId,
      input.clock.lamport,
      serializeVector(input.clock.vector),
      JSON.stringify(input.changedFields),
      input.ciphertext,
      input.origin,
      'pending',
      null,
      input.now,
      null,
      0,
      null,
    ],
  );
  return (await findMutation(db, input.vaultId, input.mutationId)) as MutationLogRow;
}

export async function findMutation(db: Db, vaultId: string, mutationId: string): Promise<MutationLogRow | null> {
  const row = await db.get<SqlRow>('SELECT * FROM mutation_log WHERE vault_id = ? AND id = ?', [
    vaultId,
    mutationId,
  ]);
  return row ? mapRow(row) : null;
}

/**
 * Enqueue an apply. Returns 'applied' when the mutation is new, 'duplicate'
 * when the mutation_id already exists, and 'conflict' when causally concurrent
 * edits overlap in changed fields.
 */
export async function applyMutationOnce(
  db: Db,
  vaultId: string,
  mutation: AppendMutationInput,
): Promise<AppliedResult> {
  const existing = await findMutation(db, vaultId, mutation.mutationId);
  if (existing) {
    return { kind: 'duplicate', mutation: existing };
  }

  const previous = await latestMutationForEntity(db, vaultId, mutation.entityId);
  if (previous && clocksAreConcurrent(previous.clock, mutation.clock) && fieldsOverlap(previous, mutation)) {
    const conflictId = `conflict-${mutation.mutationId}`;
    await db.exec(
      `INSERT OR IGNORE INTO conflicts (id, vault_id, entity_type, entity_id, conflicting_fields, local_values, remote_values, base_values, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        conflictId,
        vaultId,
        mutation.entityType,
        mutation.entityId,
        JSON.stringify(mutation.changedFields),
        previous.ciphertext,
        mutation.ciphertext,
        null,
        mutation.now,
      ],
    );
    const stored = await appendMutationAs(db, mutation, 'conflict');
    return { kind: 'conflict', mutation: stored, conflictId };
  }

  const appended = await appendMutation(db, mutation);
  await markApplied(db, vaultId, mutation.mutationId, mutation.now);
  return { kind: 'applied', mutation: appended };
}

/** Field-aware overlap check between a stored mutation and an incoming one. */
function fieldsOverlap(previous: MutationLogRow, next: AppendMutationInput): boolean {
  if (previous.entity_id !== next.entityId) return false;
  if (previous.operation === 'delete' || next.operation === 'delete') return true;
  if (previous.operation === 'create' || next.operation === 'create') return true;
  const prevFields = previous.changed_fields;
  const nextFields = next.changedFields;
  if (prevFields.length === 0 || nextFields.length === 0) return true;
  return prevFields.some((f) => nextFields.includes(f));
}

async function appendMutationAs(
  db: Db,
  input: AppendMutationInput,
  status: MutationStatus,
): Promise<MutationLogRow> {
  await db.exec(
    `INSERT INTO mutation_log (id, vault_id, entity_type, entity_id, operation, base_version, device_id, lamport_clock, vector_clock, changed_fields, ciphertext, origin, status, conflict_id, created_at, applied_at, retry_count, last_error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.mutationId,
      input.vaultId,
      input.entityType,
      input.entityId,
      input.operation,
      input.baseVersion,
      input.deviceId,
      input.clock.lamport,
      serializeVector(input.clock.vector),
      JSON.stringify(input.changedFields),
      input.ciphertext,
      input.origin,
      status,
      null,
      input.now,
      null,
      0,
      null,
    ],
  );
  return (await findMutation(db, input.vaultId, input.mutationId)) as MutationLogRow;
}

async function latestMutationForEntity(
  db: Db,
  vaultId: string,
  entityId: string,
): Promise<MutationLogRow | null> {
  const row = await db.get<SqlRow>(
    `SELECT * FROM mutation_log WHERE vault_id = ? AND entity_id = ?
     ORDER BY lamport_clock DESC, created_at DESC LIMIT 1`,
    [vaultId, entityId],
  );
  return row ? mapRow(row) : null;
}

export async function markApplied(db: Db, vaultId: string, mutationId: string, at: string): Promise<void> {
  await db.exec(
    "UPDATE mutation_log SET status = 'applied', applied_at = ? WHERE vault_id = ? AND id = ?",
    [at, vaultId, mutationId],
  );
}

export async function markFailed(
  db: Db,
  vaultId: string,
  mutationId: string,
  errorCode: string,
): Promise<void> {
  await db.exec(
    "UPDATE mutation_log SET status = 'failed', retry_count = retry_count + 1, last_error_code = ? WHERE vault_id = ? AND id = ?",
    [errorCode, vaultId, mutationId],
  );
}

/** Request mutations newer than the known clock checkpoint. */
export async function mutationsNewerThan(
  db: Db,
  vaultId: string,
  knownClock: KnownClock,
  limit: number,
): Promise<MutationLogRow[]> {
  const rows = await db.all<SqlRow>(
    `SELECT * FROM mutation_log WHERE vault_id = ?
     ORDER BY lamport_clock ASC, created_at ASC LIMIT ?`,
    [vaultId, limit],
  );
  const newer: MutationLogRow[] = [];
  for (const row of rows.map(mapRow)) {
    if (isNewerThan(row, knownClock)) newer.push(row);
  }
  return newer;
}

function isNewerThan(mutation: MutationLogRow, knownClock: KnownClock): boolean {
  const known = knownClock[mutation.device_id] ?? 0;
  return mutation.clock.lamport > known;
}

export async function pendingMutationCount(db: Db, vaultId: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM mutation_log WHERE vault_id = ? AND status IN ('pending', 'failed', 'disconnected')",
    [vaultId],
  );
  return row?.n ?? 0;
}

export async function computeCheckpoint(db: Db, vaultId: string): Promise<KnownClock> {
  const rows = await db.all<SqlRow>(
    'SELECT device_id, lamport_clock FROM mutation_log WHERE vault_id = ?',
    [vaultId],
  );
  const checkpoint: KnownClock = {};
  for (const row of rows) {
    const device = row.device_id as string;
    const lamport = row.lamport_clock as number;
    checkpoint[device] = Math.max(checkpoint[device] ?? 0, lamport);
  }
  return checkpoint;
}

/**
 * Safe compaction: only allowed after all paired devices acknowledge the
 * checkpoint or the user creates a new export backup. This phase only
 * implements the predicate; the physical cleanup is a US6 concern.
 */
export async function canCompact(db: Db, vaultId: string, acknowledgedBy: string[]): Promise<boolean> {
  const checkpoint = await computeCheckpoint(db, vaultId);
  const acknowledged = new Set(acknowledgedBy);
  for (const device of Object.keys(checkpoint)) {
    if (!acknowledged.has(device)) return false;
  }
  return true;
}

export function observeClock(local: MutationClock, remote: MutationClock): MutationClock {
  const vector = { ...local.vector };
  for (const [device, counter] of Object.entries(remote.vector)) {
    vector[device] = Math.max(vector[device] ?? 0, counter);
  }
  const lamport = Math.max(local.lamport, remote.lamport);
  return { lamport, vector };
}

export function mergeIntoCheckpoint(local: MutationClock, checkpoint: KnownClock): MutationClock {
  return mergeCheckpoint(local, checkpoint);
}

export { clockHappenedBefore, clocksAreConcurrent };

function mapRow(row: SqlRow): MutationLogRow {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    entity_type: row.entity_type as EntityType,
    entity_id: row.entity_id as string,
    operation: row.operation as MutationOperation,
    base_version: row.base_version as number,
    device_id: row.device_id as string,
    clock: {
      lamport: row.lamport_clock as number,
      vector: parseVector(row.vector_clock as string),
    },
    changed_fields: JSON.parse((row.changed_fields as string) ?? '[]') as string[],
    ciphertext: row.ciphertext as string,
    origin: row.origin as MutationOrigin,
    status: row.status as MutationStatus,
    conflict_id: (row.conflict_id as string | null) ?? null,
    created_at: row.created_at as string,
    applied_at: (row.applied_at as string | null) ?? null,
    retry_count: row.retry_count as number,
    last_error_code: (row.last_error_code as string | null) ?? null,
  };
}
