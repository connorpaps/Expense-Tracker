/**
 * Bank profile detection (T036). Profiles are recognized from distinctive
 * header shapes so the same logic works on web and iOS; unsupported layouts are
 * reported as 'unknown' rather than guessed.
 */

export type BankProfile =
  | 'amex'
  | 'apple_card'
  | 'chase'
  | 'capital_one'
  | 'us_bank'
  | 'unknown';

export interface ColumnRoles {
  date: string | null;
  merchant: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
}

export const PROFILE_LABELS: Record<BankProfile, string> = {
  amex: 'American Express',
  apple_card: 'Apple Card',
  chase: 'Chase',
  capital_one: 'Capital One',
  us_bank: 'US Bank',
  unknown: 'Unknown layout',
};

function normalizedHeaders(headers: string[]): string[] {
  return headers.map((h) => h.trim().toLowerCase());
}

export function detectProfile(headers: string[]): { profile: BankProfile; roles: ColumnRoles } {
  const hs = normalizedHeaders(headers);

  let profile: BankProfile = 'unknown';
  if (hs.includes('card member')) profile = 'amex';
  else if (hs.includes('clearing date')) profile = 'apple_card';
  else if (hs.includes('post date') && hs.includes('memo')) profile = 'chase';
  else if (hs.includes('card no.') || (hs.includes('debit') && hs.includes('credit'))) {
    profile = 'capital_one';
  } else if (hs.includes('balance')) profile = 'us_bank';

  const roles: ColumnRoles = {
    date: findColumn(headers, ['transaction date', 'posted date', 'date', 'post date']),
    merchant: findColumn(headers, ['description', 'merchant', 'payee', 'name']),
    amount: findColumn(headers, ['amount']),
    debit: findColumn(headers, ['debit']),
    credit: findColumn(headers, ['credit']),
  };

  return { profile, roles };
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const hs = normalizedHeaders(headers);
  for (const candidate of candidates) {
    const index = hs.indexOf(candidate);
    if (index !== -1) return headers[index]!;
  }
  // Loose match for amount-like and date-like columns.
  for (let i = 0; i < hs.length; i += 1) {
    const header = hs[i] ?? '';
    if (candidates.includes('amount') && /amount/i.test(header)) return headers[i]!;
    if (candidates.includes('date') && /date/i.test(header) && !/posted|clearing/i.test(header)) {
      return headers[i]!;
    }
  }
  return null;
}
