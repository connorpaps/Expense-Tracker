import { isValidIsoDate, toIsoDate } from '@expense-tracker/domain';

/**
 * Parse statement dates into ISO calendar dates (YYYY-MM-DD). Supported source
 * formats: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, YYYY/MM/DD.
 */
export function parseStatementDate(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;

  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) {
    return toIsoDate(Number(match[3]), Number(match[1]), Number(match[2]));
  }

  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (match) {
    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  return null;
}

export function isValidStatementDate(raw: string | null | undefined): boolean {
  const parsed = parseStatementDate(raw);
  return parsed !== null && isValidIsoDate(parsed);
}
