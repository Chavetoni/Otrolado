-- Persist the zero-spread canary.
--
-- Every record in one CBP document describes the same instant, so the spread
-- between the earliest and latest resolved timestamps is 0 when every
-- crossing's feed_tz is right — and jumps to ~60 the moment one is wrong.
-- Until now the value was computed every tick but lived only in process logs,
-- which made "when did the spread first go non-zero" unanswerable after the
-- fact. That question matters more here than for any other metric: history
-- written under a wrong zone lands in the wrong hour and cannot be repaired
-- once archived, so the *first* bad tick bounds the corrupted range.
--
-- Nullable: failed runs (fetch error, degenerate document) have no spread to
-- record, and rows predating this migration never measured one.

ALTER TABLE ingest_runs ADD COLUMN observed_spread_minutes int;

COMMENT ON COLUMN ingest_runs.observed_spread_minutes IS
  'Minutes between earliest and latest resolved timestamps in one feed '
  'document. All records share one instant, so non-zero means some feed_tz '
  'is wrong and history is being archived into the wrong hour.';
