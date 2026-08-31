/**
 * Timezone helpers. No dependency — Intl does this correctly, including DST.
 *
 * CBP stamps every record in the crossing's own local time (the feed's four
 * distinct `time` values at any instant are just PDT/MDT/CDT/EDT), so every
 * timestamp has to be resolved against that port's zone before it means
 * anything.
 */

/** Offset of `tz` from UTC, in ms, at the given instant. */
function offsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(p['year']), Number(p['month']) - 1, Number(p['day']),
    Number(p['hour']) % 24, Number(p['minute']), Number(p['second']),
  );
  return asUtc - at.getTime();
}

/** Interpret a wall-clock reading in `tz` and return the real instant. */
export function zonedToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes settles DST boundaries: the first offset may belong to the
  // wrong side of a transition, the second is computed from a corrected guess.
  let result = naive - offsetMs(new Date(naive), tz);
  const second = naive - offsetMs(new Date(result), tz);
  if (second !== result) result = second;
  return new Date(result);
}

/** Wall-clock calendar date in `tz` for a given instant. */
export function localParts(at: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  return { y: Number(p['year']), mo: Number(p['month']), d: Number(p['day']) };
}
