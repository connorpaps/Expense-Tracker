/**
 * Locale-aware calendar handling without external date libraries. Dates are
 * ISO calendar dates (YYYY-MM-DD); timestamps are ISO 8601 UTC. Week boundaries
 * support sunday/monday starts; locale_default falls back to monday.
 */

export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/** Date-only parsing (no timezone shift). */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidIsoDate(value)) return null;
  return { year, month, day };
}

export function toIsoDate(year: number, month: number, day: number): string {
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Day of week: 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(value: string): number {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

export function addDays(value: string, days: number): string {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Invalid ISO date: ${value}`);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addMonths(value: string, months: number): string {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Invalid ISO date: ${value}`);
  const targetMonth = parsed.month - 1 + months;
  const year = parsed.year + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(parsed.day, daysInTargetMonth);
  return toIsoDate(year, monthIndex + 1, day);
}

export function startOfMonth(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Invalid ISO date: ${value}`);
  return toIsoDate(parsed.year, parsed.month, 1);
}

export function endOfMonth(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Invalid ISO date: ${value}`);
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return toIsoDate(parsed.year, parsed.month, lastDay);
}

export function startOfWeek(value: string, weekStart: 'sunday' | 'monday'): string {
  const dow = dayOfWeek(value);
  let offset = dow;
  if (weekStart === 'sunday') {
    offset = dow;
  } else {
    offset = dow === 0 ? 6 : dow - 1;
  }
  return addDays(value, -offset);
}

export function endOfWeek(value: string, weekStart: 'sunday' | 'monday'): string {
  return addDays(startOfWeek(value, weekStart), 6);
}

/** Returns a valid UTC ISO timestamp for `now` in tests and clients. */
export function utcTimestamp(date?: Date): string {
  return (date ?? new Date()).toISOString();
}
