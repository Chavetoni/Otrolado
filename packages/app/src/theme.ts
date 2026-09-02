/**
 * Design tokens, taken verbatim from "Otrolado Design System.md" (v1.0 Cobalt).
 *
 * Fidelity is the contract here — these values are final, not suggestions.
 * Nothing in the app should hardcode a colour or size that isn't in here.
 *
 * Load-bearing rules from the spec:
 *  - One cobalt per viewport. Cobalt is the single most tappable thing;
 *    everything else is navy, white, or mist.
 *  - Status colour outranks brand colour: green/amber/red are reserved for
 *    wait severity, never decoration.
 *  - No shadows. Separation comes from the `line` hairline and surface
 *    contrast.
 */
export const color = {
  /** Primary ink, dark surfaces, headings. */
  navy: '#16234A',
  /** Hover/pressed on navy fills. */
  navyTint: '#24345C',

  /** The one accent. Primary buttons, hero surface, active states. */
  cobalt: '#1B45C4',
  /** Hover/pressed on cobalt. */
  cobaltDeep: '#1638A5',
  /** Labels and secondary text ON cobalt or navy. */
  cobaltLight: '#B9CCFF',
  /** Borders of secondary buttons sitting on cobalt. */
  cobaltOutline: '#5878DB',

  /** App background. */
  mist: '#EEF2FB',
  /** Hairline borders, dividers, inactive tracks. */
  line: '#DFE5F3',
  /** Inactive controls needing more weight. */
  lineStrong: '#C9D3E9',
  /** Secondary text, captions, inactive labels. */
  muted: '#7E8DB5',
  /** Secondary text on navy. */
  mutedOnDark: '#8FA0C6',

  /** Notice banner background / text. */
  infoTint: '#E3EBFD',
  infoInk: '#15307A',

  /** Cards, tab bar, sheets. */
  surface: '#FFFFFF',

  /** Tab bar inactive icon square. */
  tabInactive: '#D3DBEE',
} as const;

/**
 * Status — independent of brand, never restyled.
 * `dot` is the dot/bar colour, `tint` the fill, `ink` the text on tint.
 */
export const status = {
  /** Under 20 min. */
  clear: { dot: '#1F8A5B', tint: '#E4F0EA', ink: '#1E5540' },
  /** 20–60 min. */
  moderate: { dot: '#D9932A', tint: '#FBF1D9', ink: '#5A430A' },
  /** 60 min +. */
  heavy: { dot: '#C4462F', tint: '#F8E5E1', ink: '#8A4433' },
} as const;

export type StatusTone = keyof typeof status;

/** Severity bucket for a wait in minutes, per the spec thresholds. */
export function waitStatus(minutes: number): StatusTone {
  if (minutes < 20) return 'clear';
  if (minutes <= 60) return 'moderate';
  return 'heavy';
}

/** Wait-minute colour (dot/bar/number colour) for the spec thresholds. */
export function waitColor(minutes: number): string {
  return status[waitStatus(minutes)].dot;
}

/**
 * Door-to-door total colour scale. Distinct thresholds from waitColor —
 * a total folds in the drive, so its bands sit higher. Do not merge.
 */
export function totalColor(minutes: number): string {
  if (minutes < 50) return status.clear.dot;
  if (minutes <= 65) return status.moderate.dot;
  return status.heavy.dot;
}

export const radius = {
  /** Cards: 16–18px. */
  card: 16,
  cardLg: 18,
  /** Buttons: 13–14px. */
  button: 14,
  /** Notice banner. */
  banner: 14,
  /** Hero surface: 20–22px. */
  hero: 22,
  sheet: 22,
  /** Chips, toggles, status bars: pills. */
  pill: 999,
  /** Bar-chart bars. */
  bar: 4,
} as const;

export const space = {
  /** Screen padding. */
  gutter: 22,
  /** Card padding: 13–20px; the workhorse crossing card uses 13×15. */
  cardPad: 14,
  stackGap: 9,
  sectionGap: 14,
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
 * Poppins, weights 400/500/600/700 only — never 300, never italic.
 * `tabular` MUST be applied to every wait and time number — without it the
 * digits shift width as values change and the whole list jitters on refresh.
 */
export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const tabular = { fontVariant: ['tabular-nums' as const] };
