import { describe, expect, it } from 'vitest';
import { Money, InvalidAmountError, formatMinor, isCurrencyCode, minorPerUnit } from '../src/money';

describe('Money arithmetic (T010)', () => {
  it('stores exact minor units', () => {
    const money = Money.fromDecimal(12.34, 'USD');
    expect(money.minor).toBe(1234);
    expect(money.currency).toBe('USD');
  });

  it('never produces floating point drift', () => {
    const a = Money.fromDecimal(0.1, 'USD');
    const b = Money.fromDecimal(0.2, 'USD');
    expect(a.add(b).minor).toBe(30);
    // 19.99 * 100 is 1998.9999999999998 in float math; our path must yield 1999.
    expect(19.99 * 100).not.toBe(1999);
    expect(Money.fromDecimal(19.99, 'USD').minor).toBe(1999);
    expect(Money.fromDecimal('19.99', 'USD').minor).toBe(1999);
  });

  it('parses normalized strings including thousands separators', () => {
    expect(Money.parse('1,234.56', 'USD').minor).toBe(123456);
    expect(Money.parse('-5.00', 'USD').minor).toBe(-500);
    expect(Money.parse('100', 'JPY').minor).toBe(100);
  });

  it('rejects unparseable and non-finite amounts', () => {
    expect(() => Money.parse('abc', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.parse('$12.34', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.fromDecimal(Number.NaN, 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.fromDecimal(Number.POSITIVE_INFINITY, 'USD')).toThrow(InvalidAmountError);
  });

  it('rejects non-integer minor units and unknown currencies', () => {
    expect(() => new Money(12.5, 'USD')).toThrow(InvalidAmountError);
    expect(() => new Money(1, 'XXX')).toThrow(InvalidAmountError);
  });

  it('supports negation, absolute, add, subtract, compare', () => {
    const ten = Money.fromDecimal(10, 'USD');
    const four = Money.fromDecimal(4, 'USD');
    expect(ten.negate().minor).toBe(-1000);
    expect(ten.subtract(four).minor).toBe(600);
    expect(ten.compareTo(four)).toBe(1);
    expect(ten.add(four).equals(Money.fromDecimal(14, 'USD'))).toBe(true);
  });

  it('refuses to combine different currencies', () => {
    expect(() => Money.fromDecimal(1, 'USD').add(Money.fromDecimal(1, 'EUR'))).toThrow(InvalidAmountError);
  });

  it('formats minor units deterministically', () => {
    expect(formatMinor(123456, 'USD')).toBe('1,234.56');
    expect(formatMinor(-123456, 'USD')).toBe('-1,234.56');
    expect(formatMinor(5, 'USD')).toBe('0.05');
    expect(formatMinor(100, 'JPY')).toBe('100');
  });

  it('validates ISO currency codes', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(minorPerUnit('JPY')).toBe(1);
    expect(minorPerUnit('USD')).toBe(100);
  });
});
