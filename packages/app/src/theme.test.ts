import { describe, expect, it } from 'vitest';
import {
  color,
  radius,
  status,
  tightLineHeightFor,
  waitColor,
  waitSeverityWord,
  waitStatus,
  waitTextColor,
} from './theme';
import { AA, contrastRatio } from './contrast.test-helpers';

describe('wait severity thresholds', () => {
  it('buckets under 20 / 20–60 inclusive / over 60, per the spec', () => {
    expect(waitStatus(0)).toBe('clear');
    expect(waitStatus(19)).toBe('clear');
    expect(waitStatus(20)).toBe('moderate');
    expect(waitStatus(60)).toBe('moderate');
    expect(waitStatus(61)).toBe('heavy');
  });

  it('the word, the dot and the text ink never disagree about a wait', () => {
    for (const m of [0, 19, 20, 60, 61, 180]) {
      const tone = waitStatus(m);
      expect(waitSeverityWord(m).toLowerCase()).toBe(tone);
      expect(waitColor(m)).toBe(status[tone].dot);
      expect(waitTextColor(m)).toBe(status[tone].text);
    }
  });
});

describe('tightLineHeightFor', () => {
  it('on iOS, raises a tight box to the natural height and gives the difference back', () => {
    // The fix for digits clipped at the top on device: TextKit takes the whole
    // deficit off the top when lineHeight < natural. Footprint stays 48.
    const s = tightLineHeightFor('ios', 48, 48);
    expect(s).toEqual({ lineHeight: 72, marginVertical: -12 });
    expect(s.lineHeight + 2 * (s.marginVertical ?? 0)).toBe(48);
  });

  it('leaves a box at or above the natural height alone on iOS', () => {
    expect(tightLineHeightFor('ios', 12, 20)).toEqual({ lineHeight: 20 });
  });

  it('leaves every box alone off iOS', () => {
    expect(tightLineHeightFor('web', 48, 48)).toEqual({ lineHeight: 48 });
    expect(tightLineHeightFor('android', 26, 30)).toEqual({ lineHeight: 30 });
  });
});

describe('radius', () => {
  it('every semantic alias is one of the four v2 radii', () => {
    const four = [radius.sm, radius.md, radius.lg, radius.pill];
    expect(four).toEqual([12, 16, 24, 999]);
    for (const alias of [radius.card, radius.button, radius.banner, radius.hero]) {
      expect(four).toContain(alias);
    }
  });
});

/**
 * Every text/ground pair the app actually uses, at WCAG AA. These are the
 * disclosures — ages, "approx", attribution, the reason a row has no number —
 * read in a car in Rio Grande Valley sun, so a failing pair is a failed
 * disclosure, not a styling nit.
 */
describe('WCAG AA contrast', () => {
  const pairs: readonly [string, string, string][] = [
    ['ink on mist', color.navy, color.mist],
    ['secondary ink on white', color.muted, color.surface],
    ['secondary ink on mist', color.muted, color.mist],
    ['clear text on white', status.clear.text, color.surface],
    ['moderate text on white', status.moderate.text, color.surface],
    ['heavy text on white', status.heavy.text, color.surface],
    ['clear ink on its tint', status.clear.ink, status.clear.tint],
    ['moderate ink on its tint', status.moderate.ink, status.moderate.tint],
    ['heavy ink on its tint', status.heavy.ink, status.heavy.tint],
    ['secondary on navy', color.mutedOnDark, color.navy],
    ['cobalt-light on cobalt', color.cobaltLight, color.cobalt],
    ['white on cobalt', color.surface, color.cobalt],
    ['info ink on info tint', color.infoInk, color.infoTint],
    // Plan's recommendation card: a green tint, so the white-card text inks
    // do not apply — its sub-line takes the tint's own ink, its numbers navy.
    ['rec card sub-line', status.clear.ink, status.clear.tint],
    ['rec card numbers', color.navy, status.clear.tint],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name} ≥ 4.5:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    });
  }

  it('the status TEXT inks are for white only — two fail on a green tint', () => {
    // Why the rec card does not use them. If a tint ever becomes their
    // ground, this documents what goes wrong.
    expect(contrastRatio(status.moderate.text, status.clear.tint)).toBeLessThan(AA);
    expect(contrastRatio(status.heavy.text, status.clear.tint)).toBeLessThan(AA);
  });

  it('secondary ink is not the retired v1 #7E8DB5', () => {
    // CLAUDE.md: re-syncing theme.ts from a design doc must not silently
    // restore it. It survives only as inkMuted, for decoration and disabled.
    expect(color.muted.toUpperCase()).not.toBe('#7E8DB5');
    expect(color.inkMuted.toUpperCase()).toBe('#7E8DB5');
    expect(contrastRatio(color.inkMuted, color.surface)).toBeLessThan(AA);
  });
});
