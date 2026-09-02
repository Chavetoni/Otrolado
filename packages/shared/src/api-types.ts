import type { Freshness, LaneType, Port, TravelMode, WaitReading } from './types.js';
import type { FreshnessThresholds } from './freshness.js';

/**
 * The /v1 wire contract, declared once and imported by both sides: the API
 * types its route return values with these, the app types its fetches with
 * them. Hand-duplicating them drifted once already — don't reintroduce copies.
 *
 * /v1 is versioned; changes here must be additive only.
 */

/** GET /v1/ports — the static directory is the domain `Port`, verbatim. */
export interface PortsResponse {
  readonly ports: readonly Port[];
}

/**
 * One lane in GET /v1/waits: the domain reading minus what the grouping makes
 * redundant (`portId`) and what the client has no use for (`source`), plus the
 * freshness verdict the route computed at read time. `observedAt` ships so a
 * client can re-derive the verdict itself as the response sits in cache.
 */
export interface WaitsLane extends Omit<WaitReading, 'portId' | 'source'> {
  readonly freshness: Freshness;
}

export interface WaitsPort {
  readonly portId: string;
  readonly lanes: readonly WaitsLane[];
}

/** GET /v1/waits — every number carries its age and verdict, by construction. */
export interface WaitsResponse {
  readonly generatedAt: string;
  /** Seconds since our last successful poll; null before the first one. */
  readonly ingestAgeSeconds: number | null;
  /** The thresholds the verdicts were judged against, for client re-derivation. */
  readonly thresholds: FreshnessThresholds;
  readonly ports: readonly WaitsPort[];
}

/** One (weekday, hour) cell of CBP's previous-year hourly averages. */
export interface TypicalCell {
  /** ISO day of week, 1 = Monday .. 7 = Sunday. */
  readonly dow: number;
  /** Port-local hour, 0-23. Ports not open 24h simply have no cell for closed hours. */
  readonly hour: number;
  readonly avgWaitMinutes: number;
}

export interface TypicalLane {
  readonly mode: TravelMode;
  readonly lane: LaneType;
  readonly cells: readonly TypicalCell[];
}

/**
 * GET /v1/typical/:portId?month=1-12 — CBP's own historical averages, imported
 * from bwt.cbp.gov. A climatology ("what last year looked like at this hour"),
 * NOT our forecast: anything rendered from it must be attributed to CBP and
 * must never wear the visual language of a live or predicted number.
 */
export interface TypicalResponse {
  readonly portId: string;
  /** Calendar month these averages describe, 1-12. */
  readonly month: number;
  /** Provenance, spelled out so no client can render the numbers unattributed. */
  readonly source: 'cbp-previous-year-average';
  /** When our importer last pulled this from CBP. Null whenever `lanes` is empty. */
  readonly importedAt: string | null;
  /** Empty when the importer has not run for this port (or CBP has no history). */
  readonly lanes: readonly TypicalLane[];
}
