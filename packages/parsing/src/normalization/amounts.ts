import { minorPerUnit } from '@expense-tracker/domain';

/**
 * Parse an amount string into exact minor units. Handles '$', thousands
 * separators, parentheses for negatives, and explicit signs.
 */
export function parseAmountMinor(
  raw: string | number | null | undefined,
  currency: string,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * minorPerUnit(currency));
  }

  const value = raw.trim();
  if (!value) return null;

  let negative = false;
  let body = value;

  if (body.startsWith('(') && body.endsWith(')')) {
    negative = true;
    body = body.slice(1, -1);
  }
  body = body.replace(/[$€£¥\s]/g, '').replace(/,/g, '');
  if (body.startsWith('-')) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith('+')) {
    body = body.slice(1);
  }

  if (!/^\d+(\.\d+)?$/.test(body)) return null;

  const decimal = Number(body);
  if (!Number.isFinite(decimal)) return null;
  const minor = Math.round(decimal * minorPerUnit(currency));
  return negative ? -minor : minor;
}
