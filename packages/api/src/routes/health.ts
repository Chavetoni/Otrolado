import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { ingestAgeSeconds } from '../ingest/run.js';
import { config } from '../config.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true }));

  /**
   * Feed health is THE metric (engineering plan §9). This is the same data the
   * app's staleness banner reads, exposed for ops — the honesty features and
   * the alerting are two views of one system.
   */
  app.get('/health/feeds', async (_req, reply) => {
    const [age, lastRuns] = await Promise.all([
      ingestAgeSeconds(),
      db
        .selectFrom('ingest_runs')
        .selectAll()
        .orderBy('started_at', 'desc')
        .limit(5)
        .execute(),
    ]);

    const degraded = age === null || age > config.staleAfterS;
    reply.code(degraded ? 503 : 200);
    return {
      ok: !degraded,
      lastSuccessfulIngestAgeSeconds: age,
      staleAfterS: config.staleAfterS,
      // The zero-spread canary, from the most recent run that measured one.
      // Non-zero means a crossing's feed_tz is wrong and history is being
      // archived into the wrong hour; the per-run values below (and the full
      // ingest_runs table) answer "when did it first go non-zero".
      observedSpreadMinutes:
        lastRuns.find((r) => r.observed_spread_minutes !== null)?.observed_spread_minutes ?? null,
      recentRuns: lastRuns.map((r) => ({
        id: r.id,
        source: r.source,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        ok: r.ok,
        recordsSeen: r.records_seen,
        rowsWritten: r.rows_written,
        parseErrors: r.parse_errors,
        observedSpreadMinutes: r.observed_spread_minutes,
        error: r.error,
      })),
    };
  });
}
