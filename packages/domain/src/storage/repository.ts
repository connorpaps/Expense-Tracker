/**
 * Vault-scoped repository queries (T011). All reads and writes are scoped to a
 * vault_id so cross-vault access is impossible through this layer. Row mapping
 * converts snake_case SQL columns to camelCase entities.
 */

import type { LocalVault, PairedDevice } from '../entities/vault';
import type { Category } from '../entities/category';
import type { Transaction } from '../entities/transaction';
import type { StatementImport, ImportRowReview, RowDiagnostic } from '../entities/import';
import type { CategorizationRule, ConflictRecord } from '../entities/rules';
import type { Db, SqlRow } from './schema';
import { isCurrencyCode } from '../money/currency';
import { isValidIsoDate } from '../periods/dates';

export interface TransactionQuery {
  vaultId: string;
  range?: { start: string; end: string };
  categoryId?: string | null;
  currency?: string | null;
  search?: string | null;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionPatch {
  occurred_on?: string;
  merchant_display?: string;
  amount_minor?: number;
  category_id?: string | null;
  category_source?: Transaction['category_source'];
  category_confidence?: Transaction['category_confidence'];
  note?: string | null;
  review_state?: Transaction['review_state'];
  updated_at: string;
  last_modified_by: Transaction['last_modified_by'];
}

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

export async function insertVault(db: Db, vault: LocalVault): Promise<void> {
  await db.exec(
    `INSERT INTO vaults (id, vault_owner_label, default_currency, locale, week_start, demo_mode, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vault.id,
      vault.vault_owner_label,
      vault.default_currency,
      vault.locale,
      vault.week_start,
      vault.demo_mode ? 1 : 0,
      vault.created_at,
      vault.updated_at,
      vault.deleted_at,
    ],
  );
}

export async function getVault(db: Db, vaultId: string): Promise<LocalVault | null> {
  const row = await db.get<SqlRow>('SELECT * FROM vaults WHERE id = ? AND deleted_at IS NULL', [vaultId]);
  return row ? mapVault(row) : null;
}

export async function listVaults(db: Db): Promise<LocalVault[]> {
  const rows = await db.all<SqlRow>('SELECT * FROM vaults WHERE deleted_at IS NULL ORDER BY created_at ASC');
  return rows.map(mapVault);
}

export async function softDeleteVault(db: Db, vaultId: string, deletedAt: string): Promise<void> {
  await db.exec('UPDATE vaults SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    deletedAt,
    deletedAt,
    vaultId,
  ]);
}

function mapVault(row: SqlRow): LocalVault {
  return {
    id: row.id as string,
    vault_owner_label: (row.vault_owner_label as string | null) ?? null,
    default_currency: row.default_currency as string,
    locale: row.locale as string,
    week_start: row.week_start as LocalVault['week_start'],
    demo_mode: row.demo_mode === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Paired devices
// ---------------------------------------------------------------------------

export async function insertPairedDevice(db: Db, device: PairedDevice): Promise<void> {
  await db.exec(
    `INSERT INTO paired_devices (id, vault_id, display_name, public_key, capabilities, wrapped_vault_key, key_version, paired_at, last_seen_at, status, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      device.id,
      device.vault_id,
      device.display_name,
      device.public_key,
      JSON.stringify(device.capabilities),
      device.wrapped_vault_key,
      device.key_version,
      device.paired_at,
      device.last_seen_at,
      device.status,
      device.revoked_at,
    ],
  );
}

export async function listPairedDevices(db: Db, vaultId: string): Promise<PairedDevice[]> {
  const rows = await db.all<SqlRow>(
    'SELECT * FROM paired_devices WHERE vault_id = ? ORDER BY paired_at DESC',
    [vaultId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    vault_id: row.vault_id as string,
    display_name: row.display_name as string,
    public_key: row.public_key as string,
    capabilities: JSON.parse(row.capabilities as string) as PairedDevice['capabilities'],
    wrapped_vault_key: row.wrapped_vault_key as string,
    key_version: row.key_version as number,
    paired_at: row.paired_at as string,
    last_seen_at: (row.last_seen_at as string | null) ?? null,
    status: row.status as PairedDevice['status'],
    revoked_at: (row.revoked_at as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function insertCategory(db: Db, category: Category): Promise<void> {
  const name = category.name.trim();
  if (!name) throw new Error('Category name cannot be blank.');
  const duplicate = await db.get<{ id: string }>(
    'SELECT id FROM categories WHERE vault_id = ? AND lower(name) = lower(?) AND id <> ?',
    [category.vault_id, name, category.id],
  );
  if (duplicate) throw new Error('Category names must be unique within a vault.');
  await db.exec(
    `INSERT INTO categories (id, vault_id, name, slug, kind, color_token, icon_name, position, is_active, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.vault_id,
      name,
      category.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      category.kind,
      category.color_token,
      category.icon_name,
      category.position,
      category.is_active ? 1 : 0,
      category.created_at,
      category.updated_at,
      category.version,
    ],
  );
}

export async function listCategories(db: Db, vaultId: string): Promise<Category[]> {
  const rows = await db.all<SqlRow>(
    'SELECT * FROM categories WHERE vault_id = ? ORDER BY position ASC, name ASC',
    [vaultId],
  );
  return rows.map(mapCategory);
}

export async function getCategory(db: Db, vaultId: string, categoryId: string): Promise<Category | null> {
  const row = await db.get<SqlRow>(
    'SELECT * FROM categories WHERE vault_id = ? AND id = ?',
    [vaultId, categoryId],
  );
  return row ? mapCategory(row) : null;
}

export async function updateCategoryActive(
  db: Db,
  vaultId: string,
  categoryId: string,
  isActive: boolean,
  updatedAt: string,
): Promise<void> {
  if (!isActive) {
    const current = await getCategory(db, vaultId, categoryId);
    if (current?.is_active) {
      const activeRules = await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM categorization_rules WHERE vault_id = ? AND category_id = ? AND is_active = 1',
        [vaultId, categoryId],
      );
      if ((activeRules?.count ?? 0) > 0) {
        throw new Error('Disable personal rules for this category before archiving it.');
      }
      const active = await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM categories WHERE vault_id = ? AND is_active = 1',
        [vaultId],
      );
      if ((active?.count ?? 0) <= 1) {
        throw new Error('At least one active category must remain available.');
      }
    }
  }
  await db.exec(
    'UPDATE categories SET is_active = ?, updated_at = ?, version = version + 1 WHERE vault_id = ? AND id = ?',
    [isActive ? 1 : 0, updatedAt, vaultId, categoryId],
  );
}

export async function updateCategory(
  db: Db,
  vaultId: string,
  categoryId: string,
  patch: { name?: string; slug?: string; position?: number; updated_at: string },
): Promise<void> {
  const sets = ['updated_at = ?', 'version = version + 1'];
  const params: unknown[] = [patch.updated_at];
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Category name cannot be blank.');
    const duplicate = await db.get<{ id: string }>(
      'SELECT id FROM categories WHERE vault_id = ? AND lower(name) = lower(?) AND id <> ?',
      [vaultId, name, categoryId],
    );
    if (duplicate) throw new Error('Category names must be unique within a vault.');
    sets.push('name = ?');
    params.push(name);
  }
  if (patch.slug !== undefined) {
    sets.push('slug = ?');
    params.push(patch.slug);
  }
  if (patch.position !== undefined) {
    sets.push('position = ?');
    params.push(patch.position);
  }
  params.push(vaultId, categoryId);
  await db.exec(`UPDATE categories SET ${sets.join(', ')} WHERE vault_id = ? AND id = ?`, params);
}

export async function reorderCategories(
  db: Db,
  vaultId: string,
  orderedCategoryIds: string[],
  updatedAt: string,
): Promise<void> {
  const categories = await listCategories(db, vaultId);
  const known = new Set(categories.map((category) => category.id));
  if (orderedCategoryIds.length !== categories.length || new Set(orderedCategoryIds).size !== categories.length || orderedCategoryIds.some((id) => !known.has(id))) {
    throw new Error('Category order must include every category in this vault exactly once.');
  }
  for (const [position, categoryId] of orderedCategoryIds.entries()) {
    await db.exec(
      'UPDATE categories SET position = ?, updated_at = ?, version = version + 1 WHERE vault_id = ? AND id = ?',
      [position, updatedAt, vaultId, categoryId],
    );
  }
}

export async function mergeCategory(
  db: Db,
  vaultId: string,
  sourceCategoryId: string,
  targetCategoryId: string,
  updatedAt: string,
): Promise<void> {
  if (sourceCategoryId === targetCategoryId) throw new Error('Choose a different target category.');
  const source = await getCategory(db, vaultId, sourceCategoryId);
  const target = await getCategory(db, vaultId, targetCategoryId);
  if (!source || !target || !target.is_active) throw new Error('The merge target must be an active category in this vault.');
  await db.exec(
    'UPDATE transactions SET category_id = ?, category_source = \'user\', category_confidence = \'confirmed\', updated_at = ?, version = version + 1 WHERE vault_id = ? AND category_id = ?',
    [targetCategoryId, updatedAt, vaultId, sourceCategoryId],
  );
  await db.exec(
    'UPDATE categorization_rules SET category_id = ?, updated_at = ?, version = version + 1 WHERE vault_id = ? AND category_id = ?',
    [targetCategoryId, updatedAt, vaultId, sourceCategoryId],
  );
  await db.exec(
    'UPDATE categories SET is_active = 0, updated_at = ?, version = version + 1 WHERE vault_id = ? AND id = ?',
    [updatedAt, vaultId, sourceCategoryId],
  );
}

function mapCategory(row: SqlRow): Category {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    name: row.name as string,
    slug: row.slug as string,
    kind: row.kind as Category['kind'],
    color_token: row.color_token as string,
    icon_name: row.icon_name as string,
    position: row.position as number,
    is_active: row.is_active === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    version: row.version as number,
  };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function insertTransaction(db: Db, tx: Transaction): Promise<void> {
  if (!tx.merchant_display.trim()) throw new Error('Merchant is required.');
  if (!isValidIsoDate(tx.occurred_on)) throw new Error('Date must be a valid ISO calendar date.');
  if (!Number.isSafeInteger(tx.amount_minor) || tx.amount_minor === 0) throw new Error('Amount must be a non-zero integer.');
  if (!isCurrencyCode(tx.currency)) throw new Error('Currency must be a supported ISO code.');
  if (tx.category_id) {
    const category = await getCategory(db, tx.vault_id, tx.category_id);
    if (!category || !category.is_active) throw new Error('Category must be active in this vault.');
  }
  await db.exec(
    `INSERT INTO transactions (id, vault_id, occurred_on, merchant_display, merchant_original, amount_minor, currency, category_id, category_source, category_confidence, note, source_type, statement_import_id, source_row_key, review_state, original_payload, created_at, updated_at, deleted_at, version, last_modified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      tx.vault_id,
      tx.occurred_on,
      tx.merchant_display,
      tx.merchant_original,
      tx.amount_minor,
      tx.currency,
      tx.category_id,
      tx.category_source,
      tx.category_confidence,
      tx.note,
      tx.source_type,
      tx.statement_import_id,
      tx.source_row_key,
      tx.review_state,
      tx.original_payload,
      tx.created_at,
      tx.updated_at,
      tx.deleted_at,
      tx.version,
      tx.last_modified_by,
    ],
  );
}

export async function getTransaction(db: Db, vaultId: string, txId: string): Promise<Transaction | null> {
  const row = await db.get<SqlRow>(
    'SELECT * FROM transactions WHERE vault_id = ? AND id = ?',
    [vaultId, txId],
  );
  return row ? mapTransaction(row) : null;
}

export async function listTransactions(db: Db, query: TransactionQuery): Promise<Transaction[]> {
  const conditions: string[] = ['vault_id = ?'];
  const params: unknown[] = [query.vaultId];

  if (query.range) {
    conditions.push('occurred_on >= ?', 'occurred_on <= ?');
    params.push(query.range.start, query.range.end);
  }
  if (query.categoryId) {
    conditions.push('category_id = ?');
    params.push(query.categoryId);
  }
  if (query.currency) {
    conditions.push('currency = ?');
    params.push(query.currency);
  }
  if (query.search) {
    conditions.push('(merchant_display LIKE ? OR note LIKE ?)');
    const like = `%${query.search}%`;
    params.push(like, like);
  }
  if (!query.includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  let sql = `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY occurred_on DESC, created_at DESC`;
  if (query.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }
  if (query.offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(query.offset);
  }
  const rows = await db.all<SqlRow>(sql, params);
  return rows.map(mapTransaction);
}

export async function updateTransaction(db: Db, vaultId: string, txId: string, patch: TransactionPatch): Promise<void> {
  if (patch.merchant_display !== undefined && !patch.merchant_display.trim()) throw new Error('Merchant is required.');
  if (patch.amount_minor !== undefined && (!Number.isSafeInteger(patch.amount_minor) || patch.amount_minor === 0)) throw new Error('Amount must be a non-zero integer.');
  if (patch.occurred_on !== undefined && !isValidIsoDate(patch.occurred_on)) throw new Error('Date must be a valid ISO calendar date.');
  if (patch.category_id !== undefined && patch.category_id) {
    const category = await getCategory(db, vaultId, patch.category_id);
    if (!category || !category.is_active) throw new Error('Category must be active in this vault.');
  }
  const sets: string[] = ['updated_at = ?', 'version = version + 1', 'last_modified_by = ?'];
  const params: unknown[] = [patch.updated_at, patch.last_modified_by];
  if (patch.occurred_on !== undefined) {
    sets.push('occurred_on = ?');
    params.push(patch.occurred_on);
  }
  if (patch.merchant_display !== undefined) {
    sets.push('merchant_display = ?');
    params.push(patch.merchant_display);
  }
  if (patch.amount_minor !== undefined) {
    sets.push('amount_minor = ?');
    params.push(patch.amount_minor);
  }
  if (patch.category_id !== undefined) {
    sets.push('category_id = ?');
    params.push(patch.category_id);
  }
  if (patch.category_source !== undefined) {
    sets.push('category_source = ?');
    params.push(patch.category_source);
  }
  if (patch.category_confidence !== undefined) {
    sets.push('category_confidence = ?');
    params.push(patch.category_confidence);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    params.push(patch.note);
  }
  if (patch.review_state !== undefined) {
    sets.push('review_state = ?');
    params.push(patch.review_state);
  }
  params.push(vaultId, txId);
  await db.exec(`UPDATE transactions SET ${sets.join(', ')} WHERE vault_id = ? AND id = ?`, params);
}

export async function softDeleteTransaction(
  db: Db,
  vaultId: string,
  txId: string,
  deletedAt: string,
  lastModifiedBy: Transaction['last_modified_by'],
): Promise<void> {
  await db.exec(
    'UPDATE transactions SET deleted_at = ?, updated_at = ?, version = version + 1, last_modified_by = ? WHERE vault_id = ? AND id = ?',
    [deletedAt, deletedAt, lastModifiedBy, vaultId, txId],
  );
}

function mapTransaction(row: SqlRow): Transaction {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    occurred_on: row.occurred_on as string,
    merchant_display: row.merchant_display as string,
    merchant_original: (row.merchant_original as string | null) ?? null,
    amount_minor: row.amount_minor as number,
    currency: row.currency as string,
    category_id: (row.category_id as string | null) ?? null,
    category_source: (row.category_source as Transaction['category_source'] | null) ?? null,
    category_confidence: (row.category_confidence as Transaction['category_confidence'] | null) ?? null,
    note: (row.note as string | null) ?? null,
    source_type: row.source_type as Transaction['source_type'],
    statement_import_id: (row.statement_import_id as string | null) ?? null,
    source_row_key: (row.source_row_key as string | null) ?? null,
    review_state: row.review_state as Transaction['review_state'],
    original_payload: (row.original_payload as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    version: row.version as number,
    last_modified_by: row.last_modified_by as Transaction['last_modified_by'],
  };
}

// ---------------------------------------------------------------------------
// Statement imports
// ---------------------------------------------------------------------------

export async function insertStatementImport(db: Db, imp: StatementImport): Promise<void> {
  await db.exec(
    `INSERT INTO statement_imports (id, vault_id, file_name, file_type, file_size_bytes, source_fingerprint, bank_profile, parser_version, status, total_rows, recognized_rows, warning_count, error_count, storage_reference, created_at, completed_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      imp.id,
      imp.vault_id,
      imp.file_name,
      imp.file_type,
      imp.file_size_bytes,
      imp.source_fingerprint,
      imp.bank_profile,
      imp.parser_version,
      imp.status,
      imp.total_rows,
      imp.recognized_rows,
      imp.warning_count,
      imp.error_count,
      imp.storage_reference,
      imp.created_at,
      imp.completed_at,
      imp.deleted_at,
    ],
  );
}

export async function updateImportStatus(
  db: Db,
  vaultId: string,
  importId: string,
  patch: Partial<{
    status: StatementImport['status'];
    recognized_rows: number;
    warning_count: number;
    error_count: number;
    completed_at: string;
    storage_reference: string | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  params.push(vaultId, importId);
  await db.exec(`UPDATE statement_imports SET ${sets.join(', ')} WHERE vault_id = ? AND id = ?`, params);
}

export async function getStatementImport(db: Db, vaultId: string, importId: string): Promise<StatementImport | null> {
  const row = await db.get<SqlRow>(
    'SELECT * FROM statement_imports WHERE vault_id = ? AND id = ? AND deleted_at IS NULL',
    [vaultId, importId],
  );
  return row ? mapStatementImport(row) : null;
}

export async function listStatementImports(db: Db, vaultId: string): Promise<StatementImport[]> {
  const rows = await db.all<SqlRow>(
    'SELECT * FROM statement_imports WHERE vault_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [vaultId],
  );
  return rows.map(mapStatementImport);
}

function mapStatementImport(row: SqlRow): StatementImport {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    file_name: row.file_name as string,
    file_type: row.file_type as StatementImport['file_type'],
    file_size_bytes: row.file_size_bytes as number,
    source_fingerprint: row.source_fingerprint as string,
    bank_profile: (row.bank_profile as string | null) ?? null,
    parser_version: row.parser_version as string,
    status: row.status as StatementImport['status'],
    total_rows: row.total_rows as number,
    recognized_rows: row.recognized_rows as number,
    warning_count: row.warning_count as number,
    error_count: row.error_count as number,
    storage_reference: (row.storage_reference as string | null) ?? null,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Import rows
// ---------------------------------------------------------------------------

export async function insertImportRows(db: Db, vaultId: string, rows: ImportRowReview[]): Promise<void> {
  for (const row of rows) {
    await db.exec(
      `INSERT INTO import_rows (id, import_id, vault_id, source_row_number, parsed_date, parsed_merchant, parsed_amount_minor, parsed_currency, suggested_category_id, category_source, category_confidence, row_status, diagnostics, duplicate_candidate_ids, user_decision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.import_id,
        vaultId,
        row.source_row_number,
        row.parsed_date,
        row.parsed_merchant,
        row.parsed_amount_minor,
        row.parsed_currency,
        row.suggested_category_id,
        row.category_source,
        row.category_confidence,
        row.row_status,
        JSON.stringify(row.diagnostics),
        JSON.stringify(row.duplicate_candidate_ids),
        row.user_decision,
      ],
    );
  }
}

export async function listImportRows(db: Db, vaultId: string, importId: string): Promise<ImportRowReview[]> {
  const rows = await db.all<SqlRow>(
    'SELECT * FROM import_rows WHERE vault_id = ? AND import_id = ? ORDER BY source_row_number ASC',
    [vaultId, importId],
  );
  return rows.map(mapImportRow);
}

export async function updateImportRowDecision(
  db: Db,
  vaultId: string,
  rowId: string,
  decision: ImportRowReview['user_decision'],
  rowStatus?: ImportRowReview['row_status'],
): Promise<void> {
  const sets = ['user_decision = ?'];
  const params: unknown[] = [decision];
  if (rowStatus) {
    sets.push('row_status = ?');
    params.push(rowStatus);
  }
  params.push(vaultId, rowId);
  await db.exec(`UPDATE import_rows SET ${sets.join(', ')} WHERE vault_id = ? AND id = ?`, params);
}

function mapImportRow(row: SqlRow): ImportRowReview {
  return {
    id: row.id as string,
    import_id: row.import_id as string,
    source_row_number: row.source_row_number as number,
    parsed_date: (row.parsed_date as string | null) ?? null,
    parsed_merchant: (row.parsed_merchant as string | null) ?? null,
    parsed_amount_minor: (row.parsed_amount_minor as number | null) ?? null,
    parsed_currency: (row.parsed_currency as string | null) ?? null,
    suggested_category_id: (row.suggested_category_id as string | null) ?? null,
    category_source: (row.category_source as ImportRowReview['category_source'] | null) ?? null,
    category_confidence: (row.category_confidence as ImportRowReview['category_confidence'] | null) ?? null,
    row_status: row.row_status as ImportRowReview['row_status'],
    diagnostics: JSON.parse(row.diagnostics as string) as RowDiagnostic[],
    duplicate_candidate_ids: JSON.parse(row.duplicate_candidate_ids as string) as string[],
    user_decision: row.user_decision as ImportRowReview['user_decision'],
  };
}

// ---------------------------------------------------------------------------
// Categorization rules
// ---------------------------------------------------------------------------

export async function insertRule(db: Db, rule: CategorizationRule): Promise<void> {
  const category = await getCategory(db, rule.vault_id, rule.category_id);
  if (!category || !category.is_active) {
    throw new Error('Personal rules must target an active category.');
  }
  await db.exec(
    `INSERT INTO categorization_rules (id, vault_id, category_id, rule_type, matcher, priority, confidence, evidence_count, is_active, created_from, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.id,
      rule.vault_id,
      rule.category_id,
      rule.rule_type,
      rule.matcher,
      rule.priority,
      rule.confidence,
      rule.evidence_count,
      rule.is_active ? 1 : 0,
      rule.created_from,
      rule.created_at,
      rule.updated_at,
      rule.version,
    ],
  );
}

export async function updateRule(
  db: Db,
  vaultId: string,
  ruleId: string,
  patch: Partial<Pick<CategorizationRule, 'category_id' | 'matcher' | 'priority' | 'confidence' | 'evidence_count' | 'is_active'>> & { updated_at: string },
): Promise<void> {
  const currentRule = await db.get<{ category_id: string }>(
    'SELECT category_id FROM categorization_rules WHERE vault_id = ? AND id = ?',
    [vaultId, ruleId],
  );
  const targetCategoryId = patch.category_id ?? currentRule?.category_id;
  if (targetCategoryId && (patch.category_id !== undefined || patch.is_active === true)) {
    const category = await getCategory(db, vaultId, targetCategoryId);
    if (!category || !category.is_active) throw new Error('Personal rules must target an active category.');
  }
  const sets = ['updated_at = ?', 'version = version + 1'];
  const params: unknown[] = [patch.updated_at];
  for (const key of ['category_id', 'matcher', 'priority', 'confidence', 'evidence_count', 'is_active'] as const) {
    const value = patch[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      params.push(key === 'is_active' ? (value ? 1 : 0) : value);
    }
  }
  params.push(vaultId, ruleId);
  await db.exec(`UPDATE categorization_rules SET ${sets.join(', ')} WHERE vault_id = ? AND id = ?`, params);
}

export async function deleteRule(db: Db, vaultId: string, ruleId: string): Promise<void> {
  await db.exec('DELETE FROM categorization_rules WHERE vault_id = ? AND id = ?', [vaultId, ruleId]);
}

export async function listRules(db: Db, vaultId: string, activeOnly = true): Promise<CategorizationRule[]> {
  const sql = activeOnly
    ? 'SELECT * FROM categorization_rules WHERE vault_id = ? AND is_active = 1 ORDER BY priority DESC, evidence_count DESC'
    : 'SELECT * FROM categorization_rules WHERE vault_id = ? ORDER BY priority DESC';
  const rows = await db.all<SqlRow>(sql, [vaultId]);
  return rows.map(mapRule);
}

function mapRule(row: SqlRow): CategorizationRule {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    category_id: row.category_id as string,
    rule_type: row.rule_type as CategorizationRule['rule_type'],
    matcher: row.matcher as string,
    priority: row.priority as number,
    confidence: row.confidence as number,
    evidence_count: row.evidence_count as number,
    is_active: row.is_active === 1,
    created_from: row.created_from as CategorizationRule['created_from'],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    version: row.version as number,
  };
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export async function insertConflict(db: Db, conflict: ConflictRecord): Promise<void> {
  await db.exec(
    `INSERT INTO conflicts (id, vault_id, entity_type, entity_id, conflicting_fields, local_values, remote_values, base_values, status, resolved_values, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conflict.id,
      conflict.vault_id,
      conflict.entity_type,
      conflict.entity_id,
      JSON.stringify(conflict.conflicting_fields),
      conflict.local_values,
      conflict.remote_values,
      conflict.base_values,
      conflict.status,
      conflict.resolved_values,
      conflict.created_at,
      conflict.resolved_at,
    ],
  );
}

export async function getConflict(db: Db, vaultId: string, conflictId: string): Promise<ConflictRecord | null> {
  const row = await db.get<SqlRow>(
    'SELECT * FROM conflicts WHERE vault_id = ? AND id = ?',
    [vaultId, conflictId],
  );
  return row ? mapConflict(row) : null;
}

export async function listOpenConflicts(db: Db, vaultId: string): Promise<ConflictRecord[]> {
  const rows = await db.all<SqlRow>(
    "SELECT * FROM conflicts WHERE vault_id = ? AND status = 'open' ORDER BY created_at ASC",
    [vaultId],
  );
  return rows.map(mapConflict);
}

function mapConflict(row: SqlRow): ConflictRecord {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    conflicting_fields: JSON.parse(row.conflicting_fields as string) as string[],
    local_values: row.local_values as string,
    remote_values: row.remote_values as string,
    base_values: (row.base_values as string | null) ?? null,
    status: row.status as ConflictRecord['status'],
    resolved_values: (row.resolved_values as string | null) ?? null,
    created_at: row.created_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
  };
}
