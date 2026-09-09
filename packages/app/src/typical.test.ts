import { describe, expect, it } from 'vitest';
import type { TypicalCell } from '@otrolado/shared';
import { compareToTypical, typicalSpread, UNUSUAL_THRESHOLD } from './typical';

const cells = (...minutes: number[]): TypicalCell[] =>
  minutes.map((avgWaitMinutes, hour) => ({ dow: 2, hour, avgWaitMinutes }));

describe('compareToTypical', () => {
  // The verdict behind "UNUSUALLY BUSY · 42 min longer than typical". The
  // threshold has to clear CBP's own ±10 min officer-reporting accuracy, or
  // the banner fires on two numbers that are, to the instrument, the same.
  it('calls a wait busy only once the gap clears reporting noise', () => {
    expect(compareToTypical(18 + UNUSUAL_THRESHOLD, 18).verdict).toBe('busy');
    expect(compareToTypical(18 + UNUSUAL_THRESHOLD - 1, 18).verdict).toBe('normal');
  });

  it('calls an unusually short line quiet, symmetrically', () => {
    // An unusually SHORT line is at least as actionable as a long one — it is
    // the case where someone should leave now.
    expect(compareToTypical(40 - UNUSUAL_THRESHOLD, 40).verdict).toBe('quiet');
    expect(compareToTypical(40 - UNUSUAL_THRESHOLD + 1, 40).verdict).toBe('normal');
  });

  it('reports the gap as a positive magnitude in both directions', () => {
    expect(compareToTypical(60, 18)).toEqual({ verdict: 'busy', deltaMinutes: 42 });
    expect(compareToTypical(18, 60)).toEqual({ verdict: 'quiet', deltaMinutes: 42 });
  });
});

describe('typicalSpread', () => {
  it('reports the middle bulk, not the day’s extremes', () => {
    // A 4 am ghost town and the evening peak are both real hours and neither
    // is typical; quoting min–max would describe a range nobody experiences.
    const day = cells(0, 2, 4, 10, 12, 20, 25, 30, 35, 40, 60, 90);
    const spread = typicalSpread(day)!;
    expect(spread.low).toBeGreaterThan(0);
    expect(spread.high).toBeLessThan(90);
    expect(spread.low).toBeLessThan(spread.high);
  });

  it('is null with too little history to have quartiles at all', () => {
    expect(typicalSpread(cells(10, 20, 30))).toBeNull();
  });

  it('is null when every hour is the same — a "range" of one number is not one', () => {
    expect(typicalSpread(cells(20, 20, 20, 20, 20, 20))).toBeNull();
  });
});
