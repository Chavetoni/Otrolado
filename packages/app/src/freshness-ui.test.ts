import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatClock,
  freshnessBadge,
  numberInk,
  numberInkOnCobalt,
  spokenFreshness,
} from './freshness-ui';
import { themes } from './theme';
import { AA, contrastRatio } from './contrast.test-helpers';

describe.each(['light', 'dark'] as const)('freshnessBadge — %s', (scheme) => {
  const t = themes[scheme];
  it('shows nothing while live, and distinct verdicts once not', () => {
    expect(freshnessBadge('live', t)).toBeNull();
    expect(freshnessBadge('estimated', t)).toMatchObject({ label: 'ESTIMATED', bg: t.status.moderate.tint });
    // Red, not amber: a stale figure must never read as merely approximate.
    expect(freshnessBadge('stale', t)).toMatchObject({ label: 'STALE', bg: t.status.heavy.tint });
    expect(freshnessBadge('stale', t)!.bg).not.toBe(freshnessBadge('estimated', t)!.bg);
  });

  it('the badge reads on its own tint', () => {
    for (const f of ['estimated', 'stale'] as const) {
      const b = freshnessBadge(f, t)!;
      expect(contrastRatio(b.fg, b.bg)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe.each(['light', 'dark'] as const)('number inks — %s', (scheme) => {
  const t = themes[scheme];
  const { color } = t;

  it('steps a non-live number down on the page and cards', () => {
    expect(numberInk('live', t)).toBe(color.inkHero);
    expect(numberInk('estimated', t)).toBe(color.muted);
    expect(numberInk('stale', t)).toBe(color.muted);
    // Both inks must read on a card; the step-down is a change, not a fade.
    expect(contrastRatio(numberInk('stale', t), color.surface)).toBeGreaterThanOrEqual(AA);
    expect(numberInk('stale', t)).not.toBe(numberInk('live', t));
  });

  it('steps down on cobalt to an ink that still reads there', () => {
    expect(numberInkOnCobalt('live', t)).toBe(color.onCobalt);
    expect(numberInkOnCobalt('stale', t)).toBe(color.cobaltLight);
    // The trap this guards: `muted` is 1.5:1 on the hero.
    expect(contrastRatio(numberInkOnCobalt('stale', t), color.cobalt)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(color.muted, color.cobalt)).toBeLessThan(3);
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
