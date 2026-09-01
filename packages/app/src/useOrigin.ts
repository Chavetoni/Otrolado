import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { DEFAULT_ORIGIN } from './drive';

/**
 * A cached last-known fix older than this is not "current location" — it can
 * be from hours ago and a city away. Past it we fall through to a fresh GPS
 * reading, and if that fails, to the stated fallback (`isFallback: true`)
 * rather than presenting a stale point as the device's position.
 */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

export interface Origin {
  readonly lat: number;
  readonly lng: number;
  /** True when this is the fallback, not the device's real position. */
  readonly isFallback: boolean;
}

/**
 * The user's position, or a stated fallback.
 *
 * Location is requested but never required: denying it degrades to an
 * approximate origin rather than blocking the screen. `isFallback` is surfaced
 * in the UI so a drive time derived from a guessed starting point is never
 * presented as though it came from the device.
 */
export function useOrigin(): Origin {
  const [origin, setOrigin] = useState<Origin>({ ...DEFAULT_ORIGIN, isFallback: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!pos || cancelled) return;
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, isFallback: false });
      } catch {
        // Keep the fallback. Location is a nicety here, not a requirement.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return origin;
}
