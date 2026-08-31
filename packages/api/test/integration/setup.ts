/**
 * Per-worker guard + cleanup for the integration suite.
 *
 * Runs BEFORE each test file's module graph loads, which matters: src/config.ts
 * reads DATABASE_URL at import time, so this is the last chance to abort
 * before any src/ module could bind to the wrong database. The same _test /
 * Redis-DB>=2 rules as global-setup.ts, re-checked in the process that will
 * actually open connections.
 *
 * afterAll closes the pg pool and the ioredis client that src modules open as
 * module-level singletons, so each worker exits instead of hanging on live
 * handles.
 */
import { afterAll } from 'vitest';

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl || !new URL(dbUrl).pathname.replace(/^\//, '').endsWith('_test')) {
  throw new Error(
    `Integration worker started with DATABASE_URL=${dbUrl ?? '(unset)'} — refusing to run against a non-_test database.`,
  );
}
const redisUrl = process.env['REDIS_URL'];
const redisDb = Number(new URL(redisUrl ?? 'redis://invalid').pathname.replace(/^\//, '') || '0');
if (!Number.isInteger(redisDb) || redisDb < 2) {
  throw new Error(
    `Integration worker started with REDIS_URL=${redisUrl ?? '(unset)'} — refusing to run against Redis DB ${redisDb} (dev is 1).`,
  );
}

afterAll(async () => {
  // Dynamic imports: resolve to the already-cached module instances the tests
  // used (or harmlessly open-and-close them if a file never touched the DB).
  const { closeDb } = await import('../../src/db/index.js');
  const { redis } = await import('../../src/lib/redis.js');
  redis.disconnect();
  await closeDb();
});
