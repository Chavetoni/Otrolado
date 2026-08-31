/**
 * buildSnapshot()'s 48-hour window and latest-per-lane dedupe, against a real
 * Postgres (no Redis involved — this is the DISTINCT ON query itself).
 *
 * The window is SEMANTIC, not a query optimisation: a crossing CBP stops
 * reporting must age OUT of the snapshot after 48h instead of having its last
 * reading served forever with an ever-growing "age". Within the window,
 * per-reading freshness in the routes handles honesty; beyond it, absence
 * does. A "harmless" removal of the WHERE clause would quietly resurrect
 * every crossing CBP ever dropped.
 *
 * Uses the two synthetic ports so the assertions cannot collide with the
 * fixture rows the ingest tests write.
 */
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import type { NewWaitObservation } from '../../src/db/schema.js';
import { buildSnapshot } from '../../src/snapshot.js';
import { TEST_PORT_A, TEST_PORT_B } from './env.js';

const HOUR = 3_600_000;
const MIN = 60_000;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

function reading(
  portId: string,
  observedAt: Date,
  overrides: Partial<NewWaitObservation> = {},
): NewWaitObservation {
  return {
    observed_at: observedAt,
    port_id: portId,
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
    ...overrides,
  };
}

beforeAll(async () => {
  // This file owns wait_observations' contents outright. (ingest_runs is
  // untouched — buildSnapshot never reads it.)
  await sql`TRUNCATE wait_observations`.execute(db);

  // 49h ago may fall in the previous calendar month; ensure both ends.
  await sql`SELECT ensure_wait_partition(${ago(49 * HOUR)})`.execute(db);
  await sql`SELECT ensure_wait_partition(${ago(0)})`.execute(db);

  await db
    .insertInto('wait_observations')
    .values([
      // Port A: single reading beyond the window — the aged-out crossing.
      reading(TEST_PORT_A, ago(49 * HOUR), { wait_minutes: 10 }),
      // Port B standard lane: three generations, newest must win.
      reading(TEST_PORT_B, ago(47 * HOUR), { wait_minutes: 5 }),
      reading(TEST_PORT_B, ago(30 * MIN), { wait_minutes: 10 }),
      reading(TEST_PORT_B, ago(10 * MIN), { wait_minutes: 20 }),
      // Port B ready lane: closed, so NULL wait — a second lane slot proving
      // dedupe is per (port, mode, lane, direction), not per port.
      reading(TEST_PORT_B, ago(30 * MIN), { lane: 'ready', status: 'closed', wait_minutes: null }),
    ])
    .execute();
});

describe('buildSnapshot 48-hour window', () => {
  it('a crossing whose only reading is >48h old is ABSENT, while fresh ports are present', async () => {
    const snap = await buildSnapshot();

    const portA = snap.readings.filter((r) => r.portId === TEST_PORT_A);
    const portB = snap.readings.filter((r) => r.portId === TEST_PORT_B);

    expect(portA).toHaveLength(0); // aged out — absence, not a stale number
    expect(portB.length).toBeGreaterThan(0);
  });

  it('dedupe picks the newest reading per lane, and a 47h-old one still qualifies as history to supersede', async () => {
    const snap = await buildSnapshot();

    const standard = snap.readings.filter(
      (r) => r.portId === TEST_PORT_B && r.mode === 'passenger' && r.lane === 'standard',
    );
    // Three generations in the table, exactly one in the snapshot: the newest.
    expect(standard).toHaveLength(1);
    expect(standard[0]!.waitMinutes).toBe(20);
    expect(standard[0]!.observedAt).toBe(ago(10 * MIN).toISOString());
  });

  it('lanes dedupe independently — a closed ready lane rides alongside the open standard lane', async () => {
    const snap = await buildSnapshot();

    const portB = snap.readings.filter((r) => r.portId === TEST_PORT_B);
    expect(portB).toHaveLength(2);

    const ready = portB.find((r) => r.lane === 'ready');
    expect(ready?.status).toBe('closed');
    expect(ready?.waitMinutes).toBeNull(); // closed is not "0 min"
  });

  it('stores facts only — no freshness verdict is baked into the blob', async () => {
    const snap = await buildSnapshot();
    expect(Number.isNaN(Date.parse(snap.generatedAt))).toBe(false);
    for (const r of snap.readings) {
      expect(r).not.toHaveProperty('freshness'); // verdicts are applied at read time
    }
  });
});
