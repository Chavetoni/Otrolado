/**
 * ingestCbp end-to-end against a real Postgres, with fetch stubbed to serve
 * the committed fixture — a REAL feed document (85 records, captured
 * 2026-08-31T03:41:44Z; see src/ingest/cbp-parse.test.ts for what it
 * exhibits). Ingest is scoped via INGEST_PORT_IDS to four of its crossings
 * spanning three feed timezones (env.ts), so the zero-spread canary is
 * checked across zones, not trivially within one.
 *
 * Pins three discoveries:
 *  - Idempotency is structural: the PK (observed_at, port_id, mode, lane,
 *    direction) + ON CONFLICT DO NOTHING means re-polling an unchanged
 *    document writes 0 rows, and rows_written=0 is recorded as SUCCESS.
 *    "0 rows" meaning "feed unchanged" is easy to mis-read as a failure and
 *    "fix" into an error path.
 *  - A degenerate-but-HTTP-200 response (empty array, or all records failing
 *    to parse) is recorded ok=false so it does NOT advance the ingest-age
 *    clock. If it counted as success, ingestAgeSeconds would read ~0 and the
 *    app would stamp hours-old readings "live" while /health/feeds reported
 *    healthy.
 *  - observed_spread_minutes (the feed_tz canary, migration 007) is persisted
 *    on successful runs — 0 while every feed_tz is right — and left NULL on
 *    failed runs, so "when did the spread first go non-zero" stays answerable
 *    from the database.
 */
import { readFileSync } from 'node:fs';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db/index.js';
import { parsePort, type RawCbpPort } from '../../src/ingest/cbp-parse.js';
import { ingestAgeSeconds, ingestCbp } from '../../src/ingest/run.js';
import { SCOPED_FEED_TZ, SCOPED_PORT_IDS } from './env.js';

const FIXTURE_TEXT = readFileSync(
  new URL('../../src/ingest/__fixtures__/bwtnew-2026-08-31T034144Z.json', import.meta.url),
  'utf8',
);
const DOC = JSON.parse(FIXTURE_TEXT) as RawCbpPort[];
const DOC_INSTANT = '2026-08-31T03:41:44.000Z';

/**
 * Expected row count derived through the (unit-tested) parser itself, so this
 * suite cross-checks run.ts against parsePort rather than hardcoding 28.
 */
const expectedReadings = DOC.filter((r) => r.port_number in SCOPED_FEED_TZ).flatMap((r) => {
  const parsed = parsePort(r, SCOPED_FEED_TZ[r.port_number]!);
  if (!parsed) throw new Error(`fixture record ${r.port_number} failed to parse`);
  return [...parsed.readings];
});

function feedRespondsWith(body: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
  );
}

/** A record parsePort must reject (unusable timestamp) — drives the ok=false path. */
const UNPARSEABLE_RECORD = {
  port_number: SCOPED_PORT_IDS[0],
  border: 'Mexican Border',
  port_name: 'Brownsville',
  crossing_name: 'B&M',
  hours: '24 hrs/day',
  date: 'not-a-date',
  time: 'nope',
  port_status: 'Open',
};

async function latestRun() {
  return db
    .selectFrom('ingest_runs')
    .selectAll()
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow();
}

async function observationCount(): Promise<number> {
  const r = await db
    .selectFrom('wait_observations')
    .select(db.fn.countAll<string>().as('n'))
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

beforeAll(async () => {
  await sql`TRUNCATE wait_observations, ingest_runs RESTART IDENTITY`.execute(db);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('ingest idempotency (real fixture document)', () => {
  it('first ingest writes one row per parsed reading and records a successful run', async () => {
    feedRespondsWith(FIXTURE_TEXT);
    const r1 = await ingestCbp();

    expect(r1.ok).toBe(true);
    expect(r1.recordsSeen).toBe(SCOPED_PORT_IDS.length);
    expect(r1.parseErrors).toBe(0);
    expect(r1.rowsWritten).toBe(expectedReadings.length); // 28: 7 lane slots x 4 ports
    expect(r1.feedStampedAt?.toISOString()).toBe(DOC_INSTANT);
    expect(r1.snapshotWritten).toBe(true);
    expect(await observationCount()).toBe(expectedReadings.length);

    const run = await latestRun();
    expect(run.ok).toBe(true);
    expect(run.rows_written).toBe(expectedReadings.length);
    expect(run.records_seen).toBe(SCOPED_PORT_IDS.length);
    expect(new Date(run.feed_stamped_at!).toISOString()).toBe(DOC_INSTANT);
  });

  it('re-ingesting the same document writes 0 rows — and 0 is recorded as success', async () => {
    feedRespondsWith(FIXTURE_TEXT);
    const r2 = await ingestCbp();

    // rows_written 0 with ok=true is the idempotent no-op, NOT a failure:
    // the PK made every insert a conflict. Turning this into an error would
    // break every quiet re-poll of an unchanged feed.
    expect(r2.ok).toBe(true);
    expect(r2.rowsWritten).toBe(0);
    expect(r2.recordsSeen).toBe(SCOPED_PORT_IDS.length);
    expect(await observationCount()).toBe(expectedReadings.length); // unchanged

    const run = await latestRun();
    expect(run.ok).toBe(true);
    expect(run.rows_written).toBe(0);
    expect(run.error).toBeNull();
  });
});

describe('observed_spread_minutes persistence (migration 007)', () => {
  it('successful runs persist the spread — 0 while every feed_tz is right', async () => {
    // Four ports across three zones all resolving to one instant is the
    // invariant; a wrong feed_tz here would read ~60, not 0.
    const rows = await db
      .selectFrom('ingest_runs')
      .select(['ok', 'observed_spread_minutes'])
      .where('ok', '=', true)
      .execute();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.observed_spread_minutes).toBe(0);
  });

  it('a failed run leaves observed_spread_minutes NULL (no spread was measured)', async () => {
    feedRespondsWith('[]');
    const r = await ingestCbp();

    expect(r.ok).toBe(false);
    expect(r.error).toBe('feed returned zero records');

    const run = await latestRun();
    expect(run.ok).toBe(false);
    expect(run.observed_spread_minutes).toBeNull();
    expect(run.rows_written).toBeNull();
  });
});

describe('failed runs do not advance the ingest-age clock', () => {
  // ingestAgeSeconds is "seconds since the last ok=true run" — the value
  // /v1/waits gates freshness on. Each failure mode below must leave it
  // anchored to the old successful run, or stale data would be served as live.

  it('anchors to the last successful run, then holds through failures', async () => {
    await sql`TRUNCATE ingest_runs RESTART IDENTITY`.execute(db);

    // A successful run (rowsWritten 0 — the document is already archived —
    // which is precisely the success-with-no-new-rows case)...
    feedRespondsWith(FIXTURE_TEXT);
    const okRun = await ingestCbp();
    expect(okRun.ok).toBe(true);
    expect(okRun.rowsWritten).toBe(0);

    // ...backdated 10 minutes so a clock reset is unmistakable.
    await db
      .updateTable('ingest_runs')
      .set({ finished_at: sql`now() - interval '10 minutes'` })
      .where('ok', '=', true)
      .execute();

    const anchored = await ingestAgeSeconds();
    expect(anchored).not.toBeNull();
    expect(anchored!).toBeGreaterThanOrEqual(598);
    expect(anchored!).toBeLessThanOrEqual(615);

    // Degenerate 200: all records fail parsing -> ok=false.
    feedRespondsWith(JSON.stringify([UNPARSEABLE_RECORD]));
    const failedParse = await ingestCbp();
    expect(failedParse.ok).toBe(false);
    expect(failedParse.parseErrors).toBe(1);
    expect(failedParse.error).toMatch(/zero readings parsed/);

    // HTTP failure -> ok=false.
    feedRespondsWith('service unavailable', 503);
    const failedHttp = await ingestCbp();
    expect(failedHttp.ok).toBe(false);
    expect(failedHttp.error).toMatch(/HTTP 503/);

    // Both failures were recorded (feed health stays answerable from the DB)...
    const failures = await db
      .selectFrom('ingest_runs')
      .select(db.fn.countAll<string>().as('n'))
      .where('ok', '=', false)
      .executeTakeFirstOrThrow();
    expect(Number(failures.n)).toBe(2);

    // ...but the age still reads from the 10-minute-old success, not ~0.
    const after = await ingestAgeSeconds();
    expect(after).not.toBeNull();
    expect(after!).toBeGreaterThanOrEqual(anchored!);
    expect(after!).toBeLessThanOrEqual(620);
  });
});
