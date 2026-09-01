import { Platform, type ViewStyle } from 'react-native';

/**
 * Design tokens, taken verbatim from the handoff (README "Design Tokens").
 *
 * Fidelity is the contract here — these values are final, not suggestions.
 * Nothing in the app should hardcode a colour or size that isn't in here.
 */
export const color = {
  navy: '#17427A',
  navyPressed: '#0F2E56',
  navyTint: '#E3EAF4',
  navyTintBorder: '#C6D4E6',
  navySubtle: '#9DB8DB',

  ink: '#0B1F33',
  bodyMuted: '#33465C',
  secondary: '#5A6B80',
  tertiary: '#8595A8',

  appBg: '#F4F6F9',
  card: '#FFFFFF',
  border: '#D8DFE8',
  hairline: '#EBEFF4',
  chipBg: '#EDF0F4',
  trackBg: '#E2E7EE',

  green: '#1E8E5A',
  greenTint: '#E4F2EA',
  greenPressed: '#177A4C',

  amber: '#C77E14',

  red: '#C0392B',
  redTint: '#FBEAE6',
  redBorder: '#EFC5BB',
  redOnTint: '#7A3B31',

  gold: '#C7A23A',
  goldOnDark: '#F2C14E',
  goldBadgeBg: '#F6ECD2',
  goldBadgeText: '#7A5C12',

  /** Switch track, off state. Prototype: #C9D2DC. */
  switchOff: '#C9D2DC',

  /** Bottom tab bar: inactive icon/label, and the sliding active pill. */
  tabInactive: '#7E8B99',
  tabPill: '#E9EEF5',
} as const;

export const radius = {
  card: 14,
  cardLg: 16,
  button: 12,
  segment: 10,
  segmentInner: 8,
  chip: 16,
  pill: 17,
  sheet: 22,
  tabBar: 36,
  tabPill: 30,
} as const;

export const space = {
  gutter: 20,
  cardPad: 14,
  stackGap: 9,
  sectionGap: 14,
  /**
   * Bottom clearance for the floating tab bar. It is absolutely positioned and
   * so does not push content — every scroll view behind it must reserve this,
   * or its last row sits underneath the bar.
   */
  tabBarClearance: 96,
} as const;

/**
 * Schibsted Grotesk, weights 400-800. `tabular` MUST be applied to every wait
 * and time number — without it the digits shift width as values change and the
 * whole list jitters on each refresh.
 */
export const font = {
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
  extrabold: 'SchibstedGrotesk_800ExtraBold',
} as const;

export const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * One drop shadow, both dialects.
 *
 * react-native-web 0.21 deprecates the `shadow*` style props in favour of CSS
 * `boxShadow`; native iOS still wants the layer shadow and Android its
 * `elevation`. Emitting per-platform here keeps native rendering exactly as it
 * was while silencing the web deprecation warning at the source.
 *
 * `x` is omitted on purpose: every shadow in the prototype drops straight down.
 */
export function dropShadow(opts: {
  /** shadowOffset.height / CSS offset-y, px. */
  y: number;
  /** shadowRadius / CSS blur-radius, px. */
  blur: number;
  /** Hex #RRGGBB shadow colour. */
  color: string;
  /** 0–1, folded into the CSS colour on web. */
  opacity: number;
  /** Android depth; ignored on web where boxShadow covers it. */
  elevation?: number;
}): ViewStyle {
  const { y, blur, color: hex, opacity, elevation } = opts;
  if (Platform.OS === 'web') {
    return { boxShadow: `0px ${y}px ${blur}px ${hexToRgba(hex, opacity)}` };
  }
  const native: ViewStyle = {
    shadowColor: hex,
    shadowOpacity: opacity,
    shadowRadius: blur,
    shadowOffset: { width: 0, height: y },
  };
  if (elevation !== undefined) native.elevation = elevation;
  return native;
}

function hexToRgba(hex: string, opacity: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Wait-minute colour scale. Distinct from the total scale — do not merge. */
export function waitColor(minutes: number): string {
  if (minutes <= 20) return color.green;
  if (minutes <= 45) return color.amber;
  return color.red;
}

/** Door-to-door total colour scale. Different thresholds to waitColor. */
export function totalColor(minutes: number): string {
  if (minutes < 50) return color.green;
  if (minutes <= 65) return color.amber;
  return color.red;
}
