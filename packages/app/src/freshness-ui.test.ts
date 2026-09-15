import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatClock,
  freshnessBadge,
  numberInk,
  numberInkOnCobalt,
  spokenFreshness,
} from './freshness-ui';
import { color, status } from './theme';
import { AA, contrastRatio } from './contrast.test-helpers';

describe('freshnessBadge', () => {
  it('shows nothing while live, and distinct verdicts once not', () => {
    expect(freshnessBadge('live')).toBeNull();
    expect(freshnessBadge('estimated')).toMatchObject({ label: 'ESTIMATED', bg: status.moderate.tint });
    // Red, not amber: a stale figure must never read as merely approximate.
    expect(freshnessBadge('stale')).toMatchObject({ label: 'STALE', bg: status.heavy.tint });
  });
});

describe('number inks', () => {
  it('steps a non-live number down on light surfaces', () => {
    expect(numberInk('live')).toBe(color.navy);
    expect(numberInk('estimated')).toBe(color.muted);
    expect(numberInk('stale')).toBe(color.muted);
  });

  it('steps down on cobalt to an ink that still reads there', () => {
    expect(numberInkOnCobalt('live')).toBe(color.surface);
    expect(numberInkOnCobalt('stale')).toBe(color.cobaltLight);
    // The trap this guards: `muted` is 1.5:1 on the hero.
    expect(contrastRatio(numberInkOnCobalt('stale'), color.cobalt)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(color.muted, color.cobalt)).toBeLessThan(2);
  });
});

describe('spokenFreshness', () => {
  it('says "not live" for every verdict a sighted user sees a badge for', () => {
    expect(spokenFreshness('live')).toBe('live');
    expect(spokenFreshness('estimated')).toContain('not live');
    expect(spokenFreshness('stale')).toContain('not live');
  });
});

describe('formatAge', () => {
  it('is the shared, tested implementation', () => {
    expect(formatAge(null)).toBe('age unknown');
    expect(formatAge(59)).toBe('just now');
    expect(formatAge(60)).toBe('1 min ago');
    expect(formatAge(3570)).toBe('1 hr ago');
  });
});

describe('formatClock', () => {
  it('reads a stamp in the crossing’s own zone', () => {
    // 08:30Z on the spring-forward Sunday is 3:30 am CDT.
    expect(formatClock('2026-03-08T08:30:00Z', 'America/Chicago')).toBe('3:30 AM');
  });

  it('prints a dash, never "Invalid Date", for a bad stamp or zone', () => {
    expect(formatClock('garbage')).toBe('—');
    expect(formatClock('2026-03-08T08:30:00Z', 'Not/AZone')).toBe('—');
  });
});
