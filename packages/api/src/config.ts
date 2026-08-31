function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Copy .env.example to .env.`);
  return v;
}
function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be an integer, got "${v}"`);
  return n;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  port: int('PORT', 3000),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',

  cbpFeedUrl: process.env['CBP_FEED_URL'] ?? 'https://bwt.cbp.gov/api/bwtnew',
  ingestIntervalMs: int('INGEST_INTERVAL_MS', 15 * 60 * 1000),

  /** Empty array = ingest every crossing the feed reports. */
  ingestPortIds: (process.env['INGEST_PORT_IDS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  estimatedAfterS: int('ESTIMATED_AFTER_S', 30 * 60),
  staleAfterS: int('STALE_AFTER_S', 45 * 60),
} as const;
