/**
 * Design tokens, from the Otrolado design system v2.0
 * ("design/Otrolado Design System v2.dc.html", §11 tokens.json) and its dark
 * mode proposal ("design/Otrolado Dark Mode.dc.html", direction 1a "Deep
 * navy", the recommended one). v2 keeps v1's opinion — navy structure, one
 * cobalt, cool ground, no shadows, Poppins — and tightens the system: a
 * legible secondary ink, status text separate from status dots, four radii,
 * seven type tokens, a locked icon family, and the production states
 * (pressed, disabled, loading, five freshness states).
 *
 * Fidelity is the contract here — these values are final, not suggestions.
 * Nothing in the app should hardcode a colour or size that isn't in here.
 *
 * THIS MODULE HAS NO IMPORTS, on purpose. It is pure data and pure functions,
 * so the unit tests can load it — and the severity thresholds and contrast
 * guarantees below are exactly the things worth testing. Anything that needs
 * `react-native` lives elsewhere: the Platform-dependent type tokens in
 * `typography.ts`, the colour-scheme store in `useTheme.ts`.
 *
 * TWO PALETTES, ONE SET OF NAMES. Every colour is a ROLE (`ink`, `surface`,
 * `accent`), never a hue, and each role has a light and a dark value; a
 * component reads `useTheme().color.ink` and never knows which. The dark
 * proposal's five rules shaped the roles:
 *
 *  01 Don't invert. Dark is its own ramp authored against its own base, not
 *     light flipped — so `ink` and `surface` are separate roles even though
 *     both are navy in light.
 *  02 Elevation is lighter, not shadowed. The surface ladder (page → surface
 *     → inset) steps LIGHTER in dark; there are still no shadows.
 *  03 Status text lifts, status fills don't. Dots and tints are the same
 *     objects in both palettes; only the `text` and `ink` pairs change.
 *  04 Tints become their dark twin, carrying a lifted ink at full opacity.
 *  05 Never pure white on a big field. Body copy on dark is `#EEF2FB`; white
 *     is reserved for hero numbers (`inkHero`) and for text on cobalt.
 *
 * And the structural consequence: COBALT CANNOT BE TEXT ON DARK (2.3:1). It
 * stays the primary FILL with white on top (`cobalt`, `onCobalt`) — the hero,
 * the primary button, the lane chip — but everywhere it was a colour with
 * nothing on top of it (a link, a glyph, a chart bar, a booth pill) it is the
 * `accent` role, which lifts to `#B9CCFF` in dark.
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

export type Scheme = 'light' | 'dark';

export interface Palette {
  /* ── The surface ladder (rule 02). Three steps, no more. ─────────────── */

  /** The page behind everything. Light: `mist`. Dark: `surface-base`. */
  readonly page: string;
  /** Cards, the tab bar, sheets. Light: white. Dark: `surface-raised`. */
  readonly surface: string;
  /**
   * Wells INSIDE a card, and the pressed fill of a card: an icon tile, a
   * chart gridline, the time-pick pills. Light: `mist` again (the page colour
   * recessed into a white card). Dark: `surface-inset`, one step lighter.
   */
  readonly inset: string;
  /** Hairlines, dividers, empty tracks, skeletons, closed booth pills. */
  readonly line: string;
  /** Recorded chart bars, inactive controls needing more weight, axis lines. */
  readonly lineStrong: string;
  /**
   * The one translucent surface: chrome floating over map imagery (the mode
   * chip, the legend, a pin's name label), where the hairline-and-surface
   * rule has nothing to separate it from.
   */
  readonly overlay: string;

  /* ── Ink ─────────────────────────────────────────────────────────────── */

  /** Primary ink: headings, body, numbers, glyphs on a page or card. */
  readonly ink: string;
  /**
   * Hero numbers only — `type.metric` (26px) and `type.waitHero` (48px) on a
   * page or card. Same as `ink` in light; in dark it is the one place pure
   * white is allowed on a dark field (rule 05).
   */
  readonly inkHero: string;
  /**
   * `ink-secondary` — every label, caption and sub-line that carries
   * information. 5.2:1 on white, 4.6:1 on mist; 5.8:1 on the dark surface.
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
  readonly muted: string;
  /**
   * `ink-muted` — disabled text and decoration ONLY, never information
   * (3.3:1 on white, 3.0:1 on the dark surface — under AA in both, on
   * purpose). The em dash of an unavailable wait; a disabled button's label.
   * On the navy header (a lane chip for a lane the crossing does not have)
   * use `inkMutedOnDark` instead.
   */
  readonly inkMuted: string;

  /* ── Accent: cobalt where nothing sits on top of it ──────────────────── */

  /**
   * Links, emphasis, the active tab, a cobalt glyph on a card, the current
   * bar on a chart, an open booth pill, a selected radio — cobalt used AS
   * INK OR AS A MARK, with nothing on top of it. Cobalt in light; lifts to
   * `accent-on-dark` (#B9CCFF, 9.5:1 on the dark surface) because cobalt is
   * 2.3:1 there.
   */
  readonly accent: string;
  /** Pressed on an `accent` text link — one shade darker. */
  readonly accentPressed: string;
  /** Text on a SMALL `accent` fill (the chart's NOW pill). White in light; navy on the lifted accent. */
  readonly onAccent: string;
  /**
   * The ON track of a toggle: a fill that must separate from the card AND
   * carry a white knob. Cobalt in light. In dark, cobalt on the dark surface
   * is 1.6:1 (the track would vanish), so it takes the mid blue — 3.6:1
   * against the surface, 4.4:1 under the knob.
   */
  readonly switchOn: string;
  /** Pressed on `switchOn` — one shade darker. */
  readonly switchOnPressed: string;

  /* ── Cobalt as a FILL, with white on top. Mode-independent. ──────────── */

  /** The one accent, as a fill: primary buttons, the hero surface, the ON lane chip. */
  readonly cobalt: string;
  /** Hover on cobalt. */
  readonly cobaltDeep: string;
  /** Pressed on cobalt — one step darker than hover (v2 control states). */
  readonly cobaltPress: string;
  /** Labels and secondary text ON cobalt or navy. */
  readonly cobaltLight: string;
  /** Borders of secondary buttons sitting on cobalt. */
  readonly cobaltOutline: string;
  /**
   * Translucent white fill on cobalt — the "selected" state of a secondary
   * button on the hero. From the brand sheet's Replay chip.
   */
  readonly surfaceOnCobalt: string;
  /** Text and glyphs ON cobalt: the hero name, a primary button's label. Always white. */
  readonly onCobalt: string;
  /** The inverse button (white on cobalt), pressed: one shade toward mist. */
  readonly inverseFillPressed: string;

  /* ── Navy as a SURFACE: the detail and origin headers, and what sits on them ── */

  /**
   * The brand navy AS A DARK SURFACE — the port detail header, the origin
   * picker header. NOT an ink: text and glyphs on a light surface are `ink`.
   * In dark this is exactly `surface` (the proposal: "every navy card in the
   * product today is already the raised surface"), so a navy header still
   * reads as a card on the darker page.
   */
  readonly navy: string;
  /** Hover/pressed on navy fills. */
  readonly navyTint: string;
  /**
   * Text and glyphs ON navy (`ink-on-dark`). v2's own token for this is
   * #EEF2FB — the app used to reach for white here; rule 05 says not to.
   */
  readonly inkOnDark: string;
  /** Secondary text on navy (`ink-sec-on-dark`, 5.8:1). */
  readonly mutedOnDark: string;
  /**
   * Disabled ink ON NAVY: a lane chip for a lane this crossing does not have.
   * `inkMuted` is authored against the page and is brighter than the inactive
   * chips' `mutedOnDark` on navy (4.6:1 vs 5.8:1 would barely differ), so the
   * header has its own, deliberately under AA (3.0:1) in both modes.
   */
  readonly inkMutedOnDark: string;
  /**
   * Outline of inactive chips on navy. In light, from the brand sheet's
   * lockup divider, not v2 — v2's hairline on navy is `navyTint`, which at
   * 1.2:1 against navy is too faint to read as the edge of a tappable
   * control. In dark it is the palette's own `line`, for the same reason.
   */
  readonly lineOnDark: string;

  /* ── Selected: a toggled-ON action that stays on screen ──────────────── */

  /**
   * The fill of a selected chip or button on a card (Watching, a time pick,
   * a watched crossing). Navy in light. In dark, navy on the navy surface is
   * invisible, so it is the lifted accent — the same treatment the proposal
   * gives the active tab.
   */
  readonly selectedFill: string;
  /** Pressed on `selectedFill` — one shade darker. */
  readonly selectedFillPressed: string;
  /** Text on `selectedFill`. */
  readonly onSelected: string;

  /* ── Controls ────────────────────────────────────────────────────────── */

  /** The segmented control's track. `line` in light; `inset` in dark. */
  readonly segmentTrack: string;
  /**
   * The segmented control's sliding pill: the LIGHTER step (rule 02), so the
   * selected segment sits above the track in both modes — white on `line`
   * in light, `line` on `inset` in dark.
   */
  readonly segmentPill: string;

  /* ── Notices ─────────────────────────────────────────────────────────── */

  /** Notice banner background. */
  readonly infoTint: string;
  /**
   * The rounded tile behind a glyph INSIDE a card (a rule's icon, the
   * directions pin). `infoTint` in light. In dark the notice tint is 1.09:1
   * against the card and the tile vanished, so it takes the ladder's `inset`
   * step instead; its glyph (`infoAccent`) is 6.5:1 there.
   */
  readonly iconTile: string;
  /**
   * The edge of a `surface` pill sitting on a TINT (the Manage button on the
   * watch card, Plan's countdown). Light needs none — white separates from
   * a pale tint on its own — so it is the surface colour. In dark the pill
   * is darker than the tint behind it (1.09:1) and needs the `line` hairline.
   */
  readonly surfaceEdge: string;
  /** Text on `infoTint`. */
  readonly infoInk: string;
  /** The notice's 7px dot and glyph. Cobalt in light; lifted on the dark tint. */
  readonly infoAccent: string;

  /* ── Forecast ────────────────────────────────────────────────────────── */

  /**
   * Forecast bars: outlined in this, filled with `forecastFill`, never solid —
   * a prediction must never look like a measurement (§08). Unused until
   * /v1/forecast exists; reserved here so the chart can't invent its own.
   */
  readonly forecastLine: string;
  readonly forecastFill: string;
}

/**
 * A status's four tokens. v2 splits each status into FOUR, because v1 reused
 * the vivid dot colour as 11px text and the amber failed contrast outright
 * (2.6:1):
 *  - `dot`  — the dot, the status bar, the map pin. Stays vivid, and is the
 *             SAME in both modes so a status dot means the same thing in a
 *             screenshot from either (rule 03).
 *  - `text` — the same status as TEXT on the page or a card. Darkened to
 *             pass AA on white (5.3 / 5.0 / 4.9 : 1); lifted to pass on the
 *             dark surface. Never on a tinted surface — `ink` is the pair
 *             for tints.
 *  - `tint` / `ink` — a status-tinted surface and the text that sits on it.
 */
export interface StatusTokens {
  readonly dot: string;
  readonly text: string;
  readonly tint: string;
  readonly ink: string;
}

export interface StatusPalette {
  /** Under 20 min. */
  readonly clear: StatusTokens;
  /** 20 to 60 min, inclusive. */
  readonly moderate: StatusTokens;
  /** Over 60 min. */
  readonly heavy: StatusTokens;
}

export type StatusTone = keyof StatusPalette;

export interface Theme {
  readonly scheme: Scheme;
  readonly color: Palette;
  readonly status: StatusPalette;
}

/* ── Values ──────────────────────────────────────────────────────────────── */

const NAVY = '#16234A';
const NAVY_TINT = '#24345C';
const COBALT = '#1B45C4';
const COBALT_DEEP = '#1638A5';
const COBALT_PRESS = '#122F8C';
const COBALT_LIGHT = '#B9CCFF';
const COBALT_OUTLINE = '#5878DB';
const WHITE = '#FFFFFF';
const MIST = '#EEF2FB';
/** `ink-on-dark`. Also dark mode's primary ink. */
const INK_ON_DARK = '#EEF2FB';
/** `ink-sec-on-dark`. Also dark mode's secondary ink. */
const MUTED_ON_DARK = '#8FA0C6';
/** Dark's `line-on-dark`: dividers, closed pills, chip outlines on navy. */
const LINE_DARK = '#3B4C7A';

const lightColor: Palette = {
  page: MIST,
  surface: WHITE,
  inset: MIST,
  line: '#DFE5F3',
  lineStrong: '#C9D3E9',
  overlay: 'rgba(255,255,255,0.9)',

  ink: NAVY,
  inkHero: NAVY,
  muted: '#5E6D90',
  inkMuted: '#7E8DB5',

  accent: COBALT,
  accentPressed: COBALT_DEEP,
  onAccent: WHITE,
  switchOn: COBALT,
  switchOnPressed: COBALT_PRESS,

  cobalt: COBALT,
  cobaltDeep: COBALT_DEEP,
  cobaltPress: COBALT_PRESS,
  cobaltLight: COBALT_LIGHT,
  cobaltOutline: COBALT_OUTLINE,
  surfaceOnCobalt: 'rgba(255,255,255,0.14)',
  onCobalt: WHITE,
  inverseFillPressed: MIST,

  navy: NAVY,
  navyTint: NAVY_TINT,
  inkOnDark: INK_ON_DARK,
  mutedOnDark: MUTED_ON_DARK,
  inkMutedOnDark: '#5E6D90',
  lineOnDark: '#2C3F6E',

  selectedFill: NAVY,
  selectedFillPressed: NAVY_TINT,
  onSelected: WHITE,

  segmentTrack: '#DFE5F3',
  segmentPill: WHITE,

  infoTint: '#E3EBFD',
  iconTile: '#E3EBFD',
  surfaceEdge: WHITE,
  infoInk: '#15307A',
  infoAccent: COBALT,

  forecastLine: '#7EA0F0',
  forecastFill: '#F4F7FF',
};

/**
 * Direction 1a, "Deep navy": the brand navy drops one step to become the
 * page, and every navy card in the product today is already the raised
 * surface — so it reads as the same app after dark.
 *
 * Values marked DERIVED are not in the proposal's token flip table; they fill
 * roles the proposal did not draw (a stronger line, disabled ink, the toggle
 * track, a selected fill, the forecast fill) and were chosen against the
 * same base with the contrast checks in `theme.test.ts`. When the proposal
 * is folded into the spec's tokens.json, replace them with the spec's own.
 */
const darkColor: Palette = {
  page: '#0E1730',
  surface: NAVY,
  inset: NAVY_TINT,
  line: LINE_DARK,
  /** DERIVED: one step above `line`, still a fill rather than an ink. */
  lineStrong: '#4F6396',
  /** DERIVED: `surface` at the alpha light's overlay uses. */
  overlay: 'rgba(22,35,74,0.9)',

  ink: INK_ON_DARK,
  inkHero: WHITE,
  muted: MUTED_ON_DARK,
  /** DERIVED: light's secondary ink, which is 3.0:1 here — a disabled look, as intended. */
  inkMuted: '#5E6D90',

  accent: COBALT_LIGHT,
  /** DERIVED: `accent` one shade darker. */
  accentPressed: '#A3B9F2',
  onAccent: NAVY,
  /** DERIVED — see the role's comment. */
  switchOn: COBALT_OUTLINE,
  /** DERIVED: `switchOn` one shade darker. */
  switchOnPressed: '#4A69C9',

  cobalt: COBALT,
  cobaltDeep: COBALT_DEEP,
  cobaltPress: COBALT_PRESS,
  cobaltLight: COBALT_LIGHT,
  cobaltOutline: COBALT_OUTLINE,
  surfaceOnCobalt: 'rgba(255,255,255,0.14)',
  onCobalt: WHITE,
  inverseFillPressed: MIST,

  navy: NAVY,
  navyTint: NAVY_TINT,
  inkOnDark: INK_ON_DARK,
  mutedOnDark: MUTED_ON_DARK,
  inkMutedOnDark: '#5E6D90',
  lineOnDark: LINE_DARK,

  /** DERIVED: the proposal's active-tab treatment, as a fill. */
  selectedFill: COBALT_LIGHT,
  selectedFillPressed: '#A3B9F2',
  onSelected: NAVY,

  segmentTrack: NAVY_TINT,
  segmentPill: LINE_DARK,

  /** The proposal's notice: `#152A56` ground, `#DCE6FF` text, `#9FBCFF` glyph. */
  infoTint: '#152A56',
  /** DERIVED — see the role's comment. */
  iconTile: NAVY_TINT,
  surfaceEdge: LINE_DARK,
  infoInk: '#DCE6FF',
  infoAccent: '#9FBCFF',

  forecastLine: '#7EA0F0',
  /** DERIVED: a cobalt-cast step above the surface, for an outlined bar's fill. */
  forecastFill: '#1A2B5C',
};

/** Status dots — independent of brand, never restyled, identical in both modes. */
const DOT = { clear: '#1F8A5B', moderate: '#D9932A', heavy: '#C4462F' } as const;

const lightStatus: StatusPalette = {
  clear: { dot: DOT.clear, text: '#1A7A50', tint: '#E4F0EA', ink: '#1E5540' },
  moderate: { dot: DOT.moderate, text: '#9A6408', tint: '#FBF1D9', ink: '#5A430A' },
  heavy: { dot: DOT.heavy, text: '#C4462F', tint: '#F8E5E1', ink: '#8A4433' },
};

/**
 * Rule 03: the dots stay put; the text lifts (clear and heavy fail as text on
 * dark at 4.1:1 and 3.6:1 — moderate's amber already clears it, so it is the
 * dot itself). Rule 04: each tint gets a dark twin carrying a lifted ink, the
 * pill inks from the proposal's own status rows.
 */
const darkStatus: StatusPalette = {
  clear: { dot: DOT.clear, text: '#4FC48C', tint: '#123A2B', ink: '#7FD9AE' },
  moderate: { dot: DOT.moderate, text: DOT.moderate, tint: '#3D2C0B', ink: '#F0C173' },
  heavy: { dot: DOT.heavy, text: '#F08571', tint: '#43190F', ink: '#F5A594' },
};

export const themes: Readonly<Record<Scheme, Theme>> = {
  light: { scheme: 'light', color: lightColor, status: lightStatus },
  dark: { scheme: 'dark', color: darkColor, status: darkStatus },
};

/* ── Severity ────────────────────────────────────────────────────────────── */

/** Severity bucket for a wait in minutes, per the spec thresholds. */
export function waitStatus(minutes: number): StatusTone {
  if (minutes < 20) return 'clear';
  if (minutes <= 60) return 'moderate';
  return 'heavy';
}

/**
 * Wait-minute colour for a dot, bar or pin. Takes no theme: the dots are the
 * same in both modes, by design (rule 03), so a pin means the same thing in
 * a screenshot from either.
 */
export function waitColor(minutes: number): string {
  return DOT[waitStatus(minutes)];
}

/**
 * Wait-minute colour for TEXT on the page or a card — the AA-safe pair of
 * `waitColor`, in the given palette.
 */
export function waitTextColor(minutes: number, status: StatusPalette): string {
  return status[waitStatus(minutes)].text;
}

/**
 * The word that rides beside a severity colour, so colour is never the only
 * channel. Thresholds as the spec states them.
 */
export function waitSeverityWord(minutes: number): string {
  return { clear: 'Clear', moderate: 'Moderate', heavy: 'Heavy' }[waitStatus(minutes)];
}

/* ── Everything below is mode-independent ────────────────────────────────── */

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
