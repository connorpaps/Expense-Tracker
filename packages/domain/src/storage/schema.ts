/**
 * Local vault SQL schema (T011). This DDL is executed by any SQLite-compatible
 * adapter: the browser uses @journeyapps/wa-sqlite, tests use node:sqlite, and
 * iOS mirrors the same tables through GRDB. Every durable record is scoped to
 * exactly one vault via vault_id.
 */

export interface SqlRow {
  [column: string]: string | number | null;
}

/** Minimal async SQL interface implemented by platform adapters. */
export interface Db {
  exec(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }>;
  all<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const SCHEMA_VERSION = 1;

export const SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  vault_owner_label TEXT,
  default_currency TEXT NOT NULL,
  locale TEXT NOT NULL,
  week_start TEXT NOT NULL DEFAULT 'locale_default',
  demo_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS paired_devices (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  wrapped_vault_key TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  paired_at TEXT NOT NULL,
  last_seen_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_paired_devices_vault ON paired_devices(vault_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  color_token TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (vault_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_vault ON categories(vault_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  occurred_on TEXT NOT NULL,
  merchant_display TEXT NOT NULL,
  merchant_original TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  category_id TEXT,
  category_source TEXT,
  category_confidence TEXT,
  note TEXT,
  source_type TEXT NOT NULL,
  statement_import_id TEXT,
  source_row_key TEXT,
  review_state TEXT NOT NULL,
  original_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_by TEXT NOT NULL DEFAULT 'web',
  CHECK (merchant_display <> ''),
  CHECK (amount_minor IS NOT NULL),
  CHECK (currency <> '')
);
CREATE INDEX IF NOT EXISTS idx_transactions_vault_date ON transactions(vault_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(vault_id, merchant_display, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(vault_id, category_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_import ON transactions(vault_id, statement_import_id);

CREATE TABLE IF NOT EXISTS statement_imports (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  bank_profile TEXT,
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  recognized_rows INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  storage_reference TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_imports_vault_fingerprint ON statement_imports(vault_id, source_fingerprint);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES statement_imports(id),
  vault_id TEXT NOT NULL,
  source_row_number INTEGER NOT NULL,
  parsed_date TEXT,
  parsed_merchant TEXT,
  parsed_amount_minor INTEGER,
  parsed_currency TEXT,
  suggested_category_id TEXT,
  category_source TEXT,
  category_confidence TEXT,
  row_status TEXT NOT NULL,
  diagnostics TEXT NOT NULL DEFAULT '[]',
  duplicate_candidate_ids TEXT NOT NULL DEFAULT '[]',
  user_decision TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (import_id, source_row_number)
);
CREATE INDEX IF NOT EXISTS idx_import_rows_import ON import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_vault ON import_rows(vault_id);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  category_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  matcher TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_rules_vault ON categorization_rules(vault_id);

CREATE TABLE IF NOT EXISTS mutation_log (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_version INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  lamport_clock INTEGER NOT NULL,
  vector_clock TEXT NOT NULL,
  changed_fields TEXT NOT NULL DEFAULT '[]',
  ciphertext TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  conflict_id TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  UNIQUE (vault_id, id)
);
CREATE INDEX IF NOT EXISTS idx_mutation_log_queue ON mutation_log(vault_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_mutation_log_clock ON mutation_log(vault_id, device_id, lamport_clock);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  conflicting_fields TEXT NOT NULL,
  local_values TEXT NOT NULL,
  remote_values TEXT NOT NULL,
  base_values TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_values TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conflicts_vault ON conflicts(vault_id, status);

CREATE TABLE IF NOT EXISTS demo_datasets (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id),
  name TEXT NOT NULL,
  seed_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

/** Apply the schema and record the version in user_version. */
export async function applySchema(db: Db): Promise<void> {
  await db.exec(SCHEMA_DDL);
  await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export async function schemaVersion(db: Db): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}
