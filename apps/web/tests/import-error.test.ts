import { describe, expect, it } from 'vitest';
import { parseErrorMessage } from '../src/features/imports/import-pipeline';

describe('web import error messages', () => {
  it('explains encrypted PDFs', () => {
    expect(parseErrorMessage('IMPORT_PDF_ENCRYPTED')).toBe(
      'This PDF is password-protected. Export it without a password and try again.',
    );
  });

  it('explains image-only PDFs', () => {
    expect(parseErrorMessage('IMPORT_PDF_IMAGE_ONLY')).toBe(
      'This PDF contains no readable text. Export a text-based statement or import a CSV instead.',
    );
  });

  it('explains readable PDFs with unsupported transaction layouts', () => {
    expect(parseErrorMessage('IMPORT_PDF_UNSUPPORTED_LAYOUT')).toBe(
      'This PDF has readable text, but its transaction layout is not supported yet. Export the bank statement as CSV or share a text-based sample for support.',
    );
  });

  it('supports legacy PDF parser codes from an older worker bundle', () => {
    expect(parseErrorMessage('PDF_UNSUPPORTED_LAYOUT')).toBe(
      'This PDF has readable text, but its transaction layout is not supported yet. Export the bank statement as CSV or share a text-based sample for support.',
    );
  });

  it('keeps malformed PDFs on the generic parse message', () => {
    expect(parseErrorMessage('IMPORT_PARSE_FAILED')).toBe(
      'This file could not be parsed. Check the file and try again.',
    );
  });
});
