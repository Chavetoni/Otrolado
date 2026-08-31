import { describe, expect, it } from 'vitest';
import { localParts, zonedToUtc } from './tz.js';

/**
 * zonedToUtc's two-pass DST resolution. The first offset lookup can land on
 * the wrong side of a transition; the second pass corrects it. These pin both
 * sides of both 2026 transitions in America/Chicago (spring forward Mar 8,
 * fall back Nov 1) so a "simplification" to a single pass or a fixed offset
 * table fails here instead of shifting an hour of archived history.
 */
describe('zonedToUtc', () => {
  it('resolves a plain summer wall clock (CDT, UTC-5)', () => {
    expect(zonedToUtc(2026, 8, 30, 22, 41, 44, 'America/Chicago').toISOString())
      .toBe('2026-08-31T03:41:44.000Z');
  });

  it('resolves a plain winter wall clock (CST, UTC-6)', () => {
    expect(zonedToUtc(2026, 1, 15, 12, 0, 0, 'America/Chicago').toISOString())
      .toBe('2026-01-15T18:00:00.000Z');
  });

  it('spring forward: last second of standard time is UTC-6', () => {
    expect(zonedToUtc(2026, 3, 8, 1, 59, 59, 'America/Chicago').toISOString())
      .toBe('2026-03-08T07:59:59.000Z');
  });

  it('spring forward: first hour of daylight time is UTC-5', () => {
    expect(zonedToUtc(2026, 3, 8, 3, 0, 0, 'America/Chicago').toISOString())
      .toBe('2026-03-08T08:00:00.000Z');
  });

  it('fall back: last hour of daylight time is UTC-5', () => {
    expect(zonedToUtc(2026, 11, 1, 0, 59, 0, 'America/Chicago').toISOString())
      .toBe('2026-11-01T05:59:00.000Z');
  });

  it('fall back: after the transition is UTC-6', () => {
    expect(zonedToUtc(2026, 11, 1, 3, 0, 0, 'America/Chicago').toISOString())
      .toBe('2026-11-01T09:00:00.000Z');
  });

  it('fall back: the repeated 1:30 resolves to the first (daylight) occurrence', () => {
    // 1:30 happens twice on Nov 1. The two-pass algorithm deterministically
    // lands on the pre-transition (CDT) instant; pinned so a rewrite that
    // flips it to CST shows up as a diff rather than a silent hour shift.
    expect(zonedToUtc(2026, 11, 1, 1, 30, 0, 'America/Chicago').toISOString())
      .toBe('2026-11-01T06:30:00.000Z');
  });

  it('the Arizona hazard: Denver and Phoenix disagree by 1h in summer', () => {
    // CBP expresses Arizona crossings in Mountain Daylight, so America/Denver
    // is the zone that parses them correctly. America/Phoenix — geographically
    // right — shifts the same wall clock by an hour. See ingest/infer-tz.ts.
    expect(zonedToUtc(2026, 8, 30, 21, 41, 44, 'America/Denver').toISOString())
      .toBe('2026-08-31T03:41:44.000Z');
    expect(zonedToUtc(2026, 8, 30, 21, 41, 44, 'America/Phoenix').toISOString())
      .toBe('2026-08-31T04:41:44.000Z');
  });
});

describe('localParts', () => {
  it('returns the wall-clock date in the zone, not the UTC date', () => {
    // 03:41Z on Aug 31 is still Aug 30 everywhere on the US-Mexico border.
    const at = new Date('2026-08-31T03:41:44Z');
    expect(localParts(at, 'America/Chicago')).toEqual({ y: 2026, mo: 8, d: 30 });
    expect(localParts(at, 'America/New_York')).toEqual({ y: 2026, mo: 8, d: 30 });
  });

  it('disagrees across zones when the instant straddles local midnight', () => {
    const at = new Date('2026-08-31T05:30:00Z');
    expect(localParts(at, 'America/Chicago')).toEqual({ y: 2026, mo: 8, d: 31 });
    expect(localParts(at, 'America/Los_Angeles')).toEqual({ y: 2026, mo: 8, d: 30 });
  });
});
