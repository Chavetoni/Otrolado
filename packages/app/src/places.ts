import { haversineMiles } from './drive';
import type { Port } from '@otrolado/shared';

/**
 * Named starting points in the pilot region.
 *
 * Every drive time, total and leave-by in the app is measured from ONE origin
 * (see `useOrigin`), so the origin is the single most consequential input the
 * user has. Until this list existed there was no way to state it: with
 * location permission off, someone in Brownsville was silently ranked from a
 * point 60 miles up the valley and the header said only "Approximate
 * location". Naming the place makes the assumption visible, and choosing one
 * makes it correctable.
 *
 * These are CITY centroids, not survey points. They are inputs to a
 * straight-line drive estimate (`drive.ts`) whose error dwarfs the couple of
 * miles a centroid is off by, so the precision here is honest for what it
 * feeds — unlike the port coordinates, which Routes would measure *to* and
 * which therefore carry `coordsApproximate`. If real routing lands, these stay
 * fine; a chosen city is exactly the granularity a person means by "I'm in
 * McAllen".
 *
 * Ordered west to east along the river, which is how the crossings themselves
 * are ordered and how anyone in the valley pictures it.
 */
export interface Place {
  readonly id: string;
  /** "McAllen, TX" — always with the state, since a bare city name is ambiguous. */
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

export const PLACES: readonly Place[] = [
  { id: 'roma', label: 'Roma, TX', lat: 26.4048, lng: -99.0153 },
  { id: 'rio-grande-city', label: 'Rio Grande City, TX', lat: 26.3798, lng: -98.8203 },
  { id: 'mission', label: 'Mission, TX', lat: 26.2159, lng: -98.3253 },
  { id: 'mcallen', label: 'McAllen, TX', lat: 26.2034, lng: -98.23 },
  { id: 'edinburg', label: 'Edinburg, TX', lat: 26.3017, lng: -98.1633 },
  { id: 'pharr', label: 'Pharr, TX', lat: 26.1948, lng: -98.1836 },
  { id: 'donna', label: 'Donna, TX', lat: 26.1462, lng: -98.0522 },
  { id: 'weslaco', label: 'Weslaco, TX', lat: 26.1595, lng: -97.9908 },
  { id: 'harlingen', label: 'Harlingen, TX', lat: 26.1906, lng: -97.6961 },
  { id: 'san-benito', label: 'San Benito, TX', lat: 26.1325, lng: -97.6311 },
  { id: 'brownsville', label: 'Brownsville, TX', lat: 25.9017, lng: -97.4975 },
];

/**
 * Manual starting points are useful only when they are relevant to a crossing
 * the app can compare. This is intentionally generous: it keeps valley cities
 * such as Harlingen in the picker while excluding a future place accidentally
 * added far outside the supported border area.
 */
export const BORDER_CITY_MAX_MILES = 30;

export interface BorderCity {
  readonly place: Place;
  readonly nearestPort: Port;
  /** Straight-line distance from the city centroid to the crossing. */
  readonly borderMiles: number;
  /** Straight-line distance from the current approximate origin. */
  readonly originMiles: number;
}

/**
 * Cities supported by the crossings currently in the directory, closest to
 * the user's current origin first. The crossing directory has a bundled
 * offline value and can also update from the API, so this picker follows the
 * actual border coverage rather than maintaining a second static grouping.
 */
export function borderCitiesNear(
  ports: readonly Port[],
  from: { lat: number; lng: number },
): readonly BorderCity[] {
  const locatedPorts = ports.filter(
    (port): port is Port & { lat: number; lng: number } =>
      port.routable && port.lat !== null && port.lng !== null,
  );

  return PLACES.flatMap((place): BorderCity[] => {
    let nearestPort: (Port & { lat: number; lng: number }) | null = null;
    let borderMiles = Infinity;
    for (const port of locatedPorts) {
      const miles = haversineMiles(place, port);
      if (miles < borderMiles) {
        nearestPort = port;
        borderMiles = miles;
      }
    }
    if (!nearestPort || borderMiles > BORDER_CITY_MAX_MILES) return [];
    return [{ place, nearestPort, borderMiles, originMiles: haversineMiles(from, place) }];
  }).sort(
    (a, b) =>
      a.originMiles - b.originMiles ||
      a.borderMiles - b.borderMiles ||
      a.place.label.localeCompare(b.place.label),
  );
}

export function findPlace(id: string | null): Place | null {
  if (id === null) return null;
  return PLACES.find((p) => p.id === id) ?? null;
}

/**
 * How far a GPS fix may sit from a town before "Near <town>" stops being a
 * fair description of where you are. The valley's towns are 5–20 miles apart,
 * so 25 miles reaches the next one without ever claiming a place you can't
 * see. Past it the fix names no place at all — not a city, and not the region
 * either: a phone in San Antonio is not "near Rio Grande Valley, TX".
 */
export const NEAR_MAX_MILES = 25;

/**
 * The nearest named place to a fix, or null when nothing is close enough.
 *
 * This is a LABEL for a position we already have — it never replaces the
 * position. Ranking always uses the device's actual coordinates; snapping the
 * origin to a town centroid would throw away the precision GPS just gave us
 * in order to make a caption tidier.
 */
export function nearestPlace(at: { lat: number; lng: number }): Place | null {
  let best: Place | null = null;
  let bestMiles = Infinity;
  for (const p of PLACES) {
    const miles = haversineMiles(at, p);
    if (miles < bestMiles) {
      best = p;
      bestMiles = miles;
    }
  }
  return bestMiles <= NEAR_MAX_MILES ? best : null;
}
