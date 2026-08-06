import type { EntityType, MutationOperation } from '@expense-tracker/contracts';
import type { CategorizationRule, Category, Transaction } from '../entities';
import type { LastModifiedBy } from '../entities/enums';
import type { Db } from '../storage/schema';
import {
  insertCategory,
  insertRule,
  insertTransaction,
  softDeleteTransaction,
  updateCategory,
  updateCategoryActive,
  updateRule,
  updateTransaction,
} from '../storage/repository';
import type { AppendMutationInput } from './mutation-log';
import { applyMutationOnce } from './mutation-log';

/** Decrypted application payload supplied by a trusted vault-key adapter. */
export type RemoteMutationPayload =
  | { entity: 'transaction'; value: Transaction | Partial<Transaction> }
  | { entity: 'category'; value: Category | Partial<Category> }
  | { entity: 'categorization_rule'; value: CategorizationRule | Partial<CategorizationRule> };

export interface RemoteMutationInput {
  vaultId: string;
  mutation: AppendMutationInput;
  payload: unknown;
}

export type RemoteMutationResult = Awaited<ReturnType<typeof applyMutationOnce>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requirePayload(value: unknown): RemoteMutationPayload {
  if (!isRecord(value) || typeof value.entity !== 'string' || !isRecord(value.value)) {
    throw new Error('Remote mutation payload is not a supported decrypted record.');
  }
  if (value.entity !== 'transaction' && value.entity !== 'category' && value.entity !== 'categorization_rule') {
    throw new Error('Remote mutation payload targets an unsupported entity.');
  }
  return value as unknown as RemoteMutationPayload;
}

function requireId(value: Record<string, unknown>, expected: string, label: string): void {
  if (typeof value.id !== 'string' || value.id !== expected) {
    throw new Error(`Remote ${label} payload has an invalid entity id.`);
  }
}

function requireVault(value: Record<string, unknown>, vaultId: string, label: string): void {
  if (typeof value.vault_id !== 'string' || value.vault_id !== vaultId) {
    throw new Error(`Remote ${label} payload targets the wrong vault.`);
  }
}

function requireUpdatedAt(value: Record<string, unknown>, now: string): string {
  return typeof value.updated_at === 'string' && value.updated_at.length > 0 ? value.updated_at : now;
}

function requireDeclaredFields(value: Record<string, unknown>, changedFields: string[], allowedFields: readonly string[], label: string): void {
  const unknownFields = changedFields.filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) throw new Error(`Remote ${label} mutation declares unsupported fields: ${unknownFields.join(', ')}.`);
  const payloadFields = Object.keys(value).filter((field) => field !== 'id' && field !== 'vault_id');
  const undeclared = payloadFields.filter((field) => !changedFields.includes(field) && field !== 'updated_at' && field !== 'version');
  if (undeclared.length > 0) throw new Error(`Remote ${label} payload contains undeclared fields: ${undeclared.join(', ')}.`);
  if (changedFields.length === 0) throw new Error(`Remote ${label} update must declare changed fields.`);
  const missing = changedFields.filter((field) => !(field in value));
  if (missing.length > 0) throw new Error(`Remote ${label} payload is missing declared fields: ${missing.join(', ')}.`);
}

async function applyTransactionProjection(
  db: Db,
  vaultId: string,
  mutation: AppendMutationInput,
  value: Record<string, unknown>,
): Promise<void> {
  requireId(value, mutation.entityId, 'transaction');
  requireVault(value, vaultId, 'transaction');
  if (mutation.operation === 'create' || mutation.operation === 'import_commit') {
    requireTransactionFields(value);
    await insertTransaction(db, value as unknown as Transaction);
    return;
  }
  if (mutation.operation === 'delete') {
    if (!await db.get('SELECT id FROM transactions WHERE vault_id = ? AND id = ?', [vaultId, mutation.entityId])) {
      throw new Error('Remote transaction target does not exist in this vault.');
    }
    await softDeleteTransaction(db, vaultId, mutation.entityId, requireUpdatedAt(value, mutation.now), originToLastModifiedBy(mutation.origin));
    return;
  }
  if (mutation.operation === 'merge') {
    throw new Error('Remote transaction merge requires an explicit projection plan.');
  }
  if (mutation.operation !== 'update' && mutation.operation !== 'restore') {
    throw new Error(`Remote transaction operation ${mutation.operation} is not supported.`);
  }
  if (mutation.operation === 'restore') {
    throw new Error('Remote transaction restore requires an explicit undelete projection.');
  }
  if (!await db.get('SELECT id FROM transactions WHERE vault_id = ? AND id = ?', [vaultId, mutation.entityId])) {
    throw new Error('Remote transaction target does not exist in this vault.');
  }
  requireDeclaredFields(value, mutation.changedFields, ['occurred_on', 'merchant_display', 'amount_minor', 'category_id', 'category_source', 'category_confidence', 'note', 'review_state'], 'transaction');
  await updateTransaction(db, vaultId, mutation.entityId, {
    ...(value as Partial<Transaction>),
    updated_at: requireUpdatedAt(value, mutation.now),
    last_modified_by: originToLastModifiedBy(mutation.origin),
  });
}

async function applyCategoryProjection(
  db: Db,
  vaultId: string,
  mutation: AppendMutationInput,
  value: Record<string, unknown>,
): Promise<void> {
  requireId(value, mutation.entityId, 'category');
  requireVault(value, vaultId, 'category');
  if (mutation.operation === 'create') {
    requireCategoryFields(value);
    await insertCategory(db, value as unknown as Category);
    return;
  }
  if (mutation.operation === 'delete') {
    // Categories are archived rather than physically deleted so historical
    // transaction references remain valid across clients.
    if (!await getExisting(db, 'categories', vaultId, mutation.entityId)) throw new Error('Remote category target does not exist in this vault.');
    await updateCategoryActive(db, vaultId, mutation.entityId, false, requireUpdatedAt(value, mutation.now));
    return;
  }
  if (mutation.operation === 'merge') {
    throw new Error('Remote category merge requires an explicit projection plan.');
  }
  if (mutation.operation !== 'update' && mutation.operation !== 'category_update' && mutation.operation !== 'restore') {
    throw new Error(`Remote category operation ${mutation.operation} is not supported.`);
  }
  if (!await getExisting(db, 'categories', vaultId, mutation.entityId)) throw new Error('Remote category target does not exist in this vault.');
  requireDeclaredFields(value, mutation.changedFields, ['name', 'slug', 'position', 'is_active'], 'category');
  if (mutation.operation === 'restore' || value.is_active !== undefined) {
    await updateCategoryActive(db, vaultId, mutation.entityId, value.is_active !== false, requireUpdatedAt(value, mutation.now));
  }
  const patch: { name?: string; slug?: string; position?: number; updated_at: string } = {
    updated_at: requireUpdatedAt(value, mutation.now),
  };
  if (typeof value.name === 'string') patch.name = value.name;
  if (typeof value.slug === 'string') patch.slug = value.slug;
  if (typeof value.position === 'number') patch.position = value.position;
  if (Object.keys(patch).length > 1) await updateCategory(db, vaultId, mutation.entityId, patch);
}

async function applyRuleProjection(
  db: Db,
  vaultId: string,
  mutation: AppendMutationInput,
  value: Record<string, unknown>,
): Promise<void> {
  requireId(value, mutation.entityId, 'categorization rule');
  requireVault(value, vaultId, 'categorization rule');
  if (mutation.operation === 'create') {
    requireRuleFields(value);
    await insertRule(db, value as unknown as CategorizationRule);
    return;
  }
  if (mutation.operation === 'delete') {
    throw new Error('Remote rule deletion requires a tombstone projection.');
  }
  if (mutation.operation === 'restore') {
    throw new Error('Remote rule restore requires an explicit rule tombstone projection.');
  }
  if (mutation.operation !== 'update' && mutation.operation !== 'rule_update') {
    throw new Error(`Remote categorization-rule operation ${mutation.operation} is not supported.`);
  }
  if (!await getExisting(db, 'categorization_rules', vaultId, mutation.entityId)) throw new Error('Remote categorization-rule target does not exist in this vault.');
  requireDeclaredFields(value, mutation.changedFields, ['category_id', 'matcher', 'priority', 'confidence', 'evidence_count', 'is_active'], 'categorization rule');
  await updateRule(db, vaultId, mutation.entityId, {
    ...(value as Partial<CategorizationRule>),
    updated_at: requireUpdatedAt(value, mutation.now),
  });
}

async function getExisting(db: Db, table: 'categories' | 'categorization_rules', vaultId: string, id: string): Promise<boolean> {
  return Boolean(await db.get(`SELECT id FROM ${table} WHERE vault_id = ? AND id = ?`, [vaultId, id]));
}

function requireString(value: Record<string, unknown>, key: string, label: string): void {
  if (typeof value[key] !== 'string' || value[key] === '') throw new Error(`Remote ${label} payload is missing ${key}.`);
}

function requireTransactionFields(value: Record<string, unknown>): void {
  for (const key of ['id', 'vault_id', 'occurred_on', 'merchant_display', 'currency', 'source_type', 'review_state', 'created_at', 'updated_at', 'last_modified_by']) requireString(value, key, 'transaction');
  if (!Number.isSafeInteger(value.amount_minor) || value.amount_minor === 0) throw new Error('Remote transaction payload has an invalid amount.');
}

function requireCategoryFields(value: Record<string, unknown>): void {
  for (const key of ['id', 'vault_id', 'name', 'slug', 'kind', 'color_token', 'icon_name', 'created_at', 'updated_at']) requireString(value, key, 'category');
  if (typeof value.position !== 'number' || typeof value.is_active !== 'boolean' || typeof value.version !== 'number') throw new Error('Remote category payload is missing required fields.');
}

function requireRuleFields(value: Record<string, unknown>): void {
  for (const key of ['id', 'vault_id', 'category_id', 'rule_type', 'matcher', 'created_from', 'created_at', 'updated_at']) requireString(value, key, 'categorization rule');
  if (typeof value.priority !== 'number' || typeof value.confidence !== 'number' || typeof value.evidence_count !== 'number' || typeof value.is_active !== 'boolean' || typeof value.version !== 'number') throw new Error('Remote categorization-rule payload is missing required fields.');
}

function originToLastModifiedBy(origin: AppendMutationInput['origin']): LastModifiedBy {
  if (origin === 'ios') return 'ios';
  if (origin === 'web') return 'web';
  if (origin === 'importer') return 'importer';
  return 'relay';
}

/**
 * Decrypting the envelope is deliberately outside this function. A platform
 * adapter passes the decrypted payload here; this function validates its
 * vault/entity scope and applies the projection atomically with the mutation
 * log's exactly-once guard.
 */
export async function applyRemoteMutation(input: RemoteMutationInput, db: Db): Promise<RemoteMutationResult> {
  if (input.mutation.vaultId !== input.vaultId) throw new Error('Remote mutation envelope targets the wrong vault.');
  const payload = requirePayload(input.payload);
  if (payload.entity !== input.mutation.entityType) {
    throw new Error('Remote mutation entity metadata does not match its decrypted payload.');
  }

  return applyMutationOnce(db, input.vaultId, input.mutation, async (projectionDb) => {
    const value = payload.value as Record<string, unknown>;
    switch (input.mutation.entityType as EntityType) {
      case 'transaction':
        await applyTransactionProjection(projectionDb, input.vaultId, input.mutation, value);
        return;
      case 'category':
        await applyCategoryProjection(projectionDb, input.vaultId, input.mutation, value);
        return;
      case 'categorization_rule':
        await applyRuleProjection(projectionDb, input.vaultId, input.mutation, value);
        return;
      default:
        throw new Error(`Remote entity ${input.mutation.entityType} is not supported by this projection adapter.`);
    }
  });
}

/** Narrow helper for callers that want to validate an operation before decrypting. */
export function isProjectableRemoteMutation(entityType: EntityType, operation: MutationOperation): boolean {
  if (entityType === 'transaction') return ['create', 'update', 'delete', 'import_commit'].includes(operation);
  if (entityType === 'category') return ['create', 'update', 'delete', 'restore', 'category_update'].includes(operation);
  if (entityType === 'categorization_rule') return ['create', 'update', 'rule_update'].includes(operation);
  return false;
}
