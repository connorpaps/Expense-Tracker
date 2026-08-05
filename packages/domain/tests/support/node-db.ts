import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, SqlRow } from '../../src/storage/schema';

/**
 * Test-only Db implementation backed by node:sqlite. The browser adapter
 * (wa-sqlite) runs the exact same DDL and repository SQL.
 */
export function createNodeDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const db: Db = {
    async exec(sql, params: unknown[] = []) {
      if (params.length === 0) {
        // Multi-statement DDL: DatabaseSync.exec runs each statement.
        const changes = sqlite.exec(sql);
        return { changes: typeof changes === 'number' ? changes : 0, lastInsertRowid: 0 };
      }
      const stmt = sqlite.prepare(sql);
      const result = stmt.run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return sqlite.prepare(sql).get(...(params as SQLInputValue[])) as T | undefined;
    },
    async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await fn(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      sqlite.close();
    },
  };
  return db;
}

export async function withNodeDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = createNodeDb();
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}
