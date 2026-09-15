/**
 * Design tokens, from the Otrolado design system v2.0
 * ("design/Otrolado Design System v2.dc.html", §11 tokens.json). v2 keeps v1's
 * opinion — navy structure, one cobalt, cool ground, no shadows, Poppins — and
 * tightens the system: a legible secondary ink, status text separate from
 * status dots, four radii, seven type tokens, a locked icon family, and the
 * production states (pressed, disabled, loading, five freshness states).
 *
 * Fidelity is the contract here — these values are final, not suggestions.
 * Nothing in the app should hardcode a colour or size that isn't in here.
 *
 * THIS MODULE HAS NO IMPORTS, on purpose. It is pure data and pure functions,
 * so the unit tests can load it — and the severity thresholds and contrast
 * guarantees below are exactly the things worth testing. Anything that needs
 * `react-native` (the Platform-dependent type tokens) lives in `typography.ts`.
 *
 * Load-bearing rules from the spec:
 *  - One cobalt per viewport. Cobalt is a spotlight, not wallpaper: the single
 *    most tappable thing gets it; everything else is navy, white, or mist.
 *  - Status colour outranks brand colour, and is never the ONLY channel: every
 *    severity carries a word or an icon beside the colour ("95 min · heavy",
 *    never a red dot alone).
 *  - No shadows on anything that sits IN the page. Separation comes from the
 *    `line` hairline and surface contrast. Sheets and menus may use one.
 *  - Disabled is never opacity — fill drops to `line`, text to `inkMuted`.
 */
export const color = {
  /** Primary ink ("ink" in v2): headings, numbers, body, dark surfaces. */
  navy: '#16234A',
  /** Hover/pressed on navy fills. */
  navyTint: '#24345C',

  /** The one accent. Primary buttons, hero surface, active states. */
  cobalt: '#1B45C4',
  /** Hover on cobalt. */
  cobaltDeep: '#1638A5',
  /** Pressed on cobalt — one step darker than hover (v2 control states). */
  cobaltPress: '#122F8C',
  /** Labels and secondary text ON cobalt or navy. */
  cobaltLight: '#B9CCFF',
  /** Borders of secondary buttons sitting on cobalt. */
  cobaltOutline: '#5878DB',
  /**
   * Translucent white fill on cobalt — the "selected" state of a secondary
   * button on the hero. From the brand sheet's Replay chip.
   */
  surfaceOnCobalt: 'rgba(255,255,255,0.14)',

  /** App background. */
  mist: '#EEF2FB',
  /** Hairlines, dividers, empty tracks, skeletons. */
  line: '#DFE5F3',
  /** Recorded chart bars, inactive controls needing more weight, axis lines. */
  lineStrong: '#C9D3E9',
  /**
   * `ink-secondary` — every label, caption and sub-line that carries
   * information. 5.2:1 on white, 4.6:1 on mist.
   *
   * History: v1 used #7E8DB5 here, which measured 2.9:1 on mist and 3.3:1 on
   * white — under WCAG AA at any size — while carrying every caveat in the app
   * (ages, "approx", attribution, the reason a row has no total) at 11px on a
   * screen used in a car in Rio Grande Valley sun. The app darkened it to
   * #5B6B95 on its own; v2 fixes the spec the same way and this is now the
   * spec's own value. #7E8DB5 survives as `inkMuted`, demoted to disabled and
   * decorative use only — re-syncing from a design doc must never put it
   * back on information. `theme.test.ts` pins this.
   */
  muted: '#5E6D90',
  /**
   * `ink-muted` — disabled text and decoration ONLY, never information
   * (3.3:1 on white). The em dash of an unavailable wait; a disabled button's
   * label; the tab of a lane a crossing does not have.
   */
  inkMuted: '#7E8DB5',
  /** Secondary text on navy (`ink-sec-on-dark`, 5.8:1). */
  mutedOnDark: '#8FA0C6',
  /**
   * Outline of inactive chips on navy. From the brand sheet's lockup divider,
   * not v2 — v2's hairline on navy is `navyTint`, which at 1.2:1 against navy
   * is too faint to read as the edge of a tappable control.
   */
  lineOnDark: '#2C3F6E',

  /** Notice banner background / text. */
  infoTint: '#E3EBFD',
  infoInk: '#15307A',

  /** Cards, tab bar, sheets. */
  surface: '#FFFFFF',

  /**
   * Forecast bars: outlined in this, filled with `forecastFill`, never solid —
   * a prediction must never look like a measurement (§08). Unused until
   * /v1/forecast exists; reserved here so the chart can't invent its own.
   */
  forecastLine: '#7EA0F0',
  forecastFill: '#F4F7FF',
} as const;

/**
 * Status — independent of brand, never restyled. Thresholds unchanged from v1.
 *
 * v2 splits each status into FOUR tokens, because v1 reused the vivid dot
 * colour as 11px text and the amber failed contrast outright (2.6:1):
 *  - `dot`  — the dot, the status bar, the map pin. Stays vivid.
 *  - `text` — the same status as TEXT on white. Darkened to pass AA at small
 *             sizes (5.3 / 5.0 / 4.9 : 1). Use it for a coloured number or
 *             word on a WHITE card only; on a tinted surface it can drop
 *             under 4.5:1, and `ink` is the pair for tints.
 *  - `tint` / `ink` — a status-tinted surface and the text that sits on it.
 */
export const status = {
  /** Under 20 min. */
  clear: { dot: '#1F8A5B', text: '#1A7A50', tint: '#E4F0EA', ink: '#1E5540' },
  /** 20 to 60 min, inclusive. */
  moderate: { dot: '#D9932A', text: '#9A6408', tint: '#FBF1D9', ink: '#5A430A' },
  /** Over 60 min. */
  heavy: { dot: '#C4462F', text: '#C4462F', tint: '#F8E5E1', ink: '#8A4433' },
} as const;

export type StatusTone = keyof typeof status;

/** Severity bucket for a wait in minutes, per the spec thresholds. */
export function waitStatus(minutes: number): StatusTone {
  if (minutes < 20) return 'clear';
  if (minutes <= 60) return 'moderate';
  return 'heavy';
}

/** Wait-minute colour for a dot, bar or pin. */
export function waitColor(minutes: number): string {
  return status[waitStatus(minutes)].dot;
}

/** Wait-minute colour for TEXT on a white surface — the AA-safe pair of `waitColor`. */
export function waitTextColor(minutes: number): string {
  return status[waitStatus(minutes)].text;
}

/**
 * The word that rides beside a severity colour, so colour is never the only
 * channel. Thresholds as the spec states them.
 */
export function waitSeverityWord(minutes: number): string {
  return { clear: 'Clear', moderate: 'Moderate', heavy: 'Heavy' }[waitStatus(minutes)];
}

/**
 * Four radii, no exceptions but the device frame (v2 §04). v1's 13/14/18/20/22
 * are deprecated. The semantic aliases below are REFERENCES to the four, so a
 * component can name what it is without inventing a fifth value.
 */
const RADIUS_SM = 12;
const RADIUS_MD = 16;
const RADIUS_LG = 24;

export const radius = {
  /** Compact controls, inline chips, icon tiles, chart bars at scale. */
  sm: RADIUS_SM,
  /** The default: buttons, inputs, crossing cards, banners. */
  md: RADIUS_MD,
  /** Hero surface, bottom sheets, doc panels. */
  lg: RADIUS_LG,
  /** Pills, toggles, status bars, booth meters. */
  pill: 999,

  card: RADIUS_MD,
  button: RADIUS_MD,
  banner: RADIUS_MD,
  hero: RADIUS_LG,
  /** Bar-chart bars: 6px TOP radius, square feet (§08). */
  bar: 6,
} as const;

/**
 * Space — 4pt grid. Gaps come from 4 · 8 · 12 · 16 · 20 · 24 only; v1's
 * 7 / 9 / 11 / 13 are gone.
 */
export const space = {
  /** Screen padding. */
  gutter: 20,
  /** Card padding. */
  cardPad: 16,
  /** Hero padding. */
  heroPad: 20,
  stackGap: 8,
  sectionGap: 16,
  /** Hit targets never below this. Buttons are 48; icon buttons 44×44 with a 24px glyph. */
  hitMin: 44,
  buttonHeight: 48,
  /**
   * Bottom clearance for scroll content above the tab bar. The bar is in
   * normal flow (not floating), so this is breathing room, not overlap
   * insurance — and the bar already pads itself by the safe-area inset, so
   * screens must NOT add `insets.bottom` on top or notched phones get ~34px
   * of dead space above the bar.
   */
  tabBarClearance: 24,
} as const;

/**
 * Motion, in ms. `press` is the scale(0.97) on a pressed control, `toggle` the
 * switch track, `gate` the launch arm's swing (cubic-bezier(.3,.9,.3,1)).
 * Under Reduce Motion nothing rotates or scales — things fade.
 */
export const motion = {
  press: 90,
  toggle: 180,
  gate: 450,
  /** Skeleton pulse. */
  pulse: 1400,
} as const;

/**
 * Poppins, weights 400/500/600/700 only — never 300, never italic.
 * `tabular` MUST be applied to every wait, drive, count and axis number —
 * without it the digits shift width as values change and the whole list
 * jitters on refresh. (The bundled fonts carry a `tnum` feature stock Poppins
 * lacks; see app/_layout.tsx.)
 */
export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * Largest Dynamic Type scale the display numbers may take. They sit in rows
 * that cannot wrap (the hero's "About 41 min total"), so unbounded scaling
 * pushes them out of their card; 1.3× still reads as a large-text setting.
 * Body text is left to scale freely.
 */
export const DISPLAY_MAX_FONT_SCALE = 1.3;

/**
 * Poppins' natural line height as a multiple of font size, from the font's own
 * hhea metrics (ascender 1050 + descender 350 + lineGap 100, per 1000 em) —
 * identical across the four weights.
 */
export const POPPINS_LINE_HEIGHT = 1.5;

/**
 * A display number set tighter than the font's natural line height (the spec's
 * 48/48, 26/30 and 24/29 tokens), for a given platform.
 *
 * Web and Android centre the glyphs in the short box and let them overflow.
 * iOS does not: React Native only centres when `lineHeight` is at least the
 * font's natural line height (`RCTApplyBaselineOffsetForRange`); below it,
 * TextKit takes the whole deficit off the TOP, and the Plan clock and detail
 * number lost the tops of their digits on device. So on iOS the box is set to
 * the natural height, and a negative margin gives the difference back — the
 * layout footprint stays the spec's line-height on every platform.
 *
 * Pure (the platform is a parameter) so it can be tested; `typography.ts`
 * binds it to the running platform.
 */
export function tightLineHeightFor(os: string, fontSize: number, lineHeight: number) {
  const natural = fontSize * POPPINS_LINE_HEIGHT;
  return os === 'ios' && lineHeight < natural
    ? { lineHeight: natural, marginVertical: (lineHeight - natural) / 2 }
    : { lineHeight };
}
