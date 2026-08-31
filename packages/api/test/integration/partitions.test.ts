/**
 * ensure_wait_partition() (migration 003) against a real Postgres.
 *
 * wait_observations is declaratively range-partitioned by month and the
 * partitions are created LAZILY, by ingest calling this function before each
 * write. That design only works if (a) the function actually creates the
 * missing month, (b) calling it again is a no-op, and (c) a document whose
 * records straddle a month boundary lands every row — the exact scenario of
 * an ingest tick just after midnight UTC on the 1st. Without (a), the first
 * poll of every new month would fail; that failure mode is why the function
 * exists.
 *
 * Uses months in 2027, far from both `now()` and the fixture's 2026-08, so
 * no other test file (or the ingest tests' real rows) can have created them.
 *
 * HISTORY: writing this suite found that the 003 version of the function
 * passed bare date literals as partition bounds, which Postgres casts using
 * the SESSION timezone — so each "month" partition was offset by the local
 * UTC offset. Two tests below pinned that broken behavior until migration
 * 008 anchored the bounds to UTC and re-bounded existing partitions; they
 * now assert the correct, UTC-aligned behavior.
 */
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import type { NewWaitObservation } from '../../src/db/schema.js';
import { TEST_PORT_A } from './env.js';

function reading(observedAtIso: string): NewWaitObservation {
  return {
    observed_at: new Date(observedAtIso),
    port_id: TEST_PORT_A,
    mode: 'passenger',
    lane: 'standard',
    direction: 'northbound',
    status: 'open',
    wait_minutes: 10,
    lanes_open: null,
    max_lanes: null,
    reported_at: null,
    feed_age_seconds: null,
    source: 'cbp',
  };
}

async function regclass(name: string): Promise<string | null> {
  const { rows } = await sql<{ oid: string | null }>`
    SELECT to_regclass(${name})::text AS oid
  `.execute(db);
  return rows[0]?.oid ?? null;
}

async function ensurePartition(atIso: string): Promise<string> {
  const { rows } = await sql<{ part: string }>`
    SELECT ensure_wait_partition(${new Date(atIso)}) AS part
  `.execute(db);
  return rows[0]!.part;
}

describe('ensure_wait_partition', () => {
  it('an insert into a month with no partition fails — the lazy creation is load-bearing', async () => {
    await expect(
      db.insertInto('wait_observations').values(reading('2027-06-15T12:00:00Z')).execute(),
    ).rejects.toThrow(/no partition of relation "wait_observations"/);
  });

  it('creates the missing month partition, and calling it again is a no-op', async () => {
    expect(await regclass('wait_observations_2027_01')).toBeNull();

    const created = await ensurePartition('2027-01-20T08:00:00Z');
    expect(created).toBe('wait_observations_2027_01');
    expect(await regclass('wait_observations_2027_01')).toBe('wait_observations_2027_01');

    // Idempotent: every ingest tick calls it, most find the month exists.
    const again = await ensurePartition('2027-01-05T00:00:00Z');
    expect(again).toBe('wait_observations_2027_01');
  });

  it('after ensure, an insert lands in a month that had no partition', async () => {
    await expect(
      db.insertInto('wait_observations').values(reading('2027-01-20T08:00:00Z')).execute(),
    ).resolves.toBeDefined();
  });

  it('readings straddling a UTC month boundary all arrive when both months are ensured', async () => {
    // The midnight-on-the-1st ingest tick: one document, rows on both sides
    // of the boundary. run.ts collects the set of UTC months in the document
    // and ensures each before writing.
    await ensurePartition('2027-03-31T23:59:00Z');
    await ensurePartition('2027-04-01T00:01:00Z');

    await db
      .insertInto('wait_observations')
      .values([reading('2027-03-31T23:59:00Z'), reading('2027-04-01T00:01:00Z')])
      .execute();

    // Query the PARENT: both rows visible through the partitioned table.
    const { rows } = await sql<{ part: string; observed_at: Date }>`
      SELECT tableoid::regclass::text AS part, observed_at
      FROM wait_observations
      WHERE port_id = ${TEST_PORT_A}
        AND observed_at >= '2027-03-01'::timestamptz
        AND observed_at <  '2027-05-01'::timestamptz
      ORDER BY observed_at
    `.execute(db);
    expect(rows).toHaveLength(2);

    // Each row in its own month's partition. Before migration 008 this
    // asserted the pinned bug: the 003 function's session-timezone bounds
    // put "April" at [Apr 1 05:00Z, May 1 05:00Z), so the 00:01Z row landed
    // in wait_observations_2027_03. 008 anchors bounds to UTC.
    expect(rows.map((r) => r.part)).toEqual([
      'wait_observations_2027_03',
      'wait_observations_2027_04',
    ]);
  });

  it('in the first UTC hours of a fresh month, ensure actually covers the insert', async () => {
    // The failure mode migration 008 exists to close: a document observed at
    // 02:00Z on July 1st is in UTC month 2027-07, so run.ts ensures only
    // 2027-07. Under the 003 function that partition started at 05:00Z,
    // leaving 00:00Z–05:00Z covered by nothing when June's partition didn't
    // already exist (fresh deployment, backfill, or ingest having been down
    // across the boundary) — and this insert failed with "no partition of
    // relation". This test pinned that behavior until 008 anchored the
    // bounds to UTC; now the ensured partition must cover the whole UTC
    // month it is named for, including its first hours.
    const created = await ensurePartition('2027-07-01T02:00:00Z');
    expect(created).toBe('wait_observations_2027_07'); // named for the UTC month...

    await expect(
      db.insertInto('wait_observations').values(reading('2027-07-01T02:00:00Z')).execute(),
    ).resolves.toBeDefined(); // ...and covering it from 00:00Z

    // And the row is in that partition, not a neighbour.
    const { rows } = await sql<{ part: string }>`
      SELECT tableoid::regclass::text AS part
      FROM wait_observations
      WHERE port_id = ${TEST_PORT_A}
        AND observed_at = '2027-07-01T02:00:00Z'::timestamptz
    `.execute(db);
    expect(rows.map((r) => r.part)).toEqual(['wait_observations_2027_07']);
  });
});
