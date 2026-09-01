/**
 * The Home peak-forecast one-liner (v4 change 2): one sentence about where the
 * best crossing's wait is heading, or nothing at all.
 *
 * Copy discipline is the point. "Typically" is load-bearing — the source is an
 * hourly pattern, not a promise about today — and when no hour clears the
 * threshold the card is hidden entirely rather than filled with a platitude.
 * One trend signal per surface: this card exists INSTEAD of per-row sparklines.
 *
 * Pure on purpose: the caller supplies the forecast series, so this module
 * neither knows nor cares that /v1/forecast does not exist yet.
 */

export interface ForecastPoint {
  /** Predicted wait (P50), minutes. What the copy quotes. */
  readonly minutes: number;
  /**
   * The quantile band (P20/P80). Required, not optional: the model is quantile
   * regression so the band is free, and an advisory that fires on a P50 swing
   * sitting entirely inside its own uncertainty band is noise dressed as
   * advice. The gates below use these; forcing callers to supply them keeps
   * that check from being quietly skipped when /v1/forecast gets wired.
   */
  readonly p20: number;
  readonly p80: number;
  /** Display label for the hour, e.g. "3 pm". */
  readonly hourLabel: string;
}

export interface PeakAdvisory {
  readonly head: string;
  readonly body: string;
}

/**
 * A swing smaller than this is inside CBP's ±10 min reporting noise; advising
 * on it would be advice the data can't back.
 */
const SWING_MIN = 12;

/** Hours 1–8 of the series; hour 0 is "now" and the far tail is too uncertain. */
const SCAN_FROM = 1;
const SCAN_TO = 8;

export function peakAdvisory(
  portName: string,
  currentWait: number,
  forecast: readonly ForecastPoint[],
): PeakAdvisory | null {
  const window = forecast.slice(SCAN_FROM, SCAN_TO + 1);

  // Gated on the conservative end of the band, not the P50: a climb only
  // counts when even the P20 (the optimistic outcome) sits SWING_MIN above the
  // current wait, and an ease only when even the P80 sits SWING_MIN below.
  // The copy still quotes the P50 — with "typically" carrying the hedge.
  const climb = window.find((p) => p.p20 - currentWait >= SWING_MIN);
  if (climb) {
    const diff = climb.minutes - currentWait;
    return {
      head: 'Good window now.',
      body: `${portName} typically climbs to ~${climb.minutes} min by ${climb.hourLabel} — crossing sooner saves ~${diff} min.`,
    };
  }

  const ease = window.find((p) => currentWait - p.p80 >= SWING_MIN);
  if (ease) {
    return {
      head: 'No rush.',
      body: `${portName} typically eases to ~${ease.minutes} min by ${ease.hourLabel}.`,
    };
  }

  return null;
}
