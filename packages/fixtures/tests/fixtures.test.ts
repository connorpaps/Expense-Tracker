import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadExpectedImport,
  readStatementCsv,
  assertGoldenImport,
  standardPdfStatement,
  demoDataPath,
} from '../src/index';
import { validateAgainstSchema } from './schema-validator';
import type { Schema } from './schema-validator';

const dir = fileURLToPath(new URL('..', import.meta.url));

function loadSchema(name: string): Schema {
  return JSON.parse(readFileSync(join(dir, 'schemas', `${name}.schema.json`), 'utf8')) as Schema;
}

describe('Fixture schemas (T014)', () => {
  it('validates statement import fixtures against the import schema', () => {
    const schema = loadSchema('import');
    const preview = {
      import_id: 'import-1',
      vault_id: 'vault-1',
      file_name: 'amex.csv',
      file_type: 'csv',
      file_size_bytes: 512,
      source_fingerprint: 'sha256-abc',
      bank_profile: 'amex',
      parser_version: '0.1.0',
      status: 'review',
      total_rows: 5,
      recognized_rows: 5,
      warning_count: 0,
      error_count: 0,
      created_at: '2026-08-04T00:00:00.000Z',
    };
    expect(validateAgainstSchema(preview, schema)).toEqual([]);
  });

  it('validates mutation fixtures against the mutation schema', () => {
    const schema = loadSchema('mutation');
    const mutation = {
      mutation_id: 'm1',
      vault_id: 'vault-1',
      device_id: 'device-a',
      clock: { lamport: 1, vector: { 'device-a': 1 } },
      entity_type: 'transaction',
      entity_id: 'tx-1',
      operation: 'create',
      base_version: 0,
      changed_fields: ['amount_minor'],
      ciphertext: 'abc',
    };
    expect(validateAgainstSchema(mutation, schema)).toEqual([]);
    expect(
      validateAgainstSchema({ ...mutation, operation: 'nope' }, schema).length,
    ).toBeGreaterThan(0);
  });

  it('validates the sync and demo fixtures', () => {
    for (const file of ['phone-away.json', 'conflict.json', 'mutation-batch.json']) {
      const raw = JSON.parse(readFileSync(join(dir, 'sync', file), 'utf8')) as Record<string, unknown>;
      expect(raw.vault_id).toBeDefined();
      expect(raw.expected ?? raw.expected_after_drain).toBeDefined();
    }
    const demo = JSON.parse(readFileSync(demoDataPath(), 'utf8')) as Record<string, unknown>;
    expect(demo.demo).toBe(true);
    expect(demo.label).toContain('Sample data');
    expect((demo.transactions as unknown[]).length).toBeGreaterThan(5);
    expect((demo.categories as unknown[]).length).toBeGreaterThanOrEqual(8);
  });

  it('runs a normalized result through the shared golden assertion helper', () => {
    const expected = loadExpectedImport('amex');
    const failures = assertGoldenImport({
      totalRows: 5,
      recognizedRows: 5,
      rows: expected.valid_rows.map((row) => ({
        sourceRowNumber: row.source_row_number,
        occurredOn: row.occurred_on,
        merchantDisplay: row.merchant_display,
        amountMinor: row.amount_minor,
        currency: row.currency,
        rowStatus: 'valid',
      })),
    }, expected);
    expect(failures).toEqual([]);
  });

  it('keeps every golden expected file loadable and structurally valid', () => {
    const expectedDir = join(dir, 'expected');
    const files = readdirSync(expectedDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) {
      const expected = loadExpectedImport(file.replace('.json', ''));
      expect(expected.total_rows).toBeGreaterThanOrEqual(expected.recognized_rows);
      expect(expected.recognized_rows).toBeGreaterThanOrEqual(expected.valid_rows.length);
    }
  });
});

describe('CSV statement fixtures (T021)', () => {
  it('contains the sanitized supported-bank fixtures', () => {
    const csvDir = join(dir, 'statements', 'csv');
    const files = readdirSync(csvDir).filter((f) => f.endsWith('.csv'));
    expect(files).toEqual(
      expect.arrayContaining([
        'amex.csv',
        'apple-card.csv',
        'chase.csv',
        'capital-one.csv',
        'us-bank.csv',
        'malformed.csv',
        'empty.csv',
        'credits.csv',
      ]),
    );
    for (const name of ['amex.csv', 'chase.csv']) {
      expect(readStatementCsv(name).length).toBeGreaterThan(0);
    }
  });
});

describe('PDF fixture generator (T021)', () => {
  it('produces a well-formed PDF with text content', () => {
    const bytes = standardPdfStatement();
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('startxref');
    expect(text).toContain('%%EOF');
    expect(text).toContain('STARBUCKS');
    expect(text).toContain('DIRECT DEPOSIT PAYROLL');
  });

  it('is deterministic', () => {
    expect(standardPdfStatement()).toEqual(standardPdfStatement());
  });
});
