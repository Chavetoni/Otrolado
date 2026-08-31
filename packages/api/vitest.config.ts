import { defineConfig } from 'vitest/config';

/**
 * Unit tests only: the pure modules under src/ (parsing, timezone). These run
 * with no infrastructure and are what `pnpm test` executes.
 *
 * Integration tests (test/integration/**) need a live Postgres + Redis and a
 * disposable database, so they live behind a separate config —
 * vitest.integration.config.ts, run via `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
