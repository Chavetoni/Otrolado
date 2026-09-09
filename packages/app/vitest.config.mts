import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's pure domain modules: ranking, the trip solver, the
 * alert rules, the prefs store and freshness re-aging. None of them touch a
 * renderer — they are pure on purpose so they can be checked without one —
 * hence `environment: 'node'`.
 *
 * The calendar-date tests (`tripIsForToday`) reason about a fixed local zone,
 * so the `test` script runs under TZ=America/Chicago. `env.TZ` repeats that
 * for a bare `npx vitest` invocation; trip.test.ts asserts the zone took
 * effect rather than silently passing in UTC.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { TZ: 'America/Chicago' },
  },
});
