import type { Db, SqlRow } from '@expense-tracker/domain';
import {
  randomUuid,
  VAULT_EXPORT_FORMAT,
  VAULT_EXPORT_TABLES,
  vaultExportColumns,
  buildVaultExportSnapshot,
  replaceVaultWithExportSnapshot,
  validateVaultExportSnapshot as validateSharedVaultExportSnapshot,
} from '@expense-tracker/domain';
import type { VaultExportSnapshot as SharedVaultExportSnapshot } from '@expense-tracker/domain';
import {
  clearMutationKeyStorage,
  decryptExportPayload,
  encryptExportPayload,
  EXPORT_KDF,
} from './security';
export { encryptExportPayload } from './security';
export { EXPORT_KDF } from './security';

export const EXPORT_FORMAT = VAULT_EXPORT_FORMAT;

/** Runtime sync/device records are intentionally excluded: their ciphertext is protected by the source browser's local key. */
export const EXPORT_TABLES = VAULT_EXPORT_TABLES;

type ExportTable = (typeof EXPORT_TABLES)[number];

function validateCopyRow(table: ExportTable, row: SqlRow): readonly string[] {
  const columns = vaultExportColumns(table);
  const actual = Object.keys(row).sort();
  const expected = [...columns].sort();
  if (
    actual.length !== expected.length ||
    actual.some((column, index) => column !== expected[index])
  ) {
    throw new Error(`The backup contains incomplete or unsupported fields in ${table}.`);
  }
  return columns;
}

function insertRow(db: Db, table: ExportTable, row: SqlRow): Promise<void> {
  const columns = validateCopyRow(table, row);
  return db
    .exec(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => row[column] ?? null),
    )
    .then(() => undefined);
}

function insertVaultRow(db: Db, row: SqlRow): Promise<void> {
  const columns = [
    'id',
    'vault_owner_label',
    'default_currency',
    'locale',
    'week_start',
    'demo_mode',
    'created_at',
    'updated_at',
    'deleted_at',
  ];
  const actual = Object.keys(row).sort();
  if (
    actual.length !== columns.length ||
    actual.some((column, index) => column !== [...columns].sort()[index])
  ) {
    throw new Error('The backup contains unsupported vault fields.');
  }
  return db
    .exec(
      `INSERT INTO vaults (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => row[column] ?? null),
    )
    .then(() => undefined);
}

export type VaultExportSnapshot = SharedVaultExportSnapshot;

interface VaultExportEnvelope {
  format: typeof EXPORT_FORMAT;
  kdf: typeof EXPORT_KDF;
  encrypted: string;
  checksum: string;
}

function asJson(snapshot: VaultExportSnapshot): string {
  return JSON.stringify(snapshot);
}

export async function computeExportChecksum(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildVaultExport(db: Db, vaultId: string): Promise<VaultExportSnapshot> {
  return buildVaultExportSnapshot(db, vaultId);
}

export async function exportVault(db: Db, vaultId: string, password: string): Promise<Blob> {
  if (password.length < 8) throw new Error('Use an export password with at least 8 characters.');
  const snapshot = await buildVaultExport(db, vaultId);
  const encrypted = await encryptExportPayload(asJson(snapshot), password);
  const envelope: VaultExportEnvelope = {
    format: EXPORT_FORMAT,
    kdf: EXPORT_KDF,
    encrypted,
    checksum: await computeExportChecksum(encrypted),
  };
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

export async function parseVaultExport(file: File, password: string): Promise<VaultExportSnapshot> {
  let raw: Partial<VaultExportEnvelope>;
  try {
    raw = JSON.parse(await file.text()) as Partial<VaultExportEnvelope>;
  } catch {
    throw new Error('This file is not a readable Expense Tracker vault backup.');
  }
  if (
    raw.format !== EXPORT_FORMAT ||
    raw.kdf?.algorithm !== EXPORT_KDF.algorithm ||
    raw.kdf.iterations !== EXPORT_KDF.iterations ||
    raw.kdf.cipher !== EXPORT_KDF.cipher ||
    typeof raw.encrypted !== 'string' ||
    typeof raw.checksum !== 'string'
  ) {
    throw new Error('This is not a supported Expense Tracker vault backup.');
  }
  if (raw.checksum !== (await computeExportChecksum(raw.encrypted))) {
    throw new Error('The backup checksum does not match; the file may be damaged.');
  }
  let snapshot: VaultExportSnapshot;
  try {
    snapshot = JSON.parse(
      await decryptExportPayload(raw.encrypted, password),
    ) as VaultExportSnapshot;
  } catch (cause) {
    if (cause instanceof Error && /password|damaged|unsupported/i.test(cause.message)) throw cause;
    throw new Error('The encrypted backup contents are invalid.');
  }
  if (!snapshot.tables.category_correction_history) {
    snapshot.tables.category_correction_history = [];
  }
  validateVaultExportSnapshot(snapshot);
  return snapshot;
}

function validateVaultExportSnapshot(snapshot: VaultExportSnapshot): void {
  validateSharedVaultExportSnapshot(snapshot);
}

/** Copy a verified snapshot into a new isolated vault without touching existing vaults. */
export async function importAsNewVault(
  db: Db,
  snapshot: VaultExportSnapshot,
  label: string,
): Promise<string> {
  validateVaultExportSnapshot(snapshot);
  const newVaultId = randomUuid();
  const now = new Date().toISOString();
  const categoryIds = new Map<string, string>();
  const importIds = new Map<string, string>();
  const transactionIds = new Map<string, string>();
  const ruleIds = new Map<string, string>();
  const sourceVault = snapshot.vault;
  const vault: SqlRow = {
    ...sourceVault,
    id: newVaultId,
    vault_owner_label:
      label.trim() || `${String(sourceVault.vault_owner_label ?? 'Imported vault')} copy`,
    demo_mode: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  for (const row of snapshot.tables.categories) categoryIds.set(String(row.id), randomUuid());
  for (const row of snapshot.tables.statement_imports) importIds.set(String(row.id), randomUuid());
  for (const row of snapshot.tables.transactions) transactionIds.set(String(row.id), randomUuid());
  for (const row of snapshot.tables.categorization_rules) ruleIds.set(String(row.id), randomUuid());

  await db.transaction(async (transactionDb) => {
    await insertVaultRow(transactionDb, vault);
    for (const row of snapshot.tables.categories) {
      await insertRow(transactionDb, 'categories', {
        ...row,
        id: categoryIds.get(String(row.id))!,
        vault_id: newVaultId,
      });
    }
    for (const row of snapshot.tables.statement_imports) {
      await insertRow(transactionDb, 'statement_imports', {
        ...row,
        id: importIds.get(String(row.id))!,
        vault_id: newVaultId,
      });
    }
    for (const row of snapshot.tables.import_rows) {
      await insertRow(transactionDb, 'import_rows', {
        ...row,
        id: randomUuid(),
        import_id: importIds.get(String(row.import_id))!,
        vault_id: newVaultId,
        suggested_category_id:
          row.suggested_category_id === null
            ? null
            : categoryIds.get(String(row.suggested_category_id))!,
        duplicate_candidate_ids: '[]',
      });
    }
    for (const row of snapshot.tables.category_correction_history) {
      await insertRow(transactionDb, 'category_correction_history', {
        ...row,
        id: randomUuid(),
        vault_id: newVaultId,
        transaction_id:
          row.transaction_id === null
            ? null
            : (transactionIds.get(String(row.transaction_id)) ?? null),
        import_id: row.import_id === null ? null : (importIds.get(String(row.import_id)) ?? null),
        previous_category_id:
          row.previous_category_id === null
            ? null
            : (categoryIds.get(String(row.previous_category_id)) ?? null),
        next_category_id: categoryIds.get(String(row.next_category_id))!,
      });
    }
    for (const row of snapshot.tables.categorization_rules) {
      await insertRow(transactionDb, 'categorization_rules', {
        ...row,
        id: ruleIds.get(String(row.id))!,
        vault_id: newVaultId,
        category_id: categoryIds.get(String(row.category_id))!,
      });
    }
    for (const row of snapshot.tables.transactions) {
      await insertRow(transactionDb, 'transactions', {
        ...row,
        id: transactionIds.get(String(row.id))!,
        vault_id: newVaultId,
        category_id: row.category_id === null ? null : categoryIds.get(String(row.category_id))!,
        statement_import_id:
          row.statement_import_id === null ? null : importIds.get(String(row.statement_import_id))!,
        source_type:
          typeof row.source_type === 'string' && row.source_type !== 'demo'
            ? row.source_type
            : 'manual',
        last_modified_by: 'web',
      });
    }
    // A copy is intentionally a personal vault. Do not carry demo metadata into it.
    void snapshot.tables.demo_datasets;
    await ensureSubscriptionsCategory(transactionDb, newVaultId);
  });
  return newVaultId;
}

async function ensureSubscriptionsCategory(db: Db, vaultId: string): Promise<void> {
  const existing = await db.get<{ id: string }>(
    'SELECT id FROM categories WHERE vault_id = ? AND name = ?',
    [vaultId, 'Subscriptions'],
  );
  if (existing) return;
  const position = await db.get<{ position: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM categories WHERE vault_id = ?',
    [vaultId],
  );
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO categories (id, vault_id, name, slug, kind, color_token, icon_name, position, is_active, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUuid(),
      vaultId,
      'Subscriptions',
      'subscriptions',
      'expense',
      'plum',
      'repeat',
      position?.position ?? 0,
      1,
      now,
      now,
      1,
    ],
  );
}

/** Replace local records with an explicitly selected, password-verified snapshot. */
export async function replaceWithVaultExport(db: Db, snapshot: VaultExportSnapshot): Promise<void> {
  return replaceVaultWithExportSnapshot(db, snapshot);
}

export async function clearLocalData(db: Db): Promise<void> {
  let closeError: unknown;
  try {
    await db.close();
  } catch (cause) {
    closeError = cause;
  }
  let storageError: unknown;
  try {
    await Promise.all([deleteIndexedDb('expense-tracker'), clearMutationKeyStorage()]);
  } catch (cause) {
    storageError = cause;
  }
  if (closeError && storageError)
    throw new AggregateError(
      [closeError, storageError],
      'Local data and browser-key cleanup both failed.',
    );
  if (closeError) throw closeError;
  if (storageError) throw storageError;
}

function deleteIndexedDb(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not clear ${name}.`));
    request.onblocked = () => reject(new Error(`Close other tabs before clearing ${name}.`));
  });
}

export function downloadVaultExport(blob: Blob, fileName = 'expense-tracker-vault.etvault'): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
