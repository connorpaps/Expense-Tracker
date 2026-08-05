import { describe, expect, it } from 'vitest';
import { generateNoTextPdf, generatePdfStatement } from '@expense-tracker/fixtures';
import { CancellationToken, parseCsv, parsePdf } from '../src/index';

const HEADER = 'Date,Description,Amount\n';

describe('Parser safety limits (T027)', () => {
  it('rejects files larger than 10 MB', () => {
    const oversized = HEADER + 'x'.repeat(10 * 1024 * 1024 + 1);
    expect(() => parseCsv(oversized, { fileName: 'big.csv' })).toThrowError(
      expect.objectContaining({ code: 'IMPORT_TOO_LARGE' }),
    );
  });

  it('truncates at 50,000 rows with a visible warning', () => {
    const row = '07/01/2026,Merchant,-1.00\n';
    const content = HEADER + row.repeat(51_000);
    const result = parseCsv(content, { fileName: 'many.csv' });
    expect(result.totalRows).toBe(50_000);
    expect(result.statementWarnings.some((w) => w.includes('truncated'))).toBe(true);
  });

  it('honors cancellation mid-parse', () => {
    const token = new CancellationToken();
    const row = '07/01/2026,Merchant,-1.00\n';
    const content = HEADER + row.repeat(20_000);
    expect(() =>
      parseCsv(content, {
        fileName: 'cancel.csv',
        token,
        // Cancel on the first progress tick; the next row check throws.
        onProgress: () => token.cancel(),
      }),
    ).toThrowError(expect.objectContaining({ code: 'CANCELLED' }));
  });

  it('returns zero rows for an empty statement (explicit empty state)', () => {
    const result = parseCsv(HEADER, { fileName: 'empty.csv' });
    expect(result.totalRows).toBe(0);
    expect(result.recognizedRows).toBe(0);
  });
});

describe('PDF safety (T027)', () => {
  it('rejects image-only PDFs with an explicit unsupported state', async () => {
    const noText = generateNoTextPdf();
    await expect(parsePdf(noText, { fileName: 'scanned.pdf' })).rejects.toThrowError(
      expect.objectContaining({ code: 'IMPORT_PDF_IMAGE_ONLY' }),
    );
  });

  it('reports readable PDFs with an unsupported transaction layout', async () => {
    const pdf = generatePdfStatement([
      { date: '07/01/2026', description: 'MERCHANT A', amount: 'not-an-amount' },
    ]);
    await expect(parsePdf(pdf, { fileName: 'unsupported-layout.pdf' })).rejects.toThrowError(
      expect.objectContaining({ code: 'IMPORT_PDF_UNSUPPORTED_LAYOUT' }),
    );
  });

  it('cancels long PDF parsing', async () => {
    const token = new CancellationToken();
    const pdf = generatePdfStatement([
      { date: '07/01/2026', description: 'MERCHANT A', amount: '-1.00' },
      { date: '07/02/2026', description: 'MERCHANT B', amount: '-2.00' },
    ]);
    token.cancel();
    await expect(parsePdf(pdf, { fileName: 'cancel.pdf', token })).rejects.toThrowError(
      expect.objectContaining({ code: 'CANCELLED' }),
    );
  });

  it('rejects files larger than the limit before parsing', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(parsePdf(big, { fileName: 'big.pdf' })).rejects.toThrowError(
      expect.objectContaining({ code: 'IMPORT_TOO_LARGE' }),
    );
  });
});
