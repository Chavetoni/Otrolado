import { describe, expect, it } from 'vitest';
import { haversineMiles } from './drive';
import { NEAR_MAX_MILES, PLACES, findPlace, nearestPlace } from './places';

const roma = findPlace('roma')!;

/** Due west of Roma, the westernmost town, so no other town can be nearer. */
const westOfRoma = (miles: number) => ({
  lat: roma.lat,
  lng: roma.lng - miles / (69.17 * Math.cos((roma.lat * Math.PI) / 180)),
});

describe('nearestPlace', () => {
  it('names each town from its own centroid', () => {
    for (const p of PLACES) expect(nearestPlace(p)?.id).toBe(p.id);
  });

  it('names a town just inside the radius', () => {
    const at = westOfRoma(NEAR_MAX_MILES - 1);
    expect(haversineMiles(at, roma)).toBeLessThan(NEAR_MAX_MILES);
    expect(nearestPlace(at)?.id).toBe('roma');
  });

  it('names nothing just outside it', () => {
    const at = westOfRoma(NEAR_MAX_MILES + 1);
    expect(haversineMiles(at, roma)).toBeGreaterThan(NEAR_MAX_MILES);
    expect(nearestPlace(at)).toBeNull();
  });

  // The bug this pins: with no town near, the origin label used to fall back
  // to the region, so these fixes read "Starting near Rio Grande Valley, TX".
  // Null is what lets useOrigin say "Your location" instead.
  it('names nothing for a fix far outside the valley', () => {
    expect(nearestPlace({ lat: 37.323, lng: -122.032 })).toBeNull(); // Cupertino (simulator default)
    expect(nearestPlace({ lat: 29.4241, lng: -98.4936 })).toBeNull(); // San Antonio
  });

  it('still names a town for a fix across the river', () => {
    expect(nearestPlace({ lat: 26.0508, lng: -98.2979 })).not.toBeNull(); // Reynosa
  });
});
