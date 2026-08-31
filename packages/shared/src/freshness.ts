import type { Freshness, LaneStatus } from './types.js';

export interface FreshnessThresholds {
  /** Beyond this, a number is shown with the ESTIMATED badge. */
  readonly estimatedAfterS: number;
  /** Beyond this, the value is frozen behind a stale banner. */
  readonly staleAfterS: number;
}

export const DEFAULT_THRESHOLDS: FreshnessThresholds = {
  estimatedAfterS: 30 * 60,
  staleAfterS: 45 * 60,
};

export interface FreshnessInput {
  readonly status: LaneStatus;
  /**
   * Seconds since OUR last successful poll of the source. Precise, because we
   * measure it ourselves. This is the primary signal.
   */
  readonly ingestAgeSeconds: number | null;
  /**
   * Seconds since THIS reading's `observedAt` — the moment our ingest actually
   * saw it in a feed document. Like ingestAgeSeconds this is our own clock,
   * so it is immune to the update_time sweep problem below. It closes the gap
   * ingest age alone leaves open: if CBP silently drops one crossing from the
   * document while polls keep succeeding, ingest age stays near zero forever
   * but that crossing's readings keep getting older. Computed at read time by
   * the caller (the snapshot stores facts, not verdicts).
   */
  readonly readingAgeSeconds: number | null;
  /**
   * Seconds between the feed snapshot and CBP's own `update_time` stamp.
   *
   * Reported for transparency but deliberately NOT a hard gate. CBP posts
   * update_time at hour granularity and occasionally ahead of its own snapshot
   * clock, so this value sweeps 0 -> ~59 min every hour for every port
   * regardless of data quality. Gating the badge on it would make ESTIMATED a
   * clock hand rather than a signal about the data.
   */
  readonly feedAgeSeconds: number | null;
}

/**
 * How much to trust one reading, right now.
 *
 * Deviates deliberately from the integration spec's "feed age > 30 min ->
 * ESTIMATED". That rule is right in spirit but wrong in input: applied to CBP's
 * hour-granular `update_time` it fires for every port for half of every hour.
 * The honest version of the same intent is:
 *
 *   1. CBP explicitly saying it has no current figure  ('update_pending')
 *   2. our own ingest having gone quiet                (ingestAgeSeconds)
 *   3. this reading having gone quiet                  (readingAgeSeconds)
 *
 * All three are precise — (2) and (3) are measured on our own clock, never on
 * CBP's hour-granular stamp — and all three mean what the badge claims to
 * mean. (2) and (3) are judged against the SAME thresholds and the verdict is
 * the WORSE of the two: a global ingest outage and a single crossing dropped
 * from an otherwise-healthy feed both degrade to ESTIMATED then STALE on the
 * same schedule, because to the user they are the same fact — this number has
 * not been refreshed in that long.
 */
export function freshnessOf(
  input: FreshnessInput,
  thresholds: FreshnessThresholds = DEFAULT_THRESHOLDS,
): Freshness {
  // CBP telling us the figure is overdue outranks any clock arithmetic.
  if (input.status === 'update_pending') return 'estimated';

  return worseOf(
    verdictForAge(input.ingestAgeSeconds, thresholds),
    verdictForAge(input.readingAgeSeconds, thresholds),
  );
}

function verdictForAge(age: number | null, thresholds: FreshnessThresholds): Freshness {
  if (age === null) return 'stale';
  if (age > thresholds.staleAfterS) return 'stale';
  if (age > thresholds.estimatedAfterS) return 'estimated';
  return 'live';
}

const FRESHNESS_RANK: Record<Freshness, number> = { live: 0, estimated: 1, stale: 2 };

function worseOf(a: Freshness, b: Freshness): Freshness {
  return FRESHNESS_RANK[a] >= FRESHNESS_RANK[b] ? a : b;
}

/** "as of 12 min ago" — every number on screen carries one of these. */
export function formatAge(seconds: number | null): string {
  if (seconds === null) return 'age unknown';
  if (seconds < 60) return 'just now';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
}
