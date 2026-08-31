/**
 * The one place the integration tests' infrastructure endpoints are defined.
 * Imported by both vitest.integration.config.ts (which injects them into the
 * worker's process.env before any src/ module loads config) and
 * global-setup.ts (which runs in the vitest main process, where test.env does
 * NOT apply).
 *
 * Safety properties, enforced again at runtime in global-setup.ts and
 * setup.ts:
 *  - the database name must end in `_test`. The dev database `otrolado`
 *    holds irreplaceable archived wait history that cannot be backfilled;
 *    these tests must never be able to point at it.
 *  - the Redis logical DB must be >= 2. Dev uses index 1, and index 0 is
 *    reserved for whatever other project shares this machine's Redis.
 */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://otrolado:otrolado@localhost:5432/otrolado_test';

export const TEST_REDIS_URL = process.env['TEST_REDIS_URL'] ?? 'redis://localhost:6379/15';

/**
 * The ports ingest is scoped to (INGEST_PORT_IDS) — four real crossings from
 * the committed fixture, deliberately spanning three feed timezones so the
 * zero-spread canary is exercised across zones, not trivially within one:
 *   535501 Brownsville B&M        America/Chicago
 *   230501 Hidalgo                America/Chicago
 *   300401 Blaine Pacific Highway America/Los_Angeles
 *   070801 Alexandria Bay         America/New_York
 */
export const SCOPED_FEED_TZ: Readonly<Record<string, string>> = {
  '535501': 'America/Chicago',
  '230501': 'America/Chicago',
  '300401': 'America/Los_Angeles',
  '070801': 'America/New_York',
};

export const SCOPED_PORT_IDS = Object.keys(SCOPED_FEED_TZ);

/** Synthetic ports for direct-insert tests (constraints, partitions, snapshot). */
export const TEST_PORT_A = '999901';
export const TEST_PORT_B = '999902';
