import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, formatAge, freshnessOf, type FreshnessInput } from './freshness.js';

/**
 * The freshness policy deviates deliberately from the integration spec: the
 * spec's "feed age > 30 min -> ESTIMATED", applied to CBP's hour-granular
 * `update_time`, turns the badge into a clock hand that fires for every port
 * for half of every hour. The verdict instead rests on three precise signals:
 * CBP's explicit 'update_pending', our own ingest age, and this reading's own
 * age — and on nothing named feedAge. These tests are what stops someone
 * "fixing" the code back to the spec's version.
 */

function input(overrides: Partial<FreshnessInput>): FreshnessInput {
  return {
    status: 'open',
    ingestAgeSeconds: 0,
    readingAgeSeconds: 0,
    feedAgeSeconds: 0,
    ...overrides,
  };
}

const { estimatedAfterS, staleAfterS } = DEFAULT_THRESHOLDS;

describe('DEFAULT_THRESHOLDS', () => {
  it('are 30 min to ESTIMATED, 45 min to STALE', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ estimatedAfterS: 30 * 60, staleAfterS: 45 * 60 });
  });
});

describe('freshnessOf: feedAgeSeconds is transparency-only', () => {
  it('a 55-minute feed age with a fresh ingest still reads live', () => {
    // The spec's rule applied to feedAgeSeconds would call this ESTIMATED.
    // It is not: feed age sweeps 0 -> ~59 min every hour by construction, so
    // no input named feedAge may ever move the verdict.
    expect(freshnessOf(input({ feedAgeSeconds: 55 * 60 }))).toBe('live');
  });

  it('the verdict is identical across any feed age, including unknown', () => {
    for (const feedAgeSeconds of [0, 55 * 60, 6 * 60 * 60, null]) {
      expect(freshnessOf(input({ feedAgeSeconds }))).toBe('live');
      expect(freshnessOf(input({ feedAgeSeconds, ingestAgeSeconds: staleAfterS + 1 }))).toBe('stale');
    }
  });
});

describe('freshnessOf: worse-of-two-ages matrix', () => {
  it('both fresh -> live', () => {
    expect(freshnessOf(input({}))).toBe('live');
  });

  it('each axis independently degrades to estimated', () => {
    // A global ingest outage and a single crossing silently dropped from an
    // otherwise-healthy document degrade on the same schedule.
    expect(freshnessOf(input({ ingestAgeSeconds: estimatedAfterS + 1 }))).toBe('estimated');
    expect(freshnessOf(input({ readingAgeSeconds: estimatedAfterS + 1 }))).toBe('estimated');
  });

  it('each axis independently degrades to stale', () => {
    expect(freshnessOf(input({ ingestAgeSeconds: staleAfterS + 1 }))).toBe('stale');
    expect(freshnessOf(input({ readingAgeSeconds: staleAfterS + 1 }))).toBe('stale');
  });

  it('the worse axis wins in both directions', () => {
    expect(freshnessOf(input({
      ingestAgeSeconds: estimatedAfterS + 1,
      readingAgeSeconds: staleAfterS + 1,
    }))).toBe('stale');
    expect(freshnessOf(input({
      ingestAgeSeconds: staleAfterS + 1,
      readingAgeSeconds: estimatedAfterS + 1,
    }))).toBe('stale');
    expect(freshnessOf(input({ ingestAgeSeconds: estimatedAfterS + 1, readingAgeSeconds: 0 }))).toBe('estimated');
    expect(freshnessOf(input({ ingestAgeSeconds: 0, readingAgeSeconds: estimatedAfterS + 1 }))).toBe('estimated');
  });

  it('an unknown age on either axis is stale, not trusted', () => {
    expect(freshnessOf(input({ ingestAgeSeconds: null }))).toBe('stale');
    expect(freshnessOf(input({ readingAgeSeconds: null }))).toBe('stale');
    expect(freshnessOf(input({ ingestAgeSeconds: null, readingAgeSeconds: null }))).toBe('stale');
  });
});

describe('freshnessOf: update_pending', () => {
  it('outranks fresh clocks — CBP saying "no current figure" beats our arithmetic', () => {
    expect(freshnessOf(input({ status: 'update_pending' }))).toBe('estimated');
  });

  it('short-circuits before the age verdicts entirely', () => {
    // Even with both ages past stale (or unknown), an update_pending reading
    // reads ESTIMATED: the status is CBP's own explicit signal about this
    // figure, and it is the answer, not one more input to the age math.
    expect(freshnessOf(input({
      status: 'update_pending',
      ingestAgeSeconds: staleAfterS + 1,
      readingAgeSeconds: null,
    }))).toBe('estimated');
  });

  it('other non-open statuses do not affect the verdict', () => {
    expect(freshnessOf(input({ status: 'closed' }))).toBe('live');
    expect(freshnessOf(input({ status: 'not_available' }))).toBe('live');
  });
});

describe('freshnessOf: threshold boundaries', () => {
  it('exactly-at a threshold keeps the better verdict; just-over crosses', () => {
    expect(freshnessOf(input({ ingestAgeSeconds: estimatedAfterS }))).toBe('live');
    expect(freshnessOf(input({ ingestAgeSeconds: estimatedAfterS + 1 }))).toBe('estimated');
    expect(freshnessOf(input({ ingestAgeSeconds: staleAfterS }))).toBe('estimated');
    expect(freshnessOf(input({ ingestAgeSeconds: staleAfterS + 1 }))).toBe('stale');
    expect(freshnessOf(input({ readingAgeSeconds: estimatedAfterS }))).toBe('live');
    expect(freshnessOf(input({ readingAgeSeconds: staleAfterS }))).toBe('estimated');
  });

  it('honours custom thresholds', () => {
    const tight = { estimatedAfterS: 60, staleAfterS: 120 };
    expect(freshnessOf(input({ ingestAgeSeconds: 61 }), tight)).toBe('estimated');
    expect(freshnessOf(input({ readingAgeSeconds: 121 }), tight)).toBe('stale');
  });
});

describe('formatAge', () => {
  it('tiers: unknown / just now / minutes / hours', () => {
    expect(formatAge(null)).toBe('age unknown');
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(59)).toBe('just now');
    expect(formatAge(60)).toBe('1 min ago');
    expect(formatAge(12 * 60)).toBe('12 min ago');
    expect(formatAge(3600)).toBe('1 hr ago');
    expect(formatAge(2 * 3600)).toBe('2 hrs ago');
  });

  it('rounds rather than truncates', () => {
    expect(formatAge(89)).toBe('1 min ago');   // 1.48 min
    expect(formatAge(90)).toBe('2 min ago');   // 1.5 min rounds up
    expect(formatAge(3570)).toBe('1 hr ago');  // 59.5 min rounds to 60 -> hours tier
    expect(formatAge(90 * 60)).toBe('2 hrs ago'); // 1.5 hr rounds up
  });
});
