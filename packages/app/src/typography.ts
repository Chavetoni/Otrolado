import { Platform } from 'react-native';
import { font, tightLineHeightFor } from './theme';

/**
 * The seven type tokens (v2 §03), as RN text styles.
 *
 * Split from `theme.ts` because it needs `Platform`, and `theme.ts` must stay
 * free of `react-native` imports so the unit tests can load it. `Platform.OS`
 * is fixed for the life of a bundle, so computing the tokens at import is safe
 * on every platform.
 *
 * Size / line / weight / tracking exactly as the spec states them; tracking is
 * converted from em to points here so no screen does that arithmetic itself.
 * Units are 500 weight in `muted`, one step down from their number — "14 min"
 * in hero positions, "14m" in dense lists. Colour is applied by the caller:
 * the same token is navy on a card and white on the hero.
 *
 * Never spread a display token and then override `lineHeight`: on iOS the
 * token carries a negative margin that only makes sense with its own line
 * height (see `tightLineHeightFor`).
 */
export function tightLineHeight(fontSize: number, lineHeight: number) {
  return tightLineHeightFor(Platform.OS, fontSize, lineHeight);
}

export const type = {
  /** 48/48/700, −0.04em. The wait or total that IS the screen. */
  waitHero: { fontSize: 48, fontFamily: font.bold, letterSpacing: -1.92, ...tightLineHeight(48, 48) },
  /** 26/30/700, −0.02em. A row's number. */
  metric: { fontSize: 26, fontFamily: font.bold, letterSpacing: -0.52, ...tightLineHeight(26, 30) },
  /** 24/29/700, −0.02em. */
  screenTitle: { fontSize: 24, fontFamily: font.bold, letterSpacing: -0.48, ...tightLineHeight(24, 29) },
  /** 16/22/600. */
  cardTitle: { fontSize: 16, lineHeight: 22, fontFamily: font.semibold },
  /** 14/21/400. */
  body: { fontSize: 14, lineHeight: 21, fontFamily: font.regular },
  /** 12/17/500. Sub-lines, ages, counts. */
  metadata: { fontSize: 12, lineHeight: 17, fontFamily: font.medium },
  /** 11/16/600, +0.1em, uppercase. Section labels. */
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: font.semibold,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
} as const;

/**
 * Captions and disclosures — the metadata size at regular weight. v2 sets its
 * own explanatory captions at 12/400 (the "Under 10 minutes old…" lines), and
 * this is the text that carries every caveat in the app, so it is never
 * smaller than this.
 */
export const caption = { ...type.metadata, fontFamily: font.regular } as const;
