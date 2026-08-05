import { isCurrencyCode, minorPerUnit } from './currency';

/**
 * Exact minor-unit monetary values. Floating-point display values are never the
 * source of truth; all arithmetic happens on integer minor units.
 */

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export class Money {
  readonly minor: number;
  readonly currency: string;

  constructor(minor: number, currency: string) {
    if (!Number.isSafeInteger(minor)) {
      throw new InvalidAmountError(`Amount must be a safe integer of minor units, got ${minor}`);
    }
    if (!isCurrencyCode(currency)) {
      throw new InvalidAmountError(`Unsupported currency: ${currency}`);
    }
    this.minor = minor;
    this.currency = currency;
  }

  static fromDecimal(decimal: number | string, currency: string): Money {
    const minor = minorPerUnit(currency);
    const value = typeof decimal === 'string' ? Number(decimal) : decimal;
    if (!Number.isFinite(value)) {
      throw new InvalidAmountError(`Non-finite amount: ${decimal}`);
    }
    const scaled = Math.round(value * minor);
    return new Money(scaled, currency);
  }

  /** Parse a normalized numeric string such as "12.34", "-5", "1,234.56". */
  static parse(value: string, currency: string): Money {
    const cleaned = value.trim().replace(/,/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      throw new InvalidAmountError(`Unparseable amount: ${value}`);
    }
    return Money.fromDecimal(cleaned, currency);
  }

  get isNegative(): boolean {
    return this.minor < 0;
  }

  get isZero(): boolean {
    return this.minor === 0;
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  abs(): Money {
    return new Money(Math.abs(this.minor), this.currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  compareTo(other: Money): number {
    this.assertSameCurrency(other);
    return Math.sign(this.minor - other.minor);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new InvalidAmountError(
        `Cannot combine currencies: ${this.currency} and ${other.currency}`,
      );
    }
  }
}

/**
 * Deterministic formatting of a minor-unit amount for a given currency.
 * Uses integer arithmetic and locale-insensitive grouping for tests and UI.
 */
export function formatMinor(minor: number, currency: string): string {
  const perUnit = minorPerUnit(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / perUnit);
  const frac = abs % perUnit;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (perUnit === 1) {
    return `${sign}${grouped}`;
  }
  const digits = perUnit.toString().length - 1;
  return `${sign}${grouped}.${frac.toString().padStart(digits, '0')}`;
}
