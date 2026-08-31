import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { freshnessOf, type WaitReading, type WaitsResponse } from '@otrolado/shared';
import { config } from '../config.js';
import { ingestAgeSeconds } from '../ingest/run.js';
import { readSnapshot } from '../snapshot.js';

const thresholds = {
  estimatedAfterS: config.estimatedAfterS,
  staleAfterS: config.staleAfterS,
};

export async function waitsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Current wait per port/lane/direction.
   *
   * Unauthenticated and CDN-cacheable: this data is identical for every user,
   * which is the entire reason the read path scales for free.
   *
   * Every reading carries its own freshness verdict and age. There is no code
   * path that emits a bare number — if the caller can render it, it can render
   * how much to trust it.
   */
  app.get('/v1/waits', async (req, reply) => {
    const snapshot = await readSnapshot();
    const rawIngestAge = await ingestAgeSeconds();
    const now = Date.now();

    // Quantize ingest age to 30 s buckets before it enters the body. The raw
    // value is recomputed from Date.now() per request, so hashing it would
    // give two requests seconds apart different ETags and If-None-Match
    // revalidation would never hit. Bucketed, the ETag is stable between
    // ingest ticks (matching the 30 s CDN TTL). The coarseness is harmless:
    // the app re-ages this field client-side (packages/app/src/useFreshness.ts).
    // Per-lane fields are snapshot facts, stable between ingests; the computed
    // readingAgeSeconds below feeds freshnessOf but is deliberately NOT in the
    // body — verdicts derived from it flip only at threshold crossings, which
    // is a real change and correct to serve fresh.
    const ingestAge = rawIngestAge === null ? null : Math.floor(rawIngestAge / 30) * 30;

    const byPort = new Map<string, WaitReading[]>();
    for (const r of snapshot.readings) {
      const list = byPort.get(r.portId);
      if (list) list.push(r);
      else byPort.set(r.portId, [r]);
    }

    const body: WaitsResponse = {
      generatedAt: snapshot.generatedAt,
      ingestAgeSeconds: ingestAge,
      thresholds,
      ports: [...byPort.entries()].map(([portId, readings]) => ({
        portId,
        lanes: readings.map((r) => {
          // Per-reading age, computed here and not in the snapshot: the blob
          // stores facts, and this one changes every second it sits in cache.
          // It catches the case ingest age cannot — CBP dropping one crossing
          // from the document while polls keep succeeding.
          const observedMs = Date.parse(r.observedAt);
          const readingAgeSeconds = Number.isNaN(observedMs)
            ? null
            : Math.max(0, Math.round((now - observedMs) / 1000));
          return {
            mode: r.mode,
            lane: r.lane,
            direction: r.direction,
            status: r.status,
            waitMinutes: r.waitMinutes,
            lanesOpen: r.lanesOpen,
            maxLanes: r.maxLanes,
            observedAt: r.observedAt,
            reportedAt: r.reportedAt,
            feedAgeSeconds: r.feedAgeSeconds,
            freshness: freshnessOf(
              {
                status: r.status,
                ingestAgeSeconds: ingestAge,
                readingAgeSeconds,
                feedAgeSeconds: r.feedAgeSeconds,
              },
              thresholds,
            ),
          };
        }),
      })),
    };

    const etag = `"${createHash('sha1').update(JSON.stringify(body)).digest('base64url')}"`;
    reply.header('cache-control', 'public, max-age=30');
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return body;
  });
}
