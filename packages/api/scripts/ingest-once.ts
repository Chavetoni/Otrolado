import { closeDb } from '../src/db/index.js';
import { ingestCbp } from '../src/ingest/run.js';
import { redis } from '../src/lib/redis.js';

const result = await ingestCbp();
console.log(JSON.stringify(result, null, 2));
await closeDb();
redis.disconnect();
process.exit(result.ok ? 0 : 1);
