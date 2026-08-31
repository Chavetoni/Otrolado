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

const client = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
await client.connect();

try {
  if (reset) {
    console.log('! dropping and recreating schema public');
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
