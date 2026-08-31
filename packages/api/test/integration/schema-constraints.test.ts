/**
 * Pins the wait_minutes_only_when_open CHECK constraint (migration 003)
 * against a real Postgres — the database-level backstop for "three of the
 * five lane statuses are not numbers".
 *
 * What the constraint ACTUALLY says (read from 003, not from folklore):
 *
 *     (status =  'open' AND wait_minutes IS NOT NULL AND wait_minutes >= 0)
 *   OR (status <> 'open' AND wait_minutes IS NULL)
 *
 * Note the first arm: `open` REQUIRES a number. An open lane with no figure
 * is not representable — and that is deliberate, because the parser demotes
 * "delay with no figure" to `update_pending` rather than inventing a number
 * (cbp-parse.ts). So "status open, wait_minutes NULL" is REJECTED here, not
 * allowed: the schema and the parser agree that a wait you can't state is
 * `update_pending`, never an open lane with a hole in it. If someone relaxes
 * either side, one of these tests fails.
 */
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import type { NewWaitObservation } from '../../src/db/schema.js';
import { TEST_PORT_A } from './env.js';

// Fixed far-future month so this file owns its partition and rows outright.
const BASE = Date.parse('2030-01-15T12:00:00Z');
let seq = 0;

/** Fresh PK per attempt (observed_at varies), everything else overridable. */
function row(overrides: Partial<NewWaitObservation>): NewWaitObservation {
  seq += 1;
  return {
    observed_at: new Date(BASE + seq * 1000),
    port_id: TEST_PORT_A,
    mode: 'passenger',
    lane: 'standard',
    direction: 'northbound',
    status: 'open',
    wait_minutes: 0,
    lanes_open: null,
    max_lanes: null,
    reported_at: null,
    feed_age_seconds: null,
    source: 'cbp',
    ...overrides,
  };
}

async function insert(overrides: Partial<NewWaitObservation>): Promise<void> {
  await db.insertInto('wait_observations').values(row(overrides)).execute();
}

beforeAll(async () => {
  await sql`SELECT ensure_wait_partition(${new Date(BASE)})`.execute(db);
});

describe('wait_minutes_only_when_open', () => {
  it('accepts open with 0 — zero is a real measured wait, distinct from closed', async () => {
    await expect(insert({ status: 'open', wait_minutes: 0 })).resolves.toBeUndefined();
  });

  it('accepts open with a positive wait', async () => {
    await expect(insert({ status: 'open', wait_minutes: 75 })).resolves.toBeUndefined();
  });

  it('accepts every non-open status with NULL wait', async () => {
    await expect(insert({ status: 'closed', wait_minutes: null })).resolves.toBeUndefined();
    await expect(insert({ status: 'update_pending', wait_minutes: null })).resolves.toBeUndefined();
    await expect(insert({ status: 'not_available', wait_minutes: null })).resolves.toBeUndefined();
  });

  it('rejects a number on a closed lane — a closed lane is not "N minutes"', async () => {
    await expect(insert({ status: 'closed', wait_minutes: 5 })).rejects.toThrow(
      /wait_minutes_only_when_open/,
    );
  });

  it('rejects a number on update_pending — an overdue report is not "0 min"', async () => {
    await expect(insert({ status: 'update_pending', wait_minutes: 0 })).rejects.toThrow(
      /wait_minutes_only_when_open/,
    );
  });

  it('rejects a number on not_available — a lane that does not exist has no wait', async () => {
    await expect(insert({ status: 'not_available', wait_minutes: 0 })).rejects.toThrow(
      /wait_minutes_only_when_open/,
    );
  });

  it('rejects open with NULL wait — an unstated figure must be update_pending instead', async () => {
    // See the file header: this is the arm people assume is allowed. It is
    // not, and the parser is written against exactly this contract.
    await expect(insert({ status: 'open', wait_minutes: null })).rejects.toThrow(
      /wait_minutes_only_when_open/,
    );
  });

  it('rejects a negative wait', async () => {
    await expect(insert({ status: 'open', wait_minutes: -1 })).rejects.toThrow(
      /wait_minutes_only_when_open/,
    );
  });
});

describe('feed_age_seconds CHECK', () => {
  it('rejects a negative feed age — the parser clamps at 0 and the schema backs it up', async () => {
    await expect(insert({ feed_age_seconds: -30 })).rejects.toThrow(/feed_age_seconds/);
  });
});
