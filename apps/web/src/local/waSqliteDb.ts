/**
 * Browser SQLite adapter (T017) backed by @journeyapps/wa-sqlite. The IndexedDB
 * batch-atomic VFS gives a durable local store; the same schema/repository SQL
 * runs on node:sqlite in tests and GRDB on iOS.
 */

import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs';
import wasmUrl from '@journeyapps/wa-sqlite/dist/wa-sqlite-async.wasm?url';
import * as SQLite from '@journeyapps/wa-sqlite';
import type { Db, SqlRow } from '@expense-tracker/domain';

type Sqlite3 = ReturnType<typeof SQLite.Factory>;

export interface WaSqliteOptions {
  /** 'idb' uses an IndexedDB VFS (browser); 'memory' is for tests/tooling. */
  vfs: 'idb' | 'memory';
  /** IndexedDB database name when vfs === 'idb'. */
  idbName?: string;
  /** SQLite database path within the VFS. */
  path?: string;
}

type SqliteRow = Array<string | number | bigint | Uint8Array | null>;

export async function openWaSqliteDb(options: WaSqliteOptions): Promise<Db> {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const sqlite3 = SQLite.Factory(module);
  const vfsName =
    options.vfs === 'idb'
      ? await registerIdbVfs(sqlite3, module, options.idbName ?? 'expense-tracker')
      : 'memory';
  const path = options.path ?? (options.vfs === 'idb' ? 'vault.db' : ':memory:');
  const flags = SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE;

  const dbHandle = await sqlite3.open_v2(path, flags, vfsName);
  await sqlite3.exec(dbHandle, 'PRAGMA foreign_keys = ON;');

  const db: Db = {
    async exec(sql, params: unknown[] = []) {
      if (params.length === 0) {
        await sqlite3.exec(dbHandle, sql);
        return { changes: 0, lastInsertRowid: 0 };
      }
      for await (const stmt of sqlite3.statements(dbHandle, sql)) {
        await sqlite3.bind_collection(stmt, params as Array<string | number | null | Uint8Array>);
        while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          // Consume rows so the statement completes. The statements()
          // iterator owns statement finalization; do not finalize here.
        }
      }
      return { changes: 0, lastInsertRowid: 0 };
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      const rows: T[] = [];
      if (params.length === 0) {
        await sqlite3.exec(dbHandle, sql, (row, columns) => {
          rows.push(zipRow(columns, row as SqliteRow) as T);
        });
        return rows;
      }
      for await (const stmt of sqlite3.statements(dbHandle, sql)) {
        await sqlite3.bind_collection(stmt, params as Array<string | number | null | Uint8Array>);
        const columns = sqlite3.column_names(stmt);
        while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          rows.push(zipRow(columns, sqlite3.row(stmt) as SqliteRow) as T);
        }
        // The statements() iterator owns statement finalization.
      }
      return rows;
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await db.all<T>(sql, params);
      return rows[0];
    },
    async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      await db.exec('BEGIN');
      try {
        const result = await fn(db);
        await db.exec('COMMIT');
        return result;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      await sqlite3.close(dbHandle);
    },
  };

  return db;
}

/** Zip positional sqlite3.row() values with column names into an object row. */
function zipRow(columns: string[], row: SqliteRow): SqlRow {
  const out: SqlRow = {};
  for (let i = 0; i < columns.length; i += 1) {
    const raw = row[i] ?? null;
    let value: string | number | null;
    if (raw === null) value = null;
    else if (raw instanceof Uint8Array) value = new TextDecoder().decode(raw);
    else if (typeof raw === 'bigint') value = Number(raw);
    else value = raw;
    out[columns[i] ?? `col${i}`] = value;
  }
  return out;
}

async function registerIdbVfs(sqlite3: Sqlite3, module: unknown, idbName: string): Promise<string> {
  const { IDBBatchAtomicVFS } = await import('@journeyapps/wa-sqlite/src/examples/IDBBatchAtomicVFS.js');
  // IDBBatchAtomicVFS needs the initialized Emscripten module so its VFS
  // callbacks can access the same WASM memory as the SQLite API.
  const Vfs = IDBBatchAtomicVFS as unknown as new (
    name: string,
    module: unknown,
    options?: { idbName?: string },
  ) => { isReady(): Promise<void>; name: string };
  const vfs = new Vfs(idbName, module, { idbName });
  await vfs.isReady();
  await sqlite3.vfs_register(vfs as unknown as Parameters<Sqlite3['vfs_register']>[0], true);
  return vfs.name;
}
