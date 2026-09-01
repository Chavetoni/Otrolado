import type {
  Direction,
  Freshness,
  Port,
  TravelMode,
  WaitsLane,
  WaitsResponse,
} from '@otrolado/shared';
import { estimateDrive, type DriveEstimate } from './drive';

export interface RankedPort {
  readonly port: Port;
  readonly rank: number;
  readonly drive: DriveEstimate;
  /** Standard lane for the selected mode. The number the ranking is built on. */
  readonly primary: WaitsLane | null;
  /** Trusted-traveller lane, shown as a second chip. Vehicle + northbound only. */
  readonly trusted: WaitsLane | null;
  /**
   * Ready Lane (RFID documents — most travellers qualify, unlike SENTRI).
   * A third chip on vehicle rows; never affects the ranking, which stays on
   * the standard lane so the headline number means the same thing on every row.
   */
  readonly ready: WaitsLane | null;
  /** drive + wait. Null when the standard lane has no usable number. */
  readonly totalMinutes: number | null;
  readonly freshness: Freshness;
}

/**
 * Trusted-traveller lane per mode. `commercial: 'fast'` was removed with the
 * cargo scope cut — FAST is a freight programme and nothing in the app can
 * select that mode any more. The feed's FAST lanes are still archived.
 */
const TRUSTED_LANE_FOR: Partial<Record<TravelMode, string>> = {
  passenger: 'nexus_sentri',
};

/**
 * Rank crossings by total door-to-door time.
 *
 * Ranking is on the STANDARD lane, deliberately. Ranking each crossing on
 * whichever lane happens to be fastest would silently change what the headline
 * number means from row to row — a SENTRI figure and a standard figure are not
 * comparable, and most users cannot use the former.
 *
 * A crossing whose standard lane is closed keeps its row (its trusted lane may
 * still be usable) but has no total, and sorts below everything that does.
 */
export function rankPorts(
  ports: readonly Port[],
  waits: WaitsResponse | undefined,
  origin: { lat: number; lng: number },
  mode: TravelMode,
  direction: Direction,
): RankedPort[] {
  const lanesByPort = new Map(waits?.ports.map((p) => [p.portId, p.lanes]) ?? []);
  const trustedLane = TRUSTED_LANE_FOR[mode];

  const rows = ports
    // `routable` is the field that means "in scope and mappable". Filtering on
    // coordinates alone would keep showing crossings from a retired pilot
    // region, which still have coordinates.
    .filter((p) => p.routable && p.lat !== null && p.lng !== null && p.modes.includes(mode))
    .map((port) => {
      const lanes = lanesByPort.get(port.id) ?? [];
      const forMode = lanes.filter((l) => l.mode === mode && l.direction === direction);
      const primary = forMode.find((l) => l.lane === 'standard') ?? null;
      const trusted = trustedLane ? (forMode.find((l) => l.lane === trustedLane) ?? null) : null;
      // Ready Lane is a passenger-vehicle programme; the feed has no pedestrian
      // ready lane, so the find simply misses for other modes.
      const ready = mode === 'passenger' ? (forMode.find((l) => l.lane === 'ready') ?? null) : null;

      const drive = estimateDrive(origin, { lat: port.lat!, lng: port.lng! });
      const usable = primary?.status === 'open' && primary.waitMinutes !== null;

      return {
        port,
        rank: 0,
        drive,
        primary,
        trusted,
        ready,
        totalMinutes: usable ? drive.minutes + primary!.waitMinutes! : null,
        freshness: primary?.freshness ?? 'stale',
      } satisfies RankedPort;
    });

  rows.sort((a, b) => {
    if (a.totalMinutes === null && b.totalMinutes === null) return a.drive.minutes - b.drive.minutes;
    if (a.totalMinutes === null) return 1;
    if (b.totalMinutes === null) return -1;
    return a.totalMinutes - b.totalMinutes;
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** "Saves X min vs <runner-up>" for the hero card. */
export function savingsText(ranked: readonly RankedPort[]): string | null {
  const [best, second] = ranked;
  if (!best?.totalMinutes) return null;
  if (!second?.totalMinutes) return 'Only crossing reporting right now';
  const delta = second.totalMinutes - best.totalMinutes;
  if (delta <= 0) return 'Tied with the next crossing';
  return `Saves ${delta} min vs ${second.port.displayName}`;
}

/**
 * Minutes the Ready Lane saves over standard, or null when the comparison
 * can't honestly be made.
 *
 * The chip highlights only at >= READY_HIGHLIGHT_MIN. The 8 comes from the
 * handoff spec as the smallest difference worth surfacing; note it is still
 * inside CBP's ±10 min officer-reporting accuracy, so the highlight means
 * "probably worth switching", never a promised saving — which is also why the
 * copy is a colour, not a "saves N min" claim.
 */
export const READY_HIGHLIGHT_MIN = 8;

export function readySavings(row: Pick<RankedPort, 'primary' | 'ready'>): number | null {
  // Both lanes must be LIVE, not merely open: freshness is per-lane (CBP can
  // drop one lane from the document while the other keeps reporting), and a
  // green recommendation computed from a reading that aged out is advice
  // nobody gave. The row badge only carries the standard lane's verdict, so
  // this is the one place a stale ready reading would otherwise slip through.
  if (row.primary?.status !== 'open' || row.primary.freshness !== 'live') return null;
  if (row.ready?.status !== 'open' || row.ready.freshness !== 'live') return null;
  if (row.primary.waitMinutes === null || row.ready.waitMinutes === null) return null;
  return row.primary.waitMinutes - row.ready.waitMinutes;
}

/** Human label for a lane that has no number to show. */
export function laneStatusLabel(lane: WaitsLane | null): string {
  if (!lane) return 'no lane';
  switch (lane.status) {
    case 'not_available':
      return 'no lane';
    case 'closed':
      return 'CLOSED';
    case 'update_pending':
      return 'no update';
    case 'open':
      return lane.waitMinutes === null ? 'no update' : `${lane.waitMinutes}m`;
  }
}
