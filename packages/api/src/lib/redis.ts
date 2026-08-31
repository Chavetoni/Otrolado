import { Redis } from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

/**
 * The whole read path in one key.
 *
 * ~85 crossings x ~7 lane slots is a small blob, rebuilt on every ingest tick
 * and served with an ETag behind a 30 s CDN cache — so a million users produce
 * cache hits, not database queries.
 */
export const SNAPSHOT_KEY = 'otrolado:snapshot:v1';
