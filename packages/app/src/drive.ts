/**
 * PLACEHOLDER drive times.
 *
 * Straight-line distance x a distance-dependent speed. This is NOT a routing
 * result: it ignores roads, bridges, traffic and the river, and it will be
 * wrong — particularly for Colombia Solidarity, which is much further by road
 * than as the crow flies.
 *
 * It exists because the engineering plan names exactly this as the degrade
 * path when Google Routes is unavailable, so the "approx" presentation has to
 * exist regardless. Every number derived from here MUST render with its
 * `approximate` flag visible. Swapping in Routes means replacing this module
 * and nothing else.
 */
export interface DriveEstimate {
  readonly minutes: number;
  readonly miles: number;
  /** Always true here. Kept so callers branch on data, not on which module. */
  readonly approximate: true;
}

const EARTH_RADIUS_MI = 3958.8;

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/**
 * Short hops are city driving; longer runs pick up highway. A single average
 * speed fits neither, so speed scales with distance and caps out at highway
 * pace. Roads are not straight, hence the circuity factor.
 */
const CIRCUITY = 1.25;
const CITY_MPH = 20;
const MAX_MPH = 55;

export function estimateDrive(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): DriveEstimate {
  const straight = haversineMiles(from, to);
  const miles = straight * CIRCUITY;
  const mph = Math.min(MAX_MPH, CITY_MPH + miles * 1.2);
  return {
    minutes: Math.max(1, Math.round((miles / mph) * 60)),
    miles: Math.round(miles * 10) / 10,
    approximate: true,
  };
}

/**
 * Fallback origin, used until location permission is granted.
 *
 * McAllen — the Rio Grande Valley's largest city and roughly central to the
 * pilot crossings, which span ~60 miles from Roma to Brownsville. Arbitrary by
 * nature; real coordinates come from GPS. The point is that it sits a
 * realistic distance from the bridges rather than on top of them, so the
 * ranking has something to rank.
 */
export const DEFAULT_ORIGIN = { lat: 26.2034, lng: -98.2300 } as const;
