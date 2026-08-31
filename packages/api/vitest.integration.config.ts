import { defineConfig } from 'vitest/config';
import { SCOPED_PORT_IDS, TEST_DATABASE_URL, TEST_REDIS_URL } from './test/integration/env.js';

/**
 * Integration suite: real Postgres, real Redis, disposable database.
 *
 * Run with `pnpm test:integration` (or root `pnpm test:integration`). Kept
 * out of the default `pnpm test` on purpose — these need infrastructure
 * (`pnpm services:up`), and a unit run must stay runnable anywhere.
 *
 * global-setup.ts DROPs and recreates `otrolado_test` at suite START, not at
 * exit: after a failure the database is left in place for inspection with
 * psql. It never touches the dev `otrolado` database (guards in env.ts,
 * global-setup.ts and setup.ts), and uses Redis DB 15, never dev's DB 1.
 *
 * If Postgres or Redis is unreachable, global setup fails the whole run with
 * a message saying to start services — deliberately a hard failure rather
 * than a skip, because nobody runs `test:integration` expecting a no-op.
 *
 * `env` below is injected into worker process.env BEFORE test files import
 * anything, which is what keeps src/config.ts (read at module load) pointed
 * at the test database. fileParallelism is off because every file shares the
 * one database.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: TEST_REDIS_URL,
      INGEST_PORT_IDS: SCOPED_PORT_IDS.join(','),
    },
  },
});
