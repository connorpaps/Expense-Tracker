import { DEFAULT_PARSE_LIMITS } from '@expense-tracker/contracts';
import type { ParseLimits } from '@expense-tracker/contracts';
import type { RowDiagnostic } from '@expense-tracker/domain';

export { DEFAULT_PARSE_LIMITS };
export type { ParseLimits };

export type ParsedRowStatus = 'valid' | 'warning' | 'error';

export interface ParsedRow {
  sourceRowNumber: number;
  parsedDate: string | null;
  parsedMerchant: string | null;
  merchantOriginal: string | null;
  parsedAmountMinor: number | null;
  currency: string | null;
  diagnostics: RowDiagnostic[];
  rowStatus: ParsedRowStatus;
}

export interface ParsedStatement {
  profile: string | null;
  fileType: 'csv' | 'pdf';
  totalRows: number;
  recognizedRows: number;
  rows: ParsedRow[];
  warningCount: number;
  errorCount: number;
  cancelled: boolean;
  statementWarnings: string[];
  parserVersion: string;
}

export interface ParseProgress {
  phase: 'reading' | 'parsing' | 'finalizing';
  current: number;
  total: number;
}

export interface ParseOptions {
  fileName: string;
  currency?: string;
  limits?: Partial<ParseLimits>;
  token?: CancellationToken;
  onProgress?: (progress: ParseProgress) => void;
}

export class CancellationToken {
  private _cancelled = false;

  get cancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    this._cancelled = true;
  }
}

export type ParseErrorCode =
  | 'IMPORT_TOO_LARGE'
  | 'IMPORT_EMPTY'
  | 'IMPORT_PARSE_FAILED'
  | 'IMPORT_PDF_ENCRYPTED'
  | 'IMPORT_PDF_IMAGE_ONLY'
  | 'IMPORT_PDF_UNSUPPORTED_LAYOUT'
  | 'PDF_TOO_MANY_PAGES'
  | 'CANCELLED';

export class ParseError extends Error {
  readonly code: ParseErrorCode;
  readonly retryable: boolean;

  constructor(code: ParseErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function mergedLimits(partial?: Partial<ParseLimits>): ParseLimits {
  return { ...DEFAULT_PARSE_LIMITS, ...partial };
}

export function isCancelled(token?: CancellationToken): boolean {
  return token?.cancelled === true;
}

export function throwIfCancelled(token?: CancellationToken): void {
  if (isCancelled(token)) {
    throw new ParseError('CANCELLED', 'Parsing was cancelled.', true);
  }
}
