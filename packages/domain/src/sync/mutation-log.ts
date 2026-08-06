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
    `INSERT OR IGNORE INTO mutation_log (id, vault_id, entity_type, entity_id, operation, base_version, device_id, lamport_clock, vector_clock, changed_fields, ciphertext, origin, status, conflict_id, created_at, applied_at, retry_count, last_error_code)
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

export async function findMutation(
  db: Db,
  vaultId: string,
  mutationId: string,
): Promise<MutationLogRow | null> {
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
export interface LocalMutationInput extends Omit<AppendMutationInput, 'clock'> {
  clock?: MutationClock;
  apply: (db: Db) => Promise<void>;
}

/** Append and apply any local entity mutation atomically. */
export async function persistMutation(db: Db, input: LocalMutationInput): Promise<void> {
  await db.transaction(async (transactionDb) => {
    const existing = await findMutation(transactionDb, input.vaultId, input.mutationId);
    if (existing) return;
    const clock =
      input.clock ?? (await nextMutationClock(transactionDb, input.vaultId, input.deviceId));
    await appendMutation(transactionDb, { ...input, clock });
    await input.apply(transactionDb);
  });
}

/**
 * Apply one remote mutation or record its conflict atomically. Callers must
 * invoke this at the database transaction boundary; the Db adapter does not
 * support nesting this transaction inside another BEGIN/COMMIT scope. When a
 * projection callback is supplied, it runs between append and mark-applied in
 * the same transaction, so a projection failure rolls back both records.
 */
export async function applyMutationOnce(
  db: Db,
  vaultId: string,
  mutation: AppendMutationInput,
  applyProjection?: (db: Db) => Promise<void>,
): Promise<AppliedResult> {
  if (mutation.vaultId !== vaultId)
    throw new Error('Remote mutation envelope targets the wrong vault.');
  return db.transaction(async (transactionDb) => {
    const existing = await findMutation(transactionDb, vaultId, mutation.mutationId);
    if (existing) {
      if (!sameMutationEnvelope(existing, mutation)) {
        throw new Error('A duplicate mutation id carried different envelope contents.');
      }
      if (existing.status === 'failed' && applyProjection) {
        await applyProjection(transactionDb);
        await markApplied(transactionDb, vaultId, mutation.mutationId, mutation.now);
        return {
          kind: 'applied',
          mutation: { ...existing, status: 'applied', applied_at: mutation.now },
        };
      }
      return { kind: 'duplicate', mutation: existing };
    }

    const previous = await latestMutationForEntity(transactionDb, vaultId, mutation.entityId);
    if (
      previous &&
      clocksAreConcurrent(previous.clock, mutation.clock) &&
      fieldsOverlap(previous, mutation)
    ) {
      const conflictId = `conflict-${mutation.mutationId}`;
      const conflictingFields = overlappingFields(previous, mutation);
      await transactionDb.exec(
        `INSERT OR IGNORE INTO conflicts (id, vault_id, entity_type, entity_id, conflicting_fields, local_values, remote_values, base_values, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        [
          conflictId,
          vaultId,
          mutation.entityType,
          mutation.entityId,
          JSON.stringify(conflictingFields),
          previous.ciphertext,
          mutation.ciphertext,
          null,
          mutation.now,
        ],
      );
      const stored = await appendMutationAs(transactionDb, mutation, 'conflict', conflictId);
      return { kind: 'conflict', mutation: stored, conflictId };
    }

    const appended = await appendMutation(transactionDb, mutation);
    if (applyProjection) await applyProjection(transactionDb);
    await markApplied(transactionDb, vaultId, mutation.mutationId, mutation.now);
    return { kind: 'applied', mutation: appended };
  });
}

/** Field-aware overlap check between a stored mutation and an incoming one. */
function fieldsOverlap(previous: MutationLogRow, next: AppendMutationInput): boolean {
  return overlappingFields(previous, next).length > 0;
}

function overlappingFields(previous: MutationLogRow, next: AppendMutationInput): string[] {
  if (previous.entity_id !== next.entityId) return [];
  if (
    previous.operation === 'delete' ||
    next.operation === 'delete' ||
    previous.operation === 'create' ||
    next.operation === 'create'
  ) {
    return [...new Set([...previous.changed_fields, ...next.changedFields])];
  }
  const prevFields = previous.changed_fields;
  const nextFields = next.changedFields;
  // Empty field metadata is an unknown scope, not proof that edits are disjoint.
  // Preserve the conservative conflict behavior and make that uncertainty
  // visible to conflict-review clients.
  if (prevFields.length === 0 || nextFields.length === 0) return ['*'];
  return prevFields.filter((field) => nextFields.includes(field));
}

async function appendMutationAs(
  db: Db,
  input: AppendMutationInput,
  status: MutationStatus,
  conflictId: string | null = null,
): Promise<MutationLogRow> {
  await db.exec(
    `INSERT OR IGNORE INTO mutation_log (id, vault_id, entity_type, entity_id, operation, base_version, device_id, lamport_clock, vector_clock, changed_fields, ciphertext, origin, status, conflict_id, created_at, applied_at, retry_count, last_error_code)
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
      conflictId,
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

export async function markApplied(
  db: Db,
  vaultId: string,
  mutationId: string,
  at: string,
): Promise<void> {
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

/** Mark a mutation as intentionally local-only without counting a retry attempt. */
export async function markLocalOnly(
  db: Db,
  vaultId: string,
  mutationId: string,
  reason: string,
): Promise<void> {
  await db.exec(
    "UPDATE mutation_log SET status = 'local_only', last_error_code = ? WHERE vault_id = ? AND id = ?",
    [reason, vaultId, mutationId],
  );
}

/** Mark opaque relay receipt separately from local projection application. */
export async function markExchanged(db: Db, vaultId: string, mutationId: string): Promise<void> {
  await db.exec(
    "UPDATE mutation_log SET status = 'exchanged', applied_at = NULL WHERE vault_id = ? AND id = ?",
    [vaultId, mutationId],
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

export async function nextMutationClock(
  db: Db,
  vaultId: string,
  deviceId: string,
): Promise<MutationClock> {
  const row = await db.get<{ lamport: number }>(
    'SELECT MAX(lamport_clock) AS lamport FROM mutation_log WHERE vault_id = ? AND device_id = ?',
    [vaultId, deviceId],
  );
  const lamport = (row?.lamport ?? 0) + 1;
  return { lamport, vector: { [deviceId]: lamport } };
}

export async function pendingMutationCount(db: Db, vaultId: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM mutation_log WHERE vault_id = ? AND status IN ('pending', 'failed', 'disconnected')",
    [vaultId],
  );
  return row?.n ?? 0;
}

/** Return the durable local queue in creation order for an explicit exchange. */
export async function listPendingMutations(db: Db, vaultId: string): Promise<MutationLogRow[]> {
  const rows = await db.all<SqlRow>(
    "SELECT * FROM mutation_log WHERE vault_id = ? AND origin <> 'relay' AND status IN ('pending', 'failed', 'disconnected') ORDER BY created_at ASC",
    [vaultId],
  );
  return rows.map(mapRow);
}

/** Local failed records waiting for a future connected transport retry. */
export async function listFailedMutations(db: Db, vaultId: string): Promise<MutationLogRow[]> {
  const rows = await db.all<SqlRow>(
    "SELECT * FROM mutation_log WHERE vault_id = ? AND status IN ('failed', 'local_only') ORDER BY created_at ASC",
    [vaultId],
  );
  return rows.map(mapRow);
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
export async function canCompact(
  db: Db,
  vaultId: string,
  acknowledgedBy: string[],
): Promise<boolean> {
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

function sameMutationEnvelope(existing: MutationLogRow, incoming: AppendMutationInput): boolean {
  return (
    existing.vault_id === incoming.vaultId &&
    existing.entity_type === incoming.entityType &&
    existing.entity_id === incoming.entityId &&
    existing.operation === incoming.operation &&
    existing.base_version === incoming.baseVersion &&
    existing.device_id === incoming.deviceId &&
    existing.clock.lamport === incoming.clock.lamport &&
    serializeVector(existing.clock.vector) === serializeVector(incoming.clock.vector) &&
    JSON.stringify([...existing.changed_fields].sort()) ===
      JSON.stringify([...incoming.changedFields].sort()) &&
    existing.ciphertext === incoming.ciphertext
  );
}

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
