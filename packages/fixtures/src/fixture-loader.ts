import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export interface ExpectedValidRow {
  source_row_number: number;
  occurred_on: string;
  merchant_display: string;
  amount_minor: number;
  currency: string;
}

export interface ExpectedErrorRow {
  source_row_number: number;
  diagnostic_codes: string[];
}

export interface ExpectedImport {
  fixture: string;
  file_type: 'csv' | 'pdf';
  profile: string;
  total_rows: number;
  recognized_rows: number;
  valid_rows: ExpectedValidRow[];
  error_rows: ExpectedErrorRow[];
}

export function readStatementCsv(name: string): string {
  const path = join(PACKAGE_DIR, 'statements', 'csv', name);
  return readFileSync(path, 'utf8');
}

export function loadExpectedImport(name: string): ExpectedImport {
  const path = join(PACKAGE_DIR, 'expected', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as ExpectedImport;
}

export function listStatementCsvNames(): string[] {
  const dir = join(PACKAGE_DIR, 'statements', 'csv');
  return ['amex.csv', 'apple-card.csv', 'chase.csv', 'capital-one.csv', 'us-bank.csv', 'malformed.csv', 'empty.csv', 'credits.csv'].filter(
    (name) => existsSync(join(dir, name)),
  );
}

export function demoDataPath(): string {
  return join(PACKAGE_DIR, 'demo', 'demo-data.json');
}
