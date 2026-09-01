import type { RankedPort } from './ranking';
import type { Origin } from './useOrigin';

export interface Bounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/**
 * The framing for the inline Crossings map.
 *
 * Derived from the pins actually on screen rather than a hardcoded region, so
 * the card stays correct when the pilot widens past the Rio Grande Valley —
 * the prototype's fixed viewBox was a hand-drawn picture of Laredo and could
 * not survive that. The origin is included so "You" is never framed out.
 */
export function boundsOf(rows: readonly RankedPort[], origin: Origin): Bounds | null {
  const lats: number[] = [origin.lat];
  const lngs: number[] = [origin.lng];
  for (const row of rows) {
    const { lat, lng } = row.port;
    if (lat === null || lng === null) continue;
    lats.push(lat);
    lngs.push(lng);
  }
  // Only the origin: one point cannot frame a map, and an origin-only card
  // would claim a view of crossings it has none of.
  if (lats.length < 2) return null;
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/**
 * Padding as a fraction of the span, floored so a tight cluster of crossings
 * (Brownsville's four sit within ~0.05°) still gets breathing room instead of
 * a degenerate zoom.
 */
const PAD_FRACTION = 0.35;
const MIN_DELTA = 0.12;

/** react-native-maps framing. Leaflet takes the raw bounds via fitBounds. */
export function boundsToRegion(b: Bounds): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  return {
    latitude: (b.minLat + b.maxLat) / 2,
    longitude: (b.minLng + b.maxLng) / 2,
    latitudeDelta: Math.max(MIN_DELTA, (b.maxLat - b.minLat) * (1 + PAD_FRACTION)),
    longitudeDelta: Math.max(MIN_DELTA, (b.maxLng - b.minLng) * (1 + PAD_FRACTION)),
  };
}
