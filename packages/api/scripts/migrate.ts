/**
 * Minimal forward-only migration runner.
 *
 * Applies packages/api/migrations/*.sql in filename order inside a
 * transaction, recording each in schema_migrations. No down-migrations: while
 * the schema is still being figured out, `--reset` (drop and replay) is the
 * honest workflow, and once it stabilises, forward-only is what production
 * wants anyway.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const reset = process.argv.includes('--reset');
const databaseUrl = process.env['DATABASE_URL'];

/**
 * Which database are we about to touch, in words.
 *
 * A connection string with no hostname is a unix-socket connection, which is
 * always this machine.
 */
function describeTarget(raw: string): { host: string; database: string; local: boolean } {
  const u = new URL(raw);
  return {
    host: u.hostname || 'localhost',
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || '(default)',
    local: ['', 'localhost', '127.0.0.1', '[::1]'].includes(u.hostname),
  };
}

let target: { host: string; database: string; local: boolean } | null = null;
if (databaseUrl) {
  try {
    target = describeTarget(databaseUrl);
  } catch {
    target = null;
  }
}

// Only --reset needs to know its target. A plain migrate with no DATABASE_URL
// falls through to libpq's own defaults, which is additive and harmless.
if (reset && !target) {
  console.error(
    databaseUrl
      ? 'refusing to --reset: DATABASE_URL is not a parseable connection string.'
      : 'refusing to --reset: DATABASE_URL is not set, so there is no way to know\n' +
        'which database would be dropped.',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  if (reset) {
    /**
     * `--reset` drops the whole public schema. Against a throwaway local
     * database that is the honest workflow this runner was built for. Against
     * the archive it is unrecoverable: CBP publishes no history of its own
     * live feed, so wait_observations is the only record that those hours ever
     * happened. Everything else in the schema re-seeds (ports) or re-imports
     * (typical_waits) from CBP on demand; that table does not.
     *
     * So the command stays frictionless exactly while there is nothing to lose
     * — a local database with an empty archive — and otherwise demands the
     * target be named back. Naming it is the point: the failure this guards
     * against is a DATABASE_URL pointing somewhere you had forgotten it was
     * pointing, which a blanket --force flag would rubber-stamp.
     */
    const label = `${target!.host}/${target!.database}`;
    const reasons: string[] = [];

    if (!target!.local) reasons.push(`the target is not this machine (host ${target!.host})`);

    const reg = await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.wait_observations') IS NOT NULL AS present",
    );
    if (reg.rows[0]?.present) {
      const a = await client.query<{ n: string; first: string | null; last: string | null }>(
        `SELECT count(*)::text AS n,
                min(observed_at)::date::text AS first,
                max(observed_at)::date::text AS last
           FROM wait_observations`,
      );
      const row = a.rows[0];
      if (row && Number(row.n) > 0) {
        reasons.push(
          `wait_observations holds ${Number(row.n).toLocaleString('en-US')} rows ` +
            `(${row.first} .. ${row.last}), which cannot be re-collected`,
        );
      }
    }

    if (reasons.length > 0 && process.env['OTROLADO_RESET_CONFIRM'] !== label) {
      console.error(
        [
          '',
          `! refusing to drop schema public on ${label}`,
          '',
          ...reasons.map((r) => `    - ${r}`),
          '',
          '  Back it up first if you have not:',
          '    pg_dump -Fc "$DATABASE_URL" -f archive-$(date +%F).dump',
          '',
          '  Then, if you are certain, name the target back:',
          `    OTROLADO_RESET_CONFIRM='${label}' pnpm db:reset`,
          '',
        ].join('\n'),
      );
      await client.end();
      process.exit(1);
    }

    console.log(`! dropping and recreating schema public on ${label}`);
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`  applying ${file} ... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('ok');
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw err;
    }
  }

  console.log(ran === 0 ? 'up to date, nothing to apply' : `applied ${ran} migration(s)`);
} finally {
  await client.end();
}
