import { describe, expect, it } from 'vitest';
import {
  radius,
  themes,
  tightLineHeightFor,
  waitColor,
  waitSeverityWord,
  waitStatus,
  waitTextColor,
  type Scheme,
  type Theme,
} from './theme';
import { AA, contrastRatio } from './contrast.test-helpers';

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

describe('wait severity thresholds', () => {
  it('buckets under 20 / 20–60 inclusive / over 60, per the spec', () => {
    expect(waitStatus(0)).toBe('clear');
    expect(waitStatus(19)).toBe('clear');
    expect(waitStatus(20)).toBe('moderate');
    expect(waitStatus(60)).toBe('moderate');
    expect(waitStatus(61)).toBe('heavy');
  });

  it('the word, the dot and the text ink never disagree about a wait, in either mode', () => {
    for (const scheme of SCHEMES) {
      const { status } = themes[scheme];
      for (const m of [0, 19, 20, 60, 61, 180]) {
        const tone = waitStatus(m);
        expect(waitSeverityWord(m).toLowerCase()).toBe(tone);
        expect(waitColor(m)).toBe(status[tone].dot);
        expect(waitTextColor(m, status)).toBe(status[tone].text);
      }
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
 * Every text/ground pair the app actually uses, at WCAG AA, IN BOTH MODES.
 * These are the disclosures — ages, "approx", attribution, the reason a row
 * has no number — read in a car in Rio Grande Valley sun (or a queue at
 * 11pm), so a failing pair is a failed disclosure, not a styling nit.
 */
function textPairs({ color, status }: Theme): readonly [string, string, string][] {
  return [
    // The ladder: primary and secondary ink on every surface they sit on.
    ['ink on page', color.ink, color.page],
    ['ink on surface', color.ink, color.surface],
    ['ink on inset', color.ink, color.inset],
    ['hero ink on page', color.inkHero, color.page],
    ['hero ink on surface', color.inkHero, color.surface],
    ['secondary ink on page', color.muted, color.page],
    ['secondary ink on surface', color.muted, color.surface],
    ['secondary ink on inset', color.muted, color.inset],
    // Accent as text.
    ['accent on page', color.accent, color.page],
    ['accent on surface', color.accent, color.surface],
    ['accent pressed on surface', color.accentPressed, color.surface],
    ['text on a small accent fill', color.onAccent, color.accent],
    // Status as text on a card, and on its own tint.
    ['clear text on surface', status.clear.text, color.surface],
    ['moderate text on surface', status.moderate.text, color.surface],
    ['heavy text on surface', status.heavy.text, color.surface],
    ['clear ink on its tint', status.clear.ink, status.clear.tint],
    ['moderate ink on its tint', status.moderate.ink, status.moderate.tint],
    ['heavy ink on its tint', status.heavy.ink, status.heavy.tint],
    // On navy and on cobalt — the same values in both modes.
    ['ink on navy', color.inkOnDark, color.navy],
    ['secondary on navy', color.mutedOnDark, color.navy],
    ['cobalt-light on cobalt', color.cobaltLight, color.cobalt],
    ['white on cobalt', color.onCobalt, color.cobalt],
    ['white on cobalt pressed', color.onCobalt, color.cobaltPress],
    ['navy on the inverse button', color.navy, color.onCobalt],
    ['navy on the inverse button pressed', color.navy, color.inverseFillPressed],
    // Selected and notice fills.
    ['text on a selected fill', color.onSelected, color.selectedFill],
    ['text on a selected fill pressed', color.onSelected, color.selectedFillPressed],
    ['info ink on info tint', color.infoInk, color.infoTint],
    ['info accent on info tint', color.infoAccent, color.infoTint],
    ['info accent on an icon tile', color.infoAccent, color.iconTile],
    ['ink on an icon tile', color.ink, color.iconTile],
    ['ink on the segment pill', color.ink, color.segmentPill],
    // Plan's recommendation card: a green tint, so the card text inks do not
    // apply — its sub-line takes the tint's own ink, its numbers full ink.
    ['rec card sub-line', status.clear.ink, status.clear.tint],
    ['rec card numbers', color.ink, status.clear.tint],
    ['rec card accent', color.accent, status.clear.tint],
  ];
}

describe.each(SCHEMES)('WCAG AA contrast — %s', (scheme) => {
  const t = themes[scheme];
  for (const [name, fg, bg] of textPairs(t)) {
    it(`${name} ≥ 4.5:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    });
  }


  it('disabled ink is under AA on purpose — it must never carry information', () => {
    expect(contrastRatio(t.color.inkMuted, t.color.surface)).toBeLessThan(AA);
    expect(contrastRatio(t.color.inkMuted, t.color.surface)).toBeGreaterThan(2.5);
  });

  it('disabled ink on navy stays under AA and reads dimmer than the inactive chips', () => {
    const { color } = t;
    expect(contrastRatio(color.inkMutedOnDark, color.navy)).toBeLessThan(AA);
    expect(contrastRatio(color.inkMutedOnDark, color.navy)).toBeGreaterThan(2.5);
    expect(contrastRatio(color.inkMutedOnDark, color.navy)).toBeLessThan(
      contrastRatio(color.mutedOnDark, color.navy),
    );
  });

  it('the hero pills keep the LIGHT status tints on cobalt, in both modes', () => {
    // index.tsx HeroStatusPill reads themes.light for its capsules: the dark
    // tints are 1.6–1.95:1 on cobalt and the pill vanished.
    const { status } = themes.light;
    for (const tone of ['clear', 'moderate', 'heavy'] as const) {
      expect(contrastRatio(status[tone].tint, t.color.cobalt)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(status[tone].ink, status[tone].tint)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('lane-chip dots on the navy header read at 3:1', () => {
    expect(contrastRatio(t.color.mutedOnDark, t.color.navy)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t.color.onCobalt, t.color.cobalt)).toBeGreaterThanOrEqual(3);
  });

  it('`muted` is never used on cobalt — the trap numberInkOnCobalt guards', () => {
    expect(contrastRatio(t.color.muted, t.color.cobalt)).toBeLessThan(3);
  });

  /**
   * Fills that must be SEEN against their ground (WCAG 1.4.11, 3:1): the ON
   * toggle track against a card, the white knob on it, the selected fill,
   * a pin's ink on the no-wait grey.
   */
  it('control fills clear 3:1 against the card', () => {
    const { color } = t;
    expect(contrastRatio(color.switchOn, color.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color.onCobalt, color.switchOn)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color.selectedFill, color.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color.accent, color.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color.ink, color.lineStrong)).toBeGreaterThanOrEqual(AA);
  });

  it('the surface ladder is a ladder', () => {
    // Rule 02, elevation is lighter: on dark, page → surface → inset each
    // step LIGHTER. On light the card is the lightest thing on the page and
    // a well inside it recesses back toward the page. Either way a card is
    // never the same colour as the page it sits on.
    const { color } = t;
    const lum = (hex: string) => contrastRatio(hex, '#000000');
    expect(color.surface).not.toBe(color.page);
    if (scheme === 'dark') {
      expect(lum(color.page)).toBeLessThan(lum(color.surface));
      expect(lum(color.surface)).toBeLessThan(lum(color.inset));
    } else {
      expect(lum(color.page)).toBeLessThan(lum(color.surface));
      expect(lum(color.inset)).toBeLessThan(lum(color.surface));
    }
  });
});

describe('the status TEXT inks are for cards only', () => {
  it('two fail on a green tint in light — why the rec card uses the tint ink', () => {
    // If a tint ever becomes their ground, this documents what goes wrong.
    const { status } = themes.light;
    expect(contrastRatio(status.moderate.text, status.clear.tint)).toBeLessThan(AA);
    expect(contrastRatio(status.heavy.text, status.clear.tint)).toBeLessThan(AA);
  });
});

describe('what does NOT flip between modes', () => {
  const l = themes.light;
  const d = themes.dark;

  it('status dots are identical, so a pin means the same thing in either screenshot', () => {
    for (const tone of ['clear', 'moderate', 'heavy'] as const) {
      expect(d.status[tone].dot).toBe(l.status[tone].dot);
    }
  });

  it('cobalt stays the primary fill, with white on top', () => {
    for (const k of ['cobalt', 'cobaltDeep', 'cobaltPress', 'cobaltLight', 'cobaltOutline', 'onCobalt'] as const) {
      expect(d.color[k]).toBe(l.color[k]);
    }
  });

  it('but cobalt is never text on dark — the accent lifts', () => {
    expect(contrastRatio(l.color.cobalt, d.color.surface)).toBeLessThan(3);
    expect(d.color.accent).not.toBe(d.color.cobalt);
    expect(l.color.accent).toBe(l.color.cobalt);
  });

  it('the navy surface and what sits on it are the same in both modes', () => {
    for (const k of ['navy', 'navyTint', 'inkOnDark', 'mutedOnDark'] as const) {
      expect(d.color[k]).toBe(l.color[k]);
    }
    // 1a: today's navy card IS the dark raised surface.
    expect(d.color.surface).toBe(l.color.navy);
  });

  it('white body copy is never on a dark field — the ink is the spec token', () => {
    expect(d.color.ink.toUpperCase()).toBe('#EEF2FB');
    expect(d.color.inkHero.toUpperCase()).toBe('#FFFFFF');
    expect(d.color.inkOnDark.toUpperCase()).toBe('#EEF2FB');
  });
});

describe('secondary ink', () => {
  it('is not the retired v1 #7E8DB5 in either mode', () => {
    // CLAUDE.md: re-syncing theme.ts from a design doc must not silently
    // restore it. It survives only as light's inkMuted, for decoration and
    // disabled.
    for (const scheme of SCHEMES) {
      expect(themes[scheme].color.muted.toUpperCase()).not.toBe('#7E8DB5');
    }
    expect(themes.light.color.inkMuted.toUpperCase()).toBe('#7E8DB5');
  });

  it('matches the dark proposal exactly: #8FA0C6 on #0E1730 / #16234A', () => {
    const { color } = themes.dark;
    expect(color.muted.toUpperCase()).toBe('#8FA0C6');
    expect(color.page.toUpperCase()).toBe('#0E1730');
    expect(color.surface.toUpperCase()).toBe('#16234A');
  });
});
