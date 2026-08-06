import { describe, expect, it } from 'vitest';
import { validateTransaction } from '../src/validation/transaction';
import { ERROR_CODES } from '@expense-tracker/contracts';

describe('Transaction validation (T044 subset)', () => {
  it('accepts a complete valid transaction', () => {
    const issues = validateTransaction({
      occurred_on: '2026-08-04',
      merchant_display: 'Cafe',
      amount_minor: -1250,
      currency: 'USD',
    });
    expect(issues).toEqual([]);
  });

  it('flags missing date, merchant, amount, and currency', () => {
    const issues = validateTransaction({});
    const codes = issues.map((i) => i.code);
    expect(codes).toContain(ERROR_CODES.DATE_INVALID);
    expect(codes).toContain(ERROR_CODES.AMOUNT_INVALID);
    expect(codes).toContain(ERROR_CODES.CURRENCY_REQUIRED);
    expect(codes).toContain(ERROR_CODES.VALIDATION_FAILED);
  });

  it('rejects invalid dates, amounts, and currencies', () => {
    const issues = validateTransaction({
      occurred_on: '2026-13-99',
      merchant_display: '  ',
      amount_minor: Number.NaN,
      currency: 'XXX',
    });
    expect(issues).toHaveLength(4);
  });

  it('rejects zero-value amounts before they can enter a durable queue', () => {
    const issues = validateTransaction({
      occurred_on: '2026-08-04',
      merchant_display: 'Cafe',
      amount_minor: 0,
      currency: 'USD',
    });
    expect(issues).toEqual([
      expect.objectContaining({ code: ERROR_CODES.AMOUNT_INVALID, field: 'amount_minor' }),
    ]);
  });

  it('rejects blank merchant after trimming', () => {
    const issues = validateTransaction({
      occurred_on: '2026-08-04',
      merchant_display: '   ',
      amount_minor: -100,
      currency: 'USD',
    });
    expect(issues[0]?.field).toBe('merchant_display');
  });
});
