import { zonedToUtc } from '../lib/tz.js';

/**
 * Infer a crossing's IANA timezone from the feed itself.
 *
 * CBP publishes no timezone field. What it does publish is each record's own
 * local wall-clock time, and every record in a document describes the same
 * instant — so the zone is recoverable: interpret the stated wall time in each
 * candidate zone and keep whichever lands closest to when we actually fetched.
 *
 * This resolves DST correctly for free, because zonedToUtc uses real zone
 * rules rather than a fixed offset table.
 */
/**
 * DST-observing zones only — America/Phoenix is deliberately absent.
 *
 * Verified against the live feed: Nogales AZ reports time=20:35 while Blaine
 * WA reports 19:35 at the same instant. Arizona does not observe DST, so a
 * correct Arizona clock would match Pacific in summer. It does not — CBP
 * applies daylight time uniformly and expresses Arizona in Mountain DAYLIGHT
 * (UTC-6), while still labelling the string "MST".
 *
 * So America/Phoenix is the geographically correct zone for those crossings
 * and the wrong one for parsing this feed: it would shift every Arizona
 * reading by an hour. What we store is the zone CBP's timestamps are
 * expressed in, which is why the column is `feed_tz` and not `tz`.
 *
 * Keeping the list to DST-observing zones also removes the Phoenix/Los_Angeles
 * summer collision, which previously made Blaine WA resolve to Phoenix on an
 * arbitrary tie-break.
 */
const CANDIDATES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
] as const;

/** Abbreviation -> zone, used only to break a residual tie. */
const ABBREVIATIONS: Record<string, string> = {
  EDT: 'America/New_York',
  EST: 'America/New_York',
  CDT: 'America/Chicago',
  CST: 'America/Chicago',
  MDT: 'America/Denver',
  MST: 'America/Denver',
  PDT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  AKDT: 'America/Anchorage',
  AKST: 'America/Anchorage',
};

export interface InferTzInput {
  /** Feed's `date`, 'M/D/YYYY'. */
  readonly date: string;
  /** Feed's `time`, 'HH:MM:SS', in the crossing's own zone. */
  readonly time: string;
  /** Any `update_time` from the record, e.g. 'At 3:00 pm CDT'. Optional. */
  readonly abbreviationHint?: string | undefined;
  /** When we fetched the document. */
  readonly fetchedAt: Date;
}

export interface InferTzResult {
  readonly tz: string;
  /** True when more than one zone fit and the choice needed a tie-break. */
  readonly ambiguous: boolean;
}

export function inferTimezone(input: InferTzInput): InferTzResult | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.date.trim());
  const t = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(input.time.trim());
  if (!d || !t) return null;

  const [y, mo, day] = [Number(d[3]), Number(d[1]), Number(d[2])];
  const [hh, mi, ss] = [Number(t[1]), Number(t[2]), Number(t[3])];

  // Zones are >=1h apart, so a 30 min window cannot admit two of them for the
  // wrong reason — it only tolerates the lag between CBP generating the
  // document and us fetching it.
  const TOLERANCE_MS = 30 * 60 * 1000;

  const fits: { tz: string; deltaMs: number }[] = [];
  for (const tz of CANDIDATES) {
    const instant = zonedToUtc(y, mo, day, hh, mi, ss, tz);
    const delta = Math.abs(instant.getTime() - input.fetchedAt.getTime());
    if (delta <= TOLERANCE_MS) fits.push({ tz, deltaMs: delta });
  }
  if (fits.length === 0) return null;
  if (fits.length === 1) return { tz: fits[0]!.tz, ambiguous: false };

  // More than one zone fits. With Phoenix removed this should not happen for
  // US land borders, but the tie-break stays so a future zone addition fails
  // loudly (ambiguous=true) rather than silently picking list order.
  const abbr = /\b(EDT|EST|CDT|CST|MDT|MST|PDT|PST|AKDT|AKST)\b/.exec(input.abbreviationHint ?? '');
  const hinted = abbr ? ABBREVIATIONS[abbr[1]!] : undefined;
  if (hinted && fits.some((f) => f.tz === hinted)) {
    return { tz: hinted, ambiguous: true };
  }

  fits.sort((a, b) => a.deltaMs - b.deltaMs);
  return { tz: fits[0]!.tz, ambiguous: true };
}

/** First non-empty `update_time` in a record, for the abbreviation hint. */
export function firstUpdateTime(record: Record<string, unknown>): string | undefined {
  for (const groupKey of ['passenger_vehicle_lanes', 'commercial_vehicle_lanes', 'pedestrian_lanes']) {
    const group = record[groupKey] as Record<string, unknown> | undefined;
    if (!group) continue;
    for (const value of Object.values(group)) {
      if (value && typeof value === 'object' && 'update_time' in value) {
        const ut = (value as { update_time?: string }).update_time;
        if (ut && ut.trim()) return ut;
      }
    }
  }
  return undefined;
}
