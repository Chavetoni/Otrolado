/**
 * Which hours did we actually capture?
 *
 * Row counts are the wrong health check for this archive. A day where the
 * collector ran for three hours and a day where it ran all twenty-four can
 * produce a similar-looking total, because CBP stamps readings to the hour and
 * ingest is idempotent — so what matters is how many distinct hours have any
 * observation at all, and whether the gaps cluster.
 *
 * Clustered gaps are the real danger: a model trained on an archive missing
 * every night has never seen a night, and wait history cannot be backfilled.
 * This is the check that would have caught both the sleeping-laptop period and
 * GitHub's unreliable scheduler on day one instead of a week later.
 *
 * Hours are UTC. Every pilot crossing is America/Chicago, so a UTC hour maps
 * to one local hour consistently; that stops being true if the app widens into
 * Arizona (see the feed_tz note in CLAUDE.md).
 *
 *   pnpm coverage           # last 7 days
 *   pnpm coverage 14        # last 14 days
 *
 * Reads whatever DATABASE_URL points at and says so — the local sandbox and
 * the real archive are different databases, and confusing them here would be
 * the whole point missed.
 */
import pg from 'pg';

const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 7));
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const target = (() => {
  try {
    const u = new URL(url);
    return `${u.hostname || 'localhost'}/${decodeURIComponent(u.pathname.replace(/^\//, ''))}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
})();

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows } = await client.query<{ day: string; hour: number; n: string }>(
    `SELECT to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')      AS day,
            extract(hour FROM observed_at AT TIME ZONE 'UTC')::int     AS hour,
            count(*)::text                                             AS n
       FROM wait_observations
      WHERE observed_at >= (date_trunc('day', now() AT TIME ZONE 'UTC')
                            - make_interval(days => $1::int - 1)) AT TIME ZONE 'UTC'
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    [days],
  );

  const byDay = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, new Set());
    byDay.get(r.day)!.add(r.hour);
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hourNow = now.getUTCHours();

  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dayList.push(d.toISOString().slice(0, 10));
  }

  console.log(`\ncoverage — ${target} — UTC hours, last ${days} day(s)\n`);
  console.log('             0       6       12      18   ');
  console.log('             |       |       |       |    ');

  let have = 0;
  let possible = 0;
  for (const day of dayList) {
    const hours = byDay.get(day) ?? new Set<number>();
    // Hours that have not happened yet are not gaps.
    const last = day === today ? hourNow : 23;
    let bar = '';
    for (let h = 0; h <= 23; h++) {
      bar += h > last ? ' ' : hours.has(h) ? '#' : '.';
    }
    const dayHave = [...hours].filter((h) => h <= last).length;
    have += dayHave;
    possible += last + 1;
    const pct = Math.round((dayHave / (last + 1)) * 100);
    const flag = pct < 75 ? '  <-- gaps' : '';
    console.log(
      `  ${day}  ${bar}  ${String(dayHave).padStart(2)}/${last + 1}  ${String(pct).padStart(3)}%${flag}`,
    );
  }

  const pct = possible === 0 ? 0 : Math.round((have / possible) * 100);
  console.log(`\n  # captured   . missing   (blank = not yet elapsed)`);
  console.log(`  total: ${have}/${possible} elapsed hours (${pct}%)\n`);

  // Recent gaps are the actionable ones — old holes cannot be filled.
  const recent: string[] = [];
  for (const day of dayList.slice(-2)) {
    const hours = byDay.get(day) ?? new Set<number>();
    const last = day === today ? hourNow : 23;
    for (let h = 0; h <= last; h++) {
      if (!hours.has(h)) recent.push(`${day.slice(5)} ${String(h).padStart(2, '0')}h`);
    }
  }
  console.log(
    recent.length === 0
      ? '  no gaps in the last 48h\n'
      : `  gaps in the last 48h (${recent.length}): ${recent.join(', ')}\n`,
  );
} finally {
  await client.end();
}
