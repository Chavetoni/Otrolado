-- The model's training set and the source of every number on screen.
--
-- Volume: ~85 crossings x ~7 lane slots x 4 polls/hr ~= 5M rows/yr. That is
-- small for Postgres, so this is plain declarative partitioning + BRIN rather
-- than a Timescale hypertable — same performance at this scale, no extension
-- dependency, portable to any host. Revisit if we ever add per-minute polling
-- or crowdsourced observations, which would move this an order of magnitude.

CREATE TABLE wait_observations (
  -- Snapshot time of the feed document. Partition key.
  observed_at       timestamptz NOT NULL,
  port_id           text        NOT NULL REFERENCES ports (id),
  mode              travel_mode NOT NULL,
  lane              lane_type   NOT NULL,
  direction         direction   NOT NULL,
  status            lane_status NOT NULL,

  -- Non-null only when status = 'open'. Enforced below so a future writer
  -- cannot quietly record "0 min" for a closed or unreported lane.
  wait_minutes      int,
  lanes_open        int,
  max_lanes         int,

  -- When CBP says the officer posted the figure, parsed from update_time
  -- ("At 3:00 pm CDT"). Null when absent or unparseable.
  reported_at       timestamptz,
  -- observed_at - reported_at, clamped at 0. Drives the ESTIMATED badge.
  feed_age_seconds  int CHECK (feed_age_seconds IS NULL OR feed_age_seconds >= 0),

  source            feed_source NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wait_minutes_only_when_open CHECK (
    (status = 'open'  AND wait_minutes IS NOT NULL AND wait_minutes >= 0)
    OR
    (status <> 'open' AND wait_minutes IS NULL)
  ),

  -- Partition key must be in the PK. Re-polling an unchanged feed document
  -- produces an identical row, so ingest is idempotent via ON CONFLICT.
  PRIMARY KEY (observed_at, port_id, mode, lane, direction)
) PARTITION BY RANGE (observed_at);

-- Time-ordered append-only data: BRIN is ~1000x smaller than btree here.
CREATE INDEX wait_observations_brin_idx
  ON wait_observations USING BRIN (observed_at) WITH (pages_per_range = 32);

-- Serves "latest reading per lane" (DISTINCT ON) and the model's per-port
-- history scans.
CREATE INDEX wait_observations_lane_time_idx
  ON wait_observations (port_id, mode, lane, direction, observed_at DESC);

-- Create the month partition covering `at` if it does not exist yet.
-- Called by the ingest worker before each write, and by the backfill script.
CREATE OR REPLACE FUNCTION ensure_wait_partition(at timestamptz)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  start_ts date := date_trunc('month', at AT TIME ZONE 'UTC')::date;
  end_ts   date := (date_trunc('month', at AT TIME ZONE 'UTC') + interval '1 month')::date;
  part     text := format('wait_observations_%s', to_char(start_ts, 'YYYY_MM'));
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
