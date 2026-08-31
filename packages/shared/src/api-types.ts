import type { Freshness, Port, WaitReading } from './types.js';
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
