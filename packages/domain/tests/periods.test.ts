import { describe, expect, it } from 'vitest';
import { isValidIsoDate, parseIsoDate, periodRange, customRange, rangeContains, formatRangeLabel, startOfWeek, endOfWeek, addDays, addMonths } from '../src/periods';

describe('ISO dates and periods (T010)', () => {
  it('validates ISO calendar dates', () => {
    expect(isValidIsoDate('2026-08-04')).toBe(true);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // leap year
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('08/04/2026')).toBe(false);
  });

  it('computes monday-start weeks', () => {
    const anchor = '2026-08-04'; // Tuesday
    expect(startOfWeek(anchor, 'monday')).toBe('2026-08-03');
    expect(endOfWeek(anchor, 'monday')).toBe('2026-08-09');
    // Sunday belongs to the previous monday-start week
    expect(startOfWeek('2026-08-09', 'monday')).toBe('2026-08-03');
    expect(startOfWeek('2026-08-10', 'monday')).toBe('2026-08-10');
  });

  it('computes sunday-start weeks', () => {
    const anchor = '2026-08-04';
    expect(startOfWeek(anchor, 'sunday')).toBe('2026-08-02');
    expect(endOfWeek(anchor, 'sunday')).toBe('2026-08-08');
  });

  it('resolves month boundaries across year boundaries', () => {
    const jan = periodRange({ type: 'month', anchor: '2026-01-15', weekStart: 'locale_default' });
    expect(jan).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    const leap = periodRange({ type: 'month', anchor: '2024-02-10', weekStart: 'locale_default' });
    expect(leap.end).toBe('2024-02-29');
    const dec = periodRange({ type: 'month', anchor: '2026-12-01', weekStart: 'locale_default' });
    expect(dec).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('builds validated custom ranges', () => {
    expect(customRange('2026-01-01', '2026-01-15')).toEqual({ start: '2026-01-01', end: '2026-01-15' });
    expect(() => customRange('2026-01-15', '2026-01-01')).toThrow();
    expect(() => customRange('2026-01-01', 'bad')).toThrow();
  });

  it('checks range containment inclusively', () => {
    const range = customRange('2026-01-01', '2026-01-31');
    expect(rangeContains(range, '2026-01-01')).toBe(true);
    expect(rangeContains(range, '2026-01-31')).toBe(true);
    expect(rangeContains(range, '2026-02-01')).toBe(false);
  });

  it('labels periods and adds days/months', () => {
    const month = periodRange({ type: 'month', anchor: '2026-08-04', weekStart: 'locale_default' });
    expect(formatRangeLabel(month, 'month')).toBe('August 2026');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // clamps to target month end
    expect(addMonths('2026-11-30', 2)).toBe('2027-01-30'); // crosses year boundary
  });

  it('parses ISO dates without timezone shifts', () => {
    expect(parseIsoDate('2026-08-04')).toEqual({ year: 2026, month: 8, day: 4 });
    expect(parseIsoDate('bad')).toBeNull();
  });
});
