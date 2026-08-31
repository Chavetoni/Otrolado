import { sql } from 'kysely';
import type { WaitReading } from '@otrolado/shared';
import { db } from './db/index.js';
import { redis, SNAPSHOT_KEY } from './lib/redis.js';

/**
 * The snapshot stores FACTS ONLY — no freshness verdicts.
 *
 * Freshness depends on how long ago this was generated, which keeps changing
 * after it is written. Baking a verdict in would freeze it at write time and
 * the blob would keep claiming "live" for as long as it sat in cache. Routes
 * apply the policy at read time instead.
 */
export interface Snapshot {
  readonly generatedAt: string;
  readonly readings: readonly WaitReading[];
}

/**
 * Latest reading per (port, mode, lane, direction), straight from Postgres.
 *
 * Bounded to the last 48 hours on purpose, and the bound is semantic, not just
 * a query optimisation: a crossing that CBP stops reporting ages OUT of the
 * snapshot after 48h instead of having its last reading served forever. (It
 * also keeps this per-tick DISTINCT ON scanning recent partitions rather than
 * growing with total archived history.) Within that window, per-reading
 * freshness in the routes handles the honesty; beyond it, absence does.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const rows = await db
    .selectFrom('wait_observations')
    .distinctOn(['port_id', 'mode', 'lane', 'direction'])
    .where('observed_at', '>', sql<Date>`now() - interval '48 hours'`)
    .selectAll()
    .orderBy('port_id')
    .orderBy('mode')
    .orderBy('lane')
    .orderBy('direction')
    .orderBy('observed_at', 'desc')
    .execute();

  const readings: WaitReading[] = rows.map((r) => ({
    portId: r.port_id,
    mode: r.mode,
    lane: r.lane,
    direction: r.direction,
    status: r.status,
    waitMinutes: r.wait_minutes,
    lanesOpen: r.lanes_open,
    maxLanes: r.max_lanes,
    reportedAt: r.reported_at ? new Date(r.reported_at).toISOString() : null,
    observedAt: new Date(r.observed_at).toISOString(),
    feedAgeSeconds: r.feed_age_seconds,
    source: r.source,
  }));

  return { generatedAt: new Date().toISOString(), readings };
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

/**
 * Read the cached snapshot, falling back to Postgres when Redis is empty or
 * unreachable. Border-zone honesty starts here: the API degrades to a slower
 * path rather than returning nothing.
 */
export async function readSnapshot(): Promise<Snapshot> {
  try {
    const raw = await redis.get(SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw) as Snapshot;
  } catch {
    // fall through to Postgres
  }
  return buildSnapshot();
}
