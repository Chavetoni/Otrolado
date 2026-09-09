import type { TypicalCell } from '@otrolado/shared';

/**
 * Reading CBP's previous-year hourly averages (`typical_waits`) — the pure
 * half. `useTypicalNow` wraps this with the query.
 *
 * Extracted from `TypicalCard` because two surfaces now need the same numbers
 * and MUST NOT disagree: the card draws the day's shape, and the detail
 * screen's live-wait card compares right now against this hour's average
 * ("42 min longer than typical"). Computing "typical at this hour" twice, in
 * two files, is how the banner and the chart end up quoting different figures
 * for the same hour.
 *
 * WHAT THIS IS. A climatology — what last year looked like at this hour — not
 * a forecast and not a prediction of today. Every caller renders it attributed
 * to CBP with the import vintage, and never in the live severity colours. Our
 * own status-aware medians replace the data source once the archive matures;
 * the copy says so instead of promising a curve it cannot draw.
 *
 * No React and no I/O here, for the same reason `ranking.ts` and `trip.ts`
 * have none: the comparison that decides whether a screen says "unusually
 * busy" has to be checkable without a renderer.
 */

export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/**
 * The clock at the crossing, not on the phone: a user checking from afar
 * should see the bridge's "now". feed_tz matches civil time everywhere in the
 * pilot (see CLAUDE.md on Arizona before widening). Falls back to device time
 * if the zone string ever fails to parse.
 */
export function portNow(tz: string): { month: number; dow: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
      month: 'numeric',
    }).formatToParts(new Date());
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const dow = WEEKDAY_TO_ISO[get('weekday')];
    const hour = Number(get('hour'));
    const month = Number(get('month'));
    // Some engines ignore hourCycle and emit "24" at midnight; the route and
    // importer both bound hour to 0–23, so reject it here too rather than let
    // the "now" highlight silently vanish for an hour.
    if (dow && Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(month)) {
      return { month, dow, hour };
    }
  } catch {
    // fall through
  }
  const d = new Date();
  return { month: d.getMonth() + 1, dow: ((d.getDay() + 6) % 7) + 1, hour: d.getHours() };
}

export function formatHour(h: number): string {
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/**
 * The middle bulk of a day's hourly averages, as a range.
 *
 * The interquartile span, NOT min–max: the extremes of a 24-hour day are a
 * 4 am ghost town and the evening peak, and quoting those as "typical" would
 * describe a range nobody experiences. Returns null under four hours of
 * history, where quartiles are arithmetic on nothing.
 *
 * Callers must label it as hours, not waits — these are hourly averages, and
 * "most waits fall between X and Y" would claim a distribution of individual
 * queue times we do not have.
 */
export function typicalSpread(
  cells: readonly TypicalCell[],
): { readonly low: number; readonly high: number } | null {
  if (cells.length < 4) return null;
  const sorted = [...cells].map((c) => c.avgWaitMinutes).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const low = at(0.25);
  const high = at(0.75);
  return low === high ? null : { low, high };
}

/**
 * How far today's live wait departs from this hour's typical, and whether
 * that gap is worth a sentence.
 *
 * The threshold clears CBP's own ±10 min officer-reporting accuracy: below it,
 * "unusually busy" would be a verdict on two numbers that are, within the
 * instrument's precision, the same. Same reasoning and same value as the spike
 * and faster-crossing alert thresholds.
 */
export const UNUSUAL_THRESHOLD = 15;

export type TypicalVerdict = 'busy' | 'quiet' | 'normal';

export function compareToTypical(
  liveMinutes: number,
  typicalMinutes: number,
): { readonly verdict: TypicalVerdict; readonly deltaMinutes: number } {
  const delta = liveMinutes - typicalMinutes;
  if (delta >= UNUSUAL_THRESHOLD) return { verdict: 'busy', deltaMinutes: delta };
  if (-delta >= UNUSUAL_THRESHOLD) return { verdict: 'quiet', deltaMinutes: -delta };
  return { verdict: 'normal', deltaMinutes: delta };
}
