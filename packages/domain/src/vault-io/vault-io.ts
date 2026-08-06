import type { Db, SqlRow } from '../storage/schema';
import { applySchema, SCHEMA_VERSION } from '../storage/schema';

export const VAULT_EXPORT_FORMAT = 'expense-tracker-vault-v1' as const;

export const VAULT_EXPORT_TABLES = [
  'categories',
  'transactions',
  'statement_imports',
  'import_rows',
  'categorization_rules',
  'category_correction_history',
  'demo_datasets',
] as const;

export type VaultExportTable = (typeof VAULT_EXPORT_TABLES)[number];

const VAULT_COLUMNS = ['id', 'vault_owner_label', 'default_currency', 'locale', 'week_start', 'demo_mode', 'created_at', 'updated_at', 'deleted_at'] as const;

const TABLE_COLUMNS: Record<VaultExportTable, readonly string[]> = {
  categories: ['id', 'vault_id', 'name', 'slug', 'kind', 'color_token', 'icon_name', 'position', 'is_active', 'created_at', 'updated_at', 'version'],
  transactions: ['id', 'vault_id', 'occurred_on', 'merchant_display', 'merchant_original', 'amount_minor', 'currency', 'category_id', 'category_source', 'category_confidence', 'note', 'source_type', 'statement_import_id', 'source_row_key', 'review_state', 'original_payload', 'created_at', 'updated_at', 'deleted_at', 'version', 'last_modified_by'],
  statement_imports: ['id', 'vault_id', 'file_name', 'file_type', 'file_size_bytes', 'source_fingerprint', 'bank_profile', 'parser_version', 'status', 'total_rows', 'recognized_rows', 'warning_count', 'error_count', 'storage_reference', 'created_at', 'completed_at', 'deleted_at'],
  import_rows: ['id', 'import_id', 'vault_id', 'source_row_number', 'parsed_date', 'parsed_merchant', 'parsed_amount_minor', 'parsed_currency', 'suggested_category_id', 'category_source', 'category_confidence', 'row_status', 'diagnostics', 'duplicate_candidate_ids', 'user_decision'],
  categorization_rules: ['id', 'vault_id', 'category_id', 'rule_type', 'matcher', 'priority', 'confidence', 'evidence_count', 'is_active', 'created_from', 'created_at', 'updated_at', 'version'],
  category_correction_history: ['id', 'vault_id', 'transaction_id', 'import_id', 'merchant_normalized', 'previous_category_id', 'next_category_id', 'source', 'created_at'],
  demo_datasets: ['id', 'vault_id', 'name', 'seed_version', 'created_at'],
};

export interface VaultExportSnapshot {
  format: typeof VAULT_EXPORT_FORMAT;
  exported_at: string;
  schema_version: number;
  vault: SqlRow;
  tables: Record<VaultExportTable, SqlRow[]>;
}

export function vaultExportColumns(table: VaultExportTable): readonly string[] {
  return TABLE_COLUMNS[table];
}

function requireText(row: SqlRow, column: string, context: string): string {
  const value = row[column];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`The backup contains an invalid ${context}.`);
  return value;
}

function validateColumns(table: VaultExportTable, row: SqlRow): void {
  const actual = Object.keys(row).sort();
  const expected = [...TABLE_COLUMNS[table]].sort();
  if (actual.length !== expected.length || actual.some((column, index) => column !== expected[index])) {
    throw new Error(`The backup contains incomplete or unsupported fields in ${table}.`);
  }
}

/** Build a complete, vault-scoped snapshot using the platform-neutral Db contract. */
export async function buildVaultExportSnapshot(db: Db, vaultId: string, exportedAt = new Date().toISOString()): Promise<VaultExportSnapshot> {
  const vault = await db.get<SqlRow>('SELECT * FROM vaults WHERE id = ? AND deleted_at IS NULL', [vaultId]);
  if (!vault) throw new Error('The selected vault no longer exists.');
  const version = await db.get<{ user_version: number }>('PRAGMA user_version');
  const tables = {} as Record<VaultExportTable, SqlRow[]>;
  for (const table of VAULT_EXPORT_TABLES) {
    tables[table] = await db.all<SqlRow>(`SELECT * FROM ${table} WHERE vault_id = ?`, [vaultId]);
  }
  const snapshot: VaultExportSnapshot = {
    format: VAULT_EXPORT_FORMAT,
    exported_at: exportedAt,
    schema_version: version?.user_version ?? SCHEMA_VERSION,
    vault,
    tables,
  };
  validateVaultExportSnapshot(snapshot);
  return snapshot;
}

/** Validate format, schema compatibility, vault scoping, identities, and references. */
export function validateVaultExportSnapshot(snapshot: VaultExportSnapshot): void {
  if (
    !snapshot ||
    snapshot.format !== VAULT_EXPORT_FORMAT ||
    typeof snapshot.exported_at !== 'string' ||
    !Number.isInteger(snapshot.schema_version) ||
    snapshot.schema_version < 1 ||
    snapshot.schema_version > SCHEMA_VERSION ||
    !snapshot.vault
  ) {
    throw new Error('The backup contents are incomplete, unsupported, or too new for this app.');
  }

  const actualVaultColumns = Object.keys(snapshot.vault).sort();
  if (actualVaultColumns.join('|') !== [...VAULT_COLUMNS].sort().join('|') || typeof snapshot.vault.demo_mode !== 'number') {
    throw new Error('The backup contains an invalid vault record.');
  }
  const vaultId = requireText(snapshot.vault, 'id', 'vault identity');
  const ids = new Set<string>();
  const categoryIds = new Set<string>();
  const importIds = new Set<string>();
  const transactionIds = new Set<string>();

  for (const table of VAULT_EXPORT_TABLES) {
    const rows = snapshot.tables?.[table];
    if (!Array.isArray(rows)) throw new Error(`The backup is missing its ${table} records.`);
    for (const row of rows) {
      validateColumns(table, row);
      if (row.vault_id !== vaultId) throw new Error('The backup contains records from another vault.');
      const id = requireText(row, 'id', `${table} identity`);
      const scopedId = `${table}:${id}`;
      if (ids.has(scopedId)) throw new Error(`The backup contains a duplicate ${table} record.`);
      ids.add(scopedId);
      if (table === 'categories') categoryIds.add(id);
      if (table === 'statement_imports') importIds.add(id);
      if (table === 'transactions') transactionIds.add(id);
    }
  }

  for (const row of snapshot.tables.transactions) {
    if (row.category_id !== null && !categoryIds.has(String(row.category_id))) throw new Error('The backup contains a transaction with an unknown category.');
    if (row.statement_import_id !== null && !importIds.has(String(row.statement_import_id))) throw new Error('The backup contains a transaction with an unknown import.');
  }
  for (const row of snapshot.tables.categorization_rules) {
    if (!categoryIds.has(String(row.category_id))) throw new Error('The backup contains a rule with an unknown category.');
  }
  for (const row of snapshot.tables.category_correction_history) {
    if (!categoryIds.has(String(row.next_category_id)) || (row.previous_category_id !== null && !categoryIds.has(String(row.previous_category_id)))) throw new Error('The backup contains correction history with an unknown category.');
    if (row.transaction_id !== null && !transactionIds.has(String(row.transaction_id))) throw new Error('The backup contains correction history with an unknown transaction.');
    if (row.import_id !== null && !importIds.has(String(row.import_id))) throw new Error('The backup contains correction history with an unknown import.');
  }
  for (const row of snapshot.tables.import_rows) {
    if (!importIds.has(String(row.import_id))) throw new Error('The backup contains an import row with an unknown import.');
    if (row.suggested_category_id !== null && !categoryIds.has(String(row.suggested_category_id))) throw new Error('The backup contains an import row with an unknown category.');
  }
}

function insertSnapshotRow(db: Db, table: VaultExportTable, row: SqlRow): Promise<void> {
  validateColumns(table, row);
  const columns = TABLE_COLUMNS[table];
  return db.exec(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column] ?? null),
  ).then(() => undefined);
}

function insertVault(db: Db, row: SqlRow): Promise<void> {
  const actual = Object.keys(row).sort();
  if (actual.join('|') !== [...VAULT_COLUMNS].sort().join('|')) throw new Error('The backup contains unsupported vault fields.');
  return db.exec(
    `INSERT INTO vaults (${VAULT_COLUMNS.join(', ')}) VALUES (${VAULT_COLUMNS.map(() => '?').join(', ')})`,
    VAULT_COLUMNS.map((column) => row[column] ?? null),
  ).then(() => undefined);
}

/** Replace local exported records transactionally after validation and schema checks. */
export async function replaceVaultWithExportSnapshot(db: Db, snapshot: VaultExportSnapshot): Promise<void> {
  validateVaultExportSnapshot(snapshot);
  await applySchema(db);
  await db.transaction(async (transactionDb) => {
    for (const table of ['mutation_log', 'conflicts', 'category_correction_history', 'import_rows', 'transactions', 'categorization_rules', 'statement_imports', 'categories', 'paired_devices', 'demo_datasets', 'vaults']) {
      await transactionDb.exec(`DELETE FROM ${table}`);
    }
    await insertVault(transactionDb, snapshot.vault);
    for (const table of VAULT_EXPORT_TABLES) {
      for (const row of snapshot.tables[table]) await insertSnapshotRow(transactionDb, table, row);
    }
  });
}
