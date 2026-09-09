import {
  DEFAULT_THRESHOLDS,
  PILOT_PORTS,
  type Port,
  type TravelMode,
  type WaitsLane,
  type WaitsResponse,
} from '@otrolado/shared';
import { DEFAULT_ORIGIN } from '../drive';
import { rankPorts, type RankedPort } from '../ranking';

/**
 * Hand-written `/v1/waits` documents in the shape the API actually emits, fed
 * through the real `rankPorts` so every test crosses the real lane-selection
 * path (standard / nexus_sentri / ready, per mode and direction) instead of a
 * hand-assembled `RankedPort`.
 *
 * Lane defaults mirror a real reading: one `observedAt` per document (every
 * lane in a CBP document describes the same instant), an hour-granular
 * `reportedAt`, a `feedAgeSeconds` that is the gap between them. Non-open
 * lanes carry `waitMinutes: null`, as the CHECK constraint guarantees.
 */

/** One ingest tick: 2026-09-05 10:04 CDT. */
export const OBSERVED_AT = '2026-09-05T15:04:00.000Z';
/** CBP's stamp for that tick — "At 10:00 am", port-local. */
export const REPORTED_AT = '2026-09-05T15:00:00.000Z';

// Pilot ids, with the modes CBP reports there (from PILOT_PORTS).
export const GATEWAY = '535504'; // passenger, pedestrian
export const BM = '535501'; // passenger, pedestrian
export const HIDALGO = '230501'; // passenger, pedestrian
export const PHARR = '230502'; // passenger, commercial — no pedestrian lane
export const ANZALDUAS = '230503'; // passenger only

export function pilotPort(id: string): Port {
  const p = PILOT_PORTS.find((x) => x.id === id);
  if (!p) throw new Error(`no pilot port ${id}`);
  return p;
}

const BASE_LANE: WaitsLane = {
  mode: 'passenger',
  lane: 'standard',
  direction: 'northbound',
  status: 'open',
  waitMinutes: 0,
  lanesOpen: 4,
  maxLanes: 8,
  reportedAt: REPORTED_AT,
  observedAt: OBSERVED_AT,
  feedAgeSeconds: 240,
  freshness: 'live',
};

/** Passenger standard northbound lane, open with a figure. */
export function open(waitMinutes: number, over: Partial<WaitsLane> = {}): WaitsLane {
  return { ...BASE_LANE, waitMinutes, ...over };
}

/** CBP "Lanes Closed". */
export function closed(over: Partial<WaitsLane> = {}): WaitsLane {
  return { ...BASE_LANE, status: 'closed', waitMinutes: null, lanesOpen: null, ...over };
}

/** CBP "Update Pending": lane exists, no current figure. */
export function pending(over: Partial<WaitsLane> = {}): WaitsLane {
  return {
    ...BASE_LANE,
    status: 'update_pending',
    waitMinutes: null,
    lanesOpen: null,
    freshness: 'estimated',
    ...over,
  };
}

export const SENTRI = { lane: 'nexus_sentri' } as const satisfies Partial<WaitsLane>;
export const READY = { lane: 'ready' } as const satisfies Partial<WaitsLane>;
export const WALK = { mode: 'pedestrian' } as const satisfies Partial<WaitsLane>;

export function waits(
  byPort: Readonly<Record<string, readonly WaitsLane[]>>,
  over: Partial<WaitsResponse> = {},
): WaitsResponse {
  return {
    generatedAt: OBSERVED_AT,
    ingestAgeSeconds: 0,
    thresholds: DEFAULT_THRESHOLDS,
    ports: Object.entries(byPort).map(([portId, lanes]) => ({ portId, lanes })),
    ...over,
  };
}

/** Rank the pilot ports (or a supplied list) against a document, from McAllen. */
export function ranked(
  byPort: Readonly<Record<string, readonly WaitsLane[]>>,
  opts: { readonly mode?: TravelMode; readonly ports?: readonly Port[] } = {},
): RankedPort[] {
  return rankPorts(
    opts.ports ?? PILOT_PORTS,
    waits(byPort),
    DEFAULT_ORIGIN,
    opts.mode ?? 'passenger',
    'northbound',
  );
}

export function row(rows: readonly RankedPort[], id: string): RankedPort {
  const r = rows.find((x) => x.port.id === id);
  if (!r) throw new Error(`port ${id} not in ranking`);
  return r;
}

/**
 * Pin the drive on a real ranked row. Drive is straight-line from the origin
 * and the trip tests need exact arithmetic, so the number is substituted after
 * ranking — the lane selection above is untouched.
 */
export function withDrive(r: RankedPort, minutes: number): RankedPort {
  return { ...r, drive: { minutes, miles: minutes, approximate: true } };
}
