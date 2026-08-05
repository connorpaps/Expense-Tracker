import type { PeriodType, WeekStart } from '../entities/enums';
import { addDays, isValidIsoDate, parseIsoDate, startOfMonth, startOfWeek } from './dates';

export interface DateRange {
  start: string;
  end: string;
}

export interface PeriodSpec {
  type: PeriodType;
  anchor: string;
  weekStart: WeekStart;
}

/** Effective week start; locale_default resolves to monday for this release. */
export function resolveWeekStart(weekStart: WeekStart): 'sunday' | 'monday' {
  return weekStart === 'sunday' ? 'sunday' : 'monday';
}

export function periodRange(spec: PeriodSpec): DateRange {
  if (!isValidIsoDate(spec.anchor)) {
    throw new Error(`Invalid anchor date: ${spec.anchor}`);
  }
  switch (spec.type) {
    case 'month': {
      const start = startOfMonth(spec.anchor);
      return { start, end: lastDayOfMonth(spec.anchor) };
    }
    case 'week': {
      const start = startOfWeek(spec.anchor, resolveWeekStart(spec.weekStart));
      return { start, end: addDays(start, 6) };
    }
    case 'custom':
      throw new Error('Custom periods require an explicit range');
  }
}

function lastDayOfMonth(anchor: string): string {
  const parsed = parseIsoDate(anchor);
  if (!parsed) throw new Error(`Invalid date: ${anchor}`);
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  const mm = parsed.month.toString().padStart(2, '0');
  const dd = lastDay.toString().padStart(2, '0');
  return `${parsed.year}-${mm}-${dd}`;
}

/** Build an explicit custom range with validation (start <= end). */
export function customRange(start: string, end: string): DateRange {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
    throw new Error('Custom range requires valid ISO dates');
  }
  if (start > end) {
    throw new Error('Custom range start must not be after end');
  }
  return { start, end };
}

export function rangeContains(range: DateRange, isoDate: string): boolean {
  return isoDate >= range.start && isoDate <= range.end;
}

/** Human label for a period, e.g. "August 2026" or "Week of Aug 3". */
export function formatRangeLabel(range: DateRange, type: PeriodType): string {
  if (type === 'month') {
    const [year, month] = range.start.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${monthNames[Number(month) - 1]} ${year}`;
  }
  if (type === 'week') {
    return `Week of ${shortDate(range.start)}`;
  }
  return `${shortDate(range.start)} – ${shortDate(range.end)}`;
}

export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${Number(month)}/${Number(day)}`;
}
