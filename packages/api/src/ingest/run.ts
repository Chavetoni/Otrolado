import { DEFAULT_TZ } from '@otrolado/shared';
import { config } from '../config.js';
import { db } from '../db/index.js';
import type { NewWaitObservation } from '../db/schema.js';
import { buildSnapshot, writeSnapshot } from '../snapshot.js';
import { parsePort, type RawCbpPort } from './cbp-parse.js';
import { sql } from 'kysely';

export interface IngestResult {
  readonly ok: boolean;
  readonly recordsSeen: number;
  readonly rowsWritten: number;
  readonly parseErrors: number;
  readonly feedStampedAt: Date | null;
  /**
   * Spread between the earliest and latest resolved timestamp in one feed
   * document, in minutes. Every record describes the same instant, so this is
   * 0 when every crossing's feed_tz is right — and jumps to ~60 the moment one
   * is wrong. Cheapest possible canary for timezone drift.
   */
  readonly observedSpreadMinutes: number;
  /**
   * False when the Redis snapshot write failed after a successful ingest.
   * The run is still ok — Postgres holds the fresh rows and readSnapshot
   * falls back to it — but the failure must be observable, not swallowed.
   */
  readonly snapshotWritten: boolean;
  readonly error?: string;
}

/**
 * One poll of the CBP feed.
 *
 * Every run is recorded in ingest_runs whether it succeeds or not — the age of
 * the last OK run is what the staleness UI is actually derived from, so a
 * failed poll has to leave a trace or the app would keep showing stale numbers
 * as live.
 */
export async function ingestCbp(): Promise<IngestResult> {
  const run = await db
    .insertInto('ingest_runs')
    .values({ source: 'cbp' })
    .returning('id')
    .executeTakeFirstOrThrow();

  const fail = async (
    error: string,
    httpStatus: number | null,
    counts: { recordsSeen: number; parseErrors: number } = { recordsSeen: 0, parseErrors: 0 },
  ): Promise<IngestResult> => {
    await db
      .updateTable('ingest_runs')
      .set({
        finished_at: new Date(),
        ok: false,
        error,
        http_status: httpStatus,
        records_seen: counts.recordsSeen,
        parse_errors: counts.parseErrors,
      })
      .where('id', '=', run.id)
      .execute();
    return {
      ok: false, recordsSeen: counts.recordsSeen, rowsWritten: 0, parseErrors: counts.parseErrors,
      feedStampedAt: null, observedSpreadMinutes: 0, snapshotWritten: false, error,
    };
  };

  let raw: RawCbpPort[];
  let httpStatus: number | null = null;
  try {
    const res = await fetch(config.cbpFeedUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = res.status;
    if (!res.ok) return fail(`feed returned HTTP ${res.status}`, res.status);
    raw = (await res.json()) as RawCbpPort[];
    if (!Array.isArray(raw)) return fail('feed did not return an array', httpStatus);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), httpStatus);
  }

  // Port timezones come from the directory; CBP stamps are port-local and
  // meaningless without one.
  const tzRows = await db.selectFrom('ports').select(['id', 'feed_tz']).execute();
  const tzById = new Map(tzRows.map((r) => [r.id, r.feed_tz]));

  const wanted = new Set(config.ingestPortIds);
  const scoped = wanted.size > 0 ? raw.filter((r) => wanted.has(r.port_number)) : raw;

  const values: NewWaitObservation[] = [];
  const months = new Set<string>();
  let parseErrors = 0;
  let feedStampedAt: Date | null = null;
  let earliestObserved: Date | null = null;

  for (const record of scoped) {
    const tz = tzById.get(record.port_number) ?? DEFAULT_TZ;
    const parsed = parsePort(record, tz);
    if (!parsed) {
      parseErrors++;
      continue;
    }
    if (!feedStampedAt || parsed.observedAt > feedStampedAt) feedStampedAt = parsed.observedAt;
    if (!earliestObserved || parsed.observedAt < earliestObserved) earliestObserved = parsed.observedAt;
    months.add(parsed.observedAt.toISOString().slice(0, 7));

    for (const r of parsed.readings) {
      values.push({
        observed_at: r.observedAt,
        port_id: r.portId,
        mode: r.mode,
        lane: r.lane,
        direction: r.direction,
        status: r.status,
        wait_minutes: r.waitMinutes,
        lanes_open: r.lanesOpen,
        max_lanes: r.maxLanes,
        reported_at: r.reportedAt,
        feed_age_seconds: r.feedAgeSeconds,
        source: r.source,
      });
    }
  }

  // A degenerate-but-200 response must not reset the freshness clock. An empty
  // array, or a body whose records all fail parsing, carries zero readings —
  // recording it ok would make ingestAgeSeconds read ~0 and stamp hours-old
  // readings live indefinitely while /health/feeds reported healthy. (Genuine
  // idempotent success is different and stays success: readings parsed but
  // rowsWritten 0 means the feed document simply hasn't changed.)
  if (values.length === 0) {
    return fail(
      scoped.length === 0
        ? 'feed returned zero records'
        : `zero readings parsed from ${scoped.length} records (${parseErrors} parse errors)`,
      httpStatus,
      { recordsSeen: scoped.length, parseErrors },
    );
  }

  // Partitions are created lazily so ingest never fails at a month boundary.
  for (const month of months) {
    await sql`SELECT ensure_wait_partition(${`${month}-01T00:00:00Z`}::timestamptz)`.execute(db);
  }

  let rowsWritten = 0;
  if (values.length > 0) {
    // Re-polling an unchanged feed document yields identical rows; the PK
    // makes that a no-op rather than a duplicate.
    const inserted = await db
      .insertInto('wait_observations')
      .values(values)
      .onConflict((oc) =>
        oc.columns(['observed_at', 'port_id', 'mode', 'lane', 'direction']).doNothing(),
      )
      .executeTakeFirst();
    rowsWritten = Number(inserted.numInsertedOrUpdatedRows ?? 0);
  }

  // All records in one document describe the same instant. A non-zero spread
  // means at least one crossing's feed_tz is wrong and its history is being
  // written to the wrong hour — silently, and unrecoverably once archived.
  const observedSpreadMinutes =
    feedStampedAt && earliestObserved
      ? Math.round((feedStampedAt.getTime() - earliestObserved.getTime()) / 60_000)
      : 0;

  // A Redis outage must not mark a successful ingest as failed. The fresh rows
  // are already in Postgres and readSnapshot's Postgres fallback exists for
  // exactly this — abandoning the run here would stall the ingest-age clock
  // and turn every reading STALE while the data was actually fine.
  let snapshotWritten = true;
  try {
    await writeSnapshot(await buildSnapshot());
  } catch {
    // Surfaced via snapshotWritten; the poller logs it (this module, like the
    // rest of ingest, reports through its result rather than logging).
    snapshotWritten = false;
  }

  await db
    .updateTable('ingest_runs')
    .set({
      finished_at: new Date(),
      ok: true,
      http_status: httpStatus,
      feed_stamped_at: feedStampedAt,
      records_seen: scoped.length,
      rows_written: rowsWritten,
      parse_errors: parseErrors,
      observed_spread_minutes: observedSpreadMinutes,
    })
    .where('id', '=', run.id)
    .execute();

  return {
    ok: true,
    recordsSeen: scoped.length,
    rowsWritten,
    parseErrors,
    feedStampedAt,
    observedSpreadMinutes,
    snapshotWritten,
  };
}

/** Seconds since the last successful poll — the real freshness signal. */
export async function ingestAgeSeconds(): Promise<number | null> {
  const row = await db
    .selectFrom('ingest_runs')
    .select('finished_at')
    .where('source', '=', 'cbp')
    .where('ok', '=', true)
    .orderBy('finished_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!row?.finished_at) return null;
  return Math.max(0, Math.round((Date.now() - new Date(row.finished_at).getTime()) / 1000));
}
