import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDateKey, parseLocalDateKey } from './dateUtils';

describe('localDateKey', () => {
  it('formats using local calendar components, not UTC', () => {
    // Regression: LogContext used to key by `toISOString()` (UTC) while day-of-week
    // rotation used local time, so a log written late at night could land on the
    // wrong calendar day for negative-UTC-offset users.
    const date = new Date(2026, 0, 5, 23, 45); // Jan 5 2026, 23:45 local time
    expect(localDateKey(date)).toBe('2026-01-05');
  });

  it('pads single-digit month and day', () => {
    expect(localDateKey(new Date(2026, 2, 4))).toBe('2026-03-04');
  });
});

describe('parseLocalDateKey', () => {
  it('round-trips a valid key', () => {
    const parsed = parseLocalDateKey('2026-03-04');
    expect(parsed).not.toBeNull();
    expect(localDateKey(parsed!)).toBe('2026-03-04');
  });

  it('rejects malformed strings', () => {
    expect(parseLocalDateKey('not-a-date')).toBeNull();
    expect(parseLocalDateKey('2026-3-4')).toBeNull();
    expect(parseLocalDateKey('')).toBeNull();
  });

  it('rejects a date that silently rolls over (e.g. Feb 30)', () => {
    expect(parseLocalDateKey('2024-02-30')).toBeNull();
    expect(parseLocalDateKey('2026-13-01')).toBeNull();
  });
});

describe('addDays / daysBetween', () => {
  it('addDays advances the calendar date without mutating the input', () => {
    const start = new Date(2026, 0, 30);
    const next = addDays(start, 3);
    expect(localDateKey(next)).toBe('2026-02-02');
    expect(localDateKey(start)).toBe('2026-01-30');
  });

  it('daysBetween counts whole calendar days', () => {
    const from = parseLocalDateKey('2026-01-01')!;
    const to = parseLocalDateKey('2026-01-15')!;
    expect(daysBetween(from, to)).toBe(14);
  });

  it('daysBetween is negative when `to` precedes `from`', () => {
    const from = parseLocalDateKey('2026-01-15')!;
    const to = parseLocalDateKey('2026-01-01')!;
    expect(daysBetween(from, to)).toBe(-14);
  });
});
