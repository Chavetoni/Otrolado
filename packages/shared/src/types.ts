/**
 * Domain vocabulary shared by the API and the app.
 *
 * These names deliberately mirror the CBP feed's own distinctions rather than
 * the prototype's UI labels. The prototype calls them vehicle/walk/cargo; the
 * feed calls them passenger/pedestrian/commercial. Translate at the edge, in
 * the UI layer — never in the data layer, or the feed's meaning gets lost.
 */

/**
 * Traveller class. Prototype: vehicle | walk | cargo.
 *
 * `commercial` stays in the vocabulary even though the app no longer offers a
 * Cargo mode: ingest still parses and archives commercial lanes on every tick,
 * and wait history cannot be backfilled. Narrowing this type would switch that
 * collection off and permanently lose the record the freight product would
 * need. The UI's own, narrower list is `packages/app/src/modes.ts`.
 */
export type TravelMode = 'passenger' | 'pedestrian' | 'commercial';

/**
 * Lane class. CBP reports each of these as a separate wait, which is why the
 * detail screen's lane tabs re-query rather than applying a multiplier.
 * `fast` is the freight programme; archived but not surfaced, see TravelMode.
 * (The prototype's 0.25/0.7 lane multipliers are mock-data shortcuts and must
 * not survive into production — real SENTRI/Ready waits come from the feed.)
 */
export type LaneType = 'standard' | 'nexus_sentri' | 'ready' | 'fast';

/** v1 has feed data northbound only. See LIMITS.southbound. */
export type Direction = 'northbound' | 'southbound';

/**
 * The five states CBP actually reports, kept distinct on purpose.
 *
 * Collapsing these into `number | null` is the single easiest way to lie to a
 * user: a lane that does not exist, a lane that is closed, and a lane whose
 * report is overdue are three different sentences on screen, and none of them
 * is "0 min".
 */
export type LaneStatus =
  /** Reporting normally. `waitMinutes` is meaningful (may legitimately be 0). */
  | 'open'
  /** Lane exists here but is currently closed. Drives the closure alert. */
  | 'closed'
  /** Lane exists and is open, but CBP has not posted a current figure. */
  | 'update_pending'
  /** This crossing has no lane of this class at all. Render as "—", not 0. */
  | 'not_available';

/** How fresh a number is. Thresholds come from config, not hardcoded here. */
export type Freshness = 'live' | 'estimated' | 'stale';

export interface PortHours {
  /** Raw human string from the feed, e.g. "24 hrs/day", "8 am-Midnight". */
  readonly text: string;
  readonly open24h: boolean;
}

export interface Port {
  /** CBP port_number, six digits, e.g. "230402". Stable primary key. */
  readonly id: string;
  /** Bridge name, e.g. "Bridge II". */
  readonly crossingName: string;
  /** Display name used in the UI, e.g. "Juárez–Lincoln Intl". */
  readonly displayName: string;
  /** CBP's port/city grouping, e.g. "Laredo". */
  readonly portName: string;
  readonly border: 'mexican' | 'canadian';
  /** Null outside the pilot region: CBP publishes no geodata. */
  readonly lat: number | null;
  readonly lng: number | null;
  /**
   * IANA zone that CBP expresses this crossing's timestamps in.
   *
   * NOT reliably the crossing's civil timezone: CBP applies daylight time
   * uniformly, so Arizona crossings are published in Mountain Daylight even
   * though Arizona does not observe DST. Correct for parsing feed timestamps;
   * wrong for rendering a local clock outside the pilot region.
   */
  readonly feedTz: string;
  /** Which modes physically exist here. Cargo-only bridges omit passenger. */
  readonly modes: readonly TravelMode[];
  readonly hours: PortHours;
  /**
   * True when lat/lng are hand-approximated rather than sourced from official
   * geodata. Anything true here must be verified before ETAs ship — a wrong
   * plaza coordinate silently corrupts every drive time to that crossing.
   */
  readonly coordsApproximate: boolean;
  /** False when we have no coordinates — cannot be mapped or routed to. */
  readonly routable: boolean;
  /**
   * Curated ground-truth pointers (v4). All nullable, and null is the designed
   * state, not a gap to fill: the UI omits the row entirely rather than render
   * a disabled placeholder or an unverified source. Each non-null value must
   * trace to an official operator (TxDOT, a city bridge authority) — never
   * crowdsourced, never guessed.
   */
  /** Link-out to a live camera showing this crossing's queue. */
  readonly webcamUrl: string | null;
  /** Attribution + cadence copy, e.g. "TxDOT cam · I-35 S at the bridge · refreshed ~1 min". */
  readonly webcamLabel: string | null;
  /** Where the northbound queue usually begins — a Mexican-side street/landmark. */
  readonly lineStartLabel: string | null;
  /** Coordinate for "navigate to the line start". Null unless both are known. */
  readonly lineStartLat: number | null;
  readonly lineStartLng: number | null;
}

/** One lane's reading at one moment. The atom of the whole system. */
export interface WaitReading {
  readonly portId: string;
  readonly mode: TravelMode;
  readonly lane: LaneType;
  readonly direction: Direction;
  readonly status: LaneStatus;
  /** Non-null only when status === 'open'. */
  readonly waitMinutes: number | null;
  readonly lanesOpen: number | null;
  readonly maxLanes: number | null;
  /** When CBP says the officer posted this. Null when unparseable. */
  readonly reportedAt: string | null;
  /** Snapshot time of the feed document this came from. */
  readonly observedAt: string;
  /** observedAt - reportedAt, clamped at 0. Null when reportedAt is null. */
  readonly feedAgeSeconds: number | null;
  readonly source: 'cbp' | 'cbsa';
}

export const LIMITS = {
  /**
   * No official federal feed exists for waits entering Mexico. The prototype's
   * `dFac = 0.35` southbound multiplier is invented mock data. v1 either scopes
   * to northbound or labels southbound explicitly as unmodelled — it must never
   * render with the same confidence as a fed number.
   */
  southbound: 'no-feed',
  /** CBP waits are officer-reported. Treat as ±10 min ground truth. */
  cbpAccuracyMinutes: 10,
} as const;
