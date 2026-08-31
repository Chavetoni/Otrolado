-- Fix: ensure_wait_partition()'s bounds followed the SESSION timezone, not
-- UTC, so every monthly partition was offset from the UTC month it is named
-- for.
--
-- The trap (found by test/integration/partitions.test.ts, 2026-08-31): the
-- 003 version computed the month name with AT TIME ZONE 'UTC' but passed bare
-- `date` values as the FOR VALUES bounds. A partition bound on a timestamptz
-- column is a timestamptz, and Postgres casts a date (or a zoneless literal)
-- to timestamptz using the session's TimeZone. On this machine that is
-- America/Chicago, so "April 2027" was created as
--
--   FROM ('2027-04-01 00:00:00-05') TO ('2027-05-01 00:00:00-05')
--
-- i.e. [Apr 1 05:00Z, May 1 05:00Z). Two consequences:
--   1. Rows from the first UTC hours of each month were silently filed into
--      the PREVIOUS month's partition (present and queryable through the
--      parent — mis-filed, not lost).
--   2. run.ts ensures only the document's UTC month before writing, and that
--      month's partition did not cover 00:00Z–~05:00Z — so on a fresh
--      database, a backfill, or ingest resuming across a month boundary, the
--      first tick of a month failed with "no partition of relation". Only
--      steady-state polling (previous month's partition already present to
--      absorb the boundary rows) hid this.
--
-- Two parts: (a) replace the function so bounds are pinned to UTC instants
-- regardless of session timezone; (b) re-bound every existing partition in
-- place and re-file any rows sitting in the wrong month, counting rows before
-- and after and ABORTING on any mismatch — dev history cannot be backfilled,
-- so a repair that loses or duplicates a row must never commit.
--
-- On a fresh replay this runs right after 003 with zero partitions in
-- existence (they are created lazily by ingest), so part (b) is a no-op and
-- part (a) simply supersedes the buggy function before it ever creates one.

-- (a) UTC-anchored replacement. All month arithmetic happens in UTC
-- *wall-clock* space (`timestamp`, after AT TIME ZONE 'UTC'), and the results
-- are pinned back to instants with an explicit second AT TIME ZONE 'UTC'
-- before they ever meet the DDL — so the session's TimeZone can no longer
-- leak into the bounds. %L then renders those timestamptz values with an
-- explicit offset, which denotes the same instant in any session.
CREATE OR REPLACE FUNCTION ensure_wait_partition(at timestamptz)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  start_wall timestamp   := date_trunc('month', at AT TIME ZONE 'UTC');
  start_ts   timestamptz := start_wall AT TIME ZONE 'UTC';
  end_ts     timestamptz := (start_wall + interval '1 month') AT TIME ZONE 'UTC';
  part       text        := format('wait_observations_%s', to_char(start_wall, 'YYYY_MM'));
BEGIN
  IF to_regclass(part) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF wait_observations FOR VALUES FROM (%L) TO (%L)',
      part, start_ts, end_ts
    );
  END IF;
  RETURN part;
END;
$$;

-- (b) Repair existing partitions. Mechanics, and why this shape:
--
--   1. DETACH every partition FIRST, then trim + re-attach. Correcting one
--      partition at a time cannot work: the corrected bounds of month N
--      ([N 00:00Z, N+1 00:00Z)) overlap the still-offset bounds of month N-1
--      ([N-1 05:00Z, N 05:00Z)), and Postgres rejects overlapping partitions.
--      With everything detached, the corrected ranges are disjoint and attach
--      in any order.
--   2. Every partition is re-bounded unconditionally rather than after
--      parsing pg_get_expr() text to decide whether its bounds are already
--      right — comparing rendered bound expressions across session timezones
--      is exactly the kind of fragility this migration exists to remove, and
--      a detach/re-attach of an already-correct partition is a harmless
--      validation scan at this table's size.
--   3. Rows outside a partition's corrected month are DELETEd into a temp
--      holding table (single statement, so a row leaves its wrong partition
--      and enters the holding table atomically), target months are ensured
--      with the fixed function, and the held rows are re-inserted through the
--      parent. Plain INSERT, no ON CONFLICT: the PK spans partitions' ranges
--      which never overlap, so a duplicate is impossible unless the repair
--      itself is wrong — in which case the unique violation aborts the
--      transaction, which is the correct outcome.
--   4. Row counts through the parent are captured before and after; any
--      difference raises and rolls the whole repair back.
DO $$
DECLARE
  before_count bigint;
  after_count  bigint;
  moved_count  bigint;
  names        text[];
  nm           text;
  start_wall   timestamp;
  want_from    timestamptz;
  want_to      timestamptz;
  mo           timestamp;
BEGIN
  SELECT count(*) INTO before_count FROM wait_observations;

  CREATE TEMP TABLE misfiled_wait_rows ON COMMIT DROP AS
    SELECT * FROM wait_observations LIMIT 0;

  SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}')
    INTO names
  FROM pg_class c
  JOIN pg_inherits i ON i.inhrelid = c.oid
  WHERE i.inhparent = 'wait_observations'::regclass;

  -- Phase 1: detach everything, so corrected bounds cannot collide with
  -- still-offset neighbours.
  FOREACH nm IN ARRAY names LOOP
    IF nm !~ '^wait_observations_\d{4}_\d{2}$' THEN
      RAISE EXCEPTION 'unexpected partition name %, refusing to guess its month', nm;
    END IF;
    EXECUTE format('ALTER TABLE wait_observations DETACH PARTITION %I', nm);
  END LOOP;

  -- Phase 2: per partition, derive the UTC month from the name, pull rows
  -- that do not belong to that month into the holding table, and re-attach
  -- with UTC-anchored bounds.
  FOREACH nm IN ARRAY names LOOP
    start_wall := make_timestamp(
      substring(nm FROM '_(\d{4})_\d{2}$')::int,
      substring(nm FROM '_(\d{2})$')::int,
      1, 0, 0, 0
    );
    want_from := start_wall AT TIME ZONE 'UTC';
    want_to   := (start_wall + interval '1 month') AT TIME ZONE 'UTC';

    EXECUTE format(
      'WITH out_of_month AS (
         DELETE FROM %I WHERE observed_at < %L OR observed_at >= %L RETURNING *
       )
       INSERT INTO misfiled_wait_rows SELECT * FROM out_of_month',
      nm, want_from, want_to
    );

    EXECUTE format(
      'ALTER TABLE wait_observations ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
      nm, want_from, want_to
    );
  END LOOP;

  -- Phase 3: re-file the held rows. A boundary row's true month may have no
  -- partition yet (that absence is this bug's failure mode), so ensure each
  -- target month with the fixed function before inserting — the same call
  -- ingest and backfill make before every write.
  SELECT count(*) INTO moved_count FROM misfiled_wait_rows;
  FOR mo IN
    SELECT DISTINCT date_trunc('month', observed_at AT TIME ZONE 'UTC')
    FROM misfiled_wait_rows
  LOOP
    PERFORM ensure_wait_partition(mo AT TIME ZONE 'UTC');
  END LOOP;

  INSERT INTO wait_observations SELECT * FROM misfiled_wait_rows;

  SELECT count(*) INTO after_count FROM wait_observations;
  IF after_count <> before_count THEN
    RAISE EXCEPTION
      'wait_observations repair would change row count (before %, after %) — aborting',
      before_count, after_count;
  END IF;

  RAISE NOTICE
    'wait_observations partitions re-bounded to UTC months: % partition(s), % row(s) re-filed, % row(s) total (unchanged)',
    coalesce(array_length(names, 1), 0), moved_count, after_count;
END;
$$;
