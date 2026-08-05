/**
 * ISO 4217 currency codes. Only a small, explicit set is accepted so that
 * validation is deterministic; the vault default currency must be one of these.
 */
export const ISO_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'MXN',
  'BRL',
  'SEK',
  'NOK',
  'DKK',
  'NZD',
  'SGD',
  'HKD',
  'KRW',
  'PLN',
  'TRY',
  'ZAR',
  'THB',
  'IDR',
  'PHP',
] as const;

export type CurrencyCode = (typeof ISO_CURRENCY_CODES)[number];

export const CURRENCY_DISPLAY: Record<CurrencyCode, { symbol: string; minorPerUnit: number }> = {
  USD: { symbol: '$', minorPerUnit: 100 },
  EUR: { symbol: '€', minorPerUnit: 100 },
  GBP: { symbol: '£', minorPerUnit: 100 },
  CAD: { symbol: 'CA$', minorPerUnit: 100 },
  AUD: { symbol: 'A$', minorPerUnit: 100 },
  JPY: { symbol: '¥', minorPerUnit: 1 },
  CHF: { symbol: 'CHF ', minorPerUnit: 100 },
  CNY: { symbol: 'CN¥', minorPerUnit: 100 },
  INR: { symbol: '₹', minorPerUnit: 100 },
  MXN: { symbol: 'MX$', minorPerUnit: 100 },
  BRL: { symbol: 'R$', minorPerUnit: 100 },
  SEK: { symbol: 'kr ', minorPerUnit: 100 },
  NOK: { symbol: 'kr ', minorPerUnit: 100 },
  DKK: { symbol: 'kr ', minorPerUnit: 100 },
  NZD: { symbol: 'NZ$', minorPerUnit: 100 },
  SGD: { symbol: 'S$', minorPerUnit: 100 },
  HKD: { symbol: 'HK$', minorPerUnit: 100 },
  KRW: { symbol: '₩', minorPerUnit: 1 },
  PLN: { symbol: 'zł ', minorPerUnit: 100 },
  TRY: { symbol: '₺', minorPerUnit: 100 },
  ZAR: { symbol: 'R ', minorPerUnit: 100 },
  THB: { symbol: '฿', minorPerUnit: 100 },
  IDR: { symbol: 'Rp ', minorPerUnit: 100 },
  PHP: { symbol: '₱', minorPerUnit: 100 },
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (ISO_CURRENCY_CODES as readonly string[]).includes(value);
}

export function minorPerUnit(currency: string): number {
  if (!isCurrencyCode(currency)) {
    throw new Error(`Unsupported currency code: ${currency}`);
  }
  return CURRENCY_DISPLAY[currency].minorPerUnit;
}

export function currencySymbol(currency: string): string {
  if (!isCurrencyCode(currency)) {
    return `${currency} `;
  }
  return CURRENCY_DISPLAY[currency].symbol;
}
