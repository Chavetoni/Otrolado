/**
 * Builds the disposable integration database, in the vitest MAIN process
 * (test.env does not apply here — endpoints come from env.ts).
 *
 *  1. Refuses to proceed unless the database name ends in `_test` and the
 *     Redis logical DB is >= 2 (dev history lives in `otrolado` / Redis 1 and
 *     cannot be backfilled if clobbered).
 *  2. DROPs the test database and recreates it — at suite START, not at
 *     exit, so a failed run leaves the database inspectable with
 *     `psql -U otrolado -d otrolado_test`.
 *  3. Replays packages/api/migrations/*.sql in filename order, same as
 *     scripts/migrate.ts.
 *  4. Seeds the ports the tests need: the four fixture crossings ingest is
 *     scoped to (with their real feed_tz — see env.ts) plus two synthetic
 *     ports for direct-insert tests.
 *  5. Flushes Redis DB 15 (only that DB — FLUSHDB, never FLUSHALL).
 *
 * Unreachable Postgres/Redis fails the run with instructions rather than
 * skipping: this suite is only ever invoked deliberately (test:integration).
 * Services are expected to already be running; nothing here starts or stops
 * them.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import pg from 'pg';
import {
  SCOPED_FEED_TZ,
  TEST_DATABASE_URL,
  TEST_PORT_A,
  TEST_PORT_B,
  TEST_REDIS_URL,
} from './env.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');

  // Belt-and-braces: never let this file drop anything but a *_test database.
  if (!dbName.endsWith('_test') || !/^[a-z_][a-z0-9_]*$/.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}" — the name must end in _test. ` +
        'The dev database holds irreplaceable archived wait history.',
    );
  }
  const redisDb = Number(new URL(TEST_REDIS_URL).pathname.replace(/^\//, '') || '0');
  if (!Number.isInteger(redisDb) || redisDb < 2) {
    throw new Error(
      `Refusing to run integration tests against Redis DB ${redisDb} — dev uses 1, other projects use 0. Use >= 2 (default 15).`,
    );
  }

  // Fresh database: drop (WITH FORCE evicts stale pooled connections from a
  // previous crashed run) and recreate, then replay every migration.
  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Integration tests need Postgres at ${maintenanceUrl.host} and it is not reachable ` +
        `(${err instanceof Error ? err.message : String(err)}). Start services with \`pnpm services:up\` and re-run.`,
    );
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) throw new Error(`no migrations found in ${migrationsDir}`);
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        throw new Error(
          `migration ${file} failed against ${dbName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Ports directory. feed_tz values matter: ingest resolves each fixture
    // record's port-local wall clock through them, and the zero-spread
    // assertion in ingest-run.test.ts only holds if all four are right.
    const port = (
      id: string,
      crossing: string,
      portName: string,
      border: 'mexican' | 'canadian',
      feedTz: string,
    ) => ({ id, crossing, portName, border, feedTz });
    const ports = [
      port('535501', 'B&M', 'Brownsville', 'mexican', SCOPED_FEED_TZ['535501']!),
      port('230501', 'Hidalgo', 'Hidalgo/Pharr', 'mexican', SCOPED_FEED_TZ['230501']!),
      port('300401', 'Pacific Highway', 'Blaine', 'canadian', SCOPED_FEED_TZ['300401']!),
      port('070801', 'Thousand Islands Bridge', 'Alexandria Bay', 'canadian', SCOPED_FEED_TZ['070801']!),
      port(TEST_PORT_A, 'Synthetic A', 'Testville', 'mexican', 'America/Chicago'),
      port(TEST_PORT_B, 'Synthetic B', 'Testville', 'mexican', 'America/Chicago'),
    ];
    for (const p of ports) {
      await client.query(
        `INSERT INTO ports
           (id, crossing_name, display_name, port_name, border, feed_tz, modes, hours_text, open_24h)
         VALUES ($1, $2, $3, $4, $5, $6, '{passenger,pedestrian,commercial}', '24 hrs/day', true)`,
        [p.id, p.crossing, `${p.portName} ${p.crossing}`.trim(), p.portName, p.border, p.feedTz],
      );
    }
  } finally {
    await client.end();
  }

  // Flush ONLY the test logical DB. Dev keys live in DB 1 and are untouched.
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    throw new Error(
      `Integration tests need Redis at ${new URL(TEST_REDIS_URL).host} (DB ${redisDb}) and it is not reachable ` +
        `(${err instanceof Error ? err.message : String(err)}). Start services with \`pnpm services:up\` and re-run.`,
    );
  } finally {
    redis.disconnect();
  }

  console.log(`[integration] fresh database ${dbName} ready (dropped at start; left in place after the run for inspection)`);
}
