import { describe, expect, it } from 'vitest';
import { readStatementCsv } from '@expense-tracker/fixtures';
import { parseCsv } from '@expense-tracker/parsing';
import { measureSync } from './harness';

describe('web import performance harness (T022)', () => {
  it('measures local CSV parsing without imposing a machine-specific hard limit', () => {
    const source = readStatementCsv('amex.csv');
    const input = Array.from({ length: 2_000 }, () => source.split('\n').slice(1).join('\n')).join('\n');
    const measured = measureSync(() => parseCsv(`${source.split('\n')[0]}\n${input}`, { fileName: 'large.csv' }));
    expect(measured.value.rows.length).toBeGreaterThan(1_000);
    expect(measured.durationMs).toBeGreaterThanOrEqual(0);
  });
});
