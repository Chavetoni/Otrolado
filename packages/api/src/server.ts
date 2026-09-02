import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { closeDb } from './db/index.js';
import { ingestCbp } from './ingest/run.js';
import { redis } from './lib/redis.js';
import { healthRoutes } from './routes/health.js';
import { portsRoutes } from './routes/ports.js';
import { typicalRoutes } from './routes/typical.js';
import { waitsRoutes } from './routes/waits.js';

const app = Fastify({ logger: { level: config.logLevel } });

/**
 * CORS for the browser targets (react-native-web dev on :8081, and any web
 * build we ship). Native fetch does not enforce CORS, which is why this was
 * invisible until the web build ran.
 *
 * `origin: '*'` is deliberate, not a dev shortcut. /v1/ports and /v1/waits are
 * unauthenticated by design so the CDN can cache one copy for everyone, and the
 * data is identical for every user. A constant header means NO `Vary: Origin`,
 * which matters: `Origin` is caller-controlled and unbounded, so varying on it
 * would fragment the CDN key and store one 145KB blob per distinct origin
 * string — defeating the whole read path.
 *
 * The authenticated endpoints (/v1/etas, /trips, /alerts/prefs, /devices, /me)
 * must NOT use '*' when they land. They need a config-driven allowlist plus
 * `Vary: Origin`; they are not CDN-cached, so key fragmentation costs nothing.
 *
 * `exposedHeaders: ['ETag']` is required — ETag is not a CORS-safelisted
 * response header, so without it client JS cannot read the ETag cross-origin.
 */
await app.register(cors, {
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  exposedHeaders: ['ETag'],
});

await app.register(healthRoutes);
await app.register(portsRoutes);
await app.register(typicalRoutes);
await app.register(waitsRoutes);

/**
 * In-process poller.
 *
 * Fine for the pilot: one feed, one replica. Moves to a BullMQ worker before
 * there are multiple API replicas, or every replica polls independently and
 * they race on writes.
 */
let timer: NodeJS.Timeout | undefined;
/**
 * The tick currently in flight, if any. Shutdown awaits it before tearing down
 * the pool — otherwise a deploy that lands mid-poll kills the connection out
 * from under an open transaction and the run is logged as an error that never
 * actually happened.
 */
let inFlight: Promise<void> | null = null;
let stopping = false;

function startPoller(): void {
  const tick = async (): Promise<void> => {
    if (stopping) return;
    try {
      const result = await ingestCbp();
      if (result.ok && !result.snapshotWritten) {
        app.log.warn(
          'snapshot write failed (Redis down?) — reads fall back to Postgres; ingest still ok',
        );
      }
      if (result.observedSpreadMinutes > 5) {
        app.log.warn(
          { spreadMinutes: result.observedSpreadMinutes },
          'feed timestamps disagree — a crossing feed_tz is likely wrong; reseed ports',
        );
      }
      app.log.info({ ingest: result }, 'ingest tick');
    } catch (err) {
      if (!stopping) app.log.error({ err }, 'ingest tick threw');
    }
  };
  const run = (): void => {
    inFlight = tick().finally(() => {
      inFlight = null;
    });
  };
  run();
  timer = setInterval(run, config.ingestIntervalMs);
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'shutting down');
  if (timer) clearInterval(timer);
  if (inFlight) {
    // Bounded: never let a hung poll block the shutdown indefinitely.
    await Promise.race([inFlight, new Promise((r) => setTimeout(r, 10_000))]);
  }
  await app.close();
  await closeDb();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: '0.0.0.0' });
if (process.env['INGEST_ON_BOOT'] !== 'false') startPoller();
