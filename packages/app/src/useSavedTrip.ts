import { useMemo } from 'react';
import { usePrefs, type SavedTrip } from './prefs';
import { usePorts, useWaits } from './queries';
import { rankPorts } from './ranking';
import {
  nowInMinutes,
  resolveSavedTrip,
  tripIsForToday,
  tripLaneMode,
  type SavedTripStatus,
} from './trip';
import { useAgedWaits } from './useFreshness';
import { useOrigin } from './useOrigin';

export interface SavedTripView {
  readonly trip: SavedTrip;
  /** The trip was saved on an earlier day. Nothing is solved for it. */
  readonly expired: boolean;
  /** Null while expired, or before ports and waits have loaded. */
  readonly status: SavedTripStatus | null;
}

/**
 * The saved trip, re-solved against the wait reported now.
 *
 * One hook for every reader — the reminder line on the Trips tab, the rule row
 * on the Alerts tab, and the time-to-leave watcher in the tab layout — so they
 * cannot disagree about when to leave.
 * Goes through `rankPorts` for the same reason the Trips screen does: one
 * place decides drive time, lane and mode filtering.
 *
 * Re-runs on every poll (aged waits tick on a clock), so the leave time moves
 * with the line rather than freezing at save time.
 */
export function useSavedTrip(): SavedTripView | null {
  const trip = usePrefs().trip;
  const ports = usePorts();
  const waits = useWaits();
  const aged = useAgedWaits(waits);
  const origin = useOrigin();

  return useMemo(() => {
    if (!trip) return null;
    if (!tripIsForToday(trip.savedAt)) return { trip, expired: true, status: null };
    if (!ports.data || !aged.data) return { trip, expired: false, status: null };
    const ranked = rankPorts(ports.data.ports, aged.data, origin, tripLaneMode(trip.lane), 'northbound');
    return { trip, expired: false, status: resolveSavedTrip(trip, ranked, nowInMinutes()) };
  }, [trip, ports.data, aged.data, origin]);
}
