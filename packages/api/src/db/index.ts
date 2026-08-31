import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { Database } from './schema.js';

// int8 (bigserial) arrives as a string by default; these ids fit in a JS
// number comfortably and are easier to work with typed as one.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

/**
 * Teach node-pg to parse arrays of our custom enums.
 *
 * node-pg ships parsers for built-in array types only; a `travel_mode[]` comes
 * back as the raw literal "{passenger,pedestrian}", so `ports.modes` would
 * reach the API as a string while its type says string[]. Rather than weaken
 * the column to text[] and lose database-level validation, look the array OIDs
 * up once at startup and reuse pg's own text-array parser for them.
 *
 * OIDs for user-defined types are assigned per database, so this cannot be a
 * hardcoded constant — it has to be a query.
 */
const TEXT_ARRAY_OID = 1009;
const ENUM_TYPES = ['travel_mode', 'lane_type', 'direction', 'lane_status', 'feed_source'];

// pg's own text[] parser, reused verbatim. Cast because @types/pg narrows
// getTypeParser to its builtin TypeId union, which excludes array OIDs.
const getParser = pg.types.getTypeParser as (oid: number) => (value: string) => string[];
const textArrayParser = getParser(TEXT_ARRAY_OID);
const { rows } = await pool.query<{ typarray: number }>(
  'SELECT typarray FROM pg_type WHERE typname = ANY($1::text[]) AND typarray <> 0',
  [ENUM_TYPES],
);
for (const row of rows) {
  pg.types.setTypeParser(Number(row.typarray), textArrayParser);
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}
