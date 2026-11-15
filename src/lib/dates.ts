// Pure date helpers for analytics windows.
export function addDays(d: Date, n: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface Range {
  start: string;
  end: string;
}

/**
 * Current window of `days` ending `lagDays` before today (analytics data lags),
 * plus the immediately preceding window of the same length for comparison.
 */
export function dateRanges(days: number, now: Date = new Date(), lagDays = 1): { current: Range; previous: Range } {
  const end = addDays(now, -lagDays);
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    current: { start: ymd(start), end: ymd(end) },
    previous: { start: ymd(prevStart), end: ymd(prevEnd) },
  };
}

/** Percentage change, or null when it cannot be computed honestly. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}
