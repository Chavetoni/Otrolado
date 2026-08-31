-- Feed health is THE metric (engineering plan §9). Every poll is recorded
-- whether it succeeded or not, so "the feed went quiet at 03:00" is answerable
-- from the database rather than from logs. This table is what the staleness
-- banner, the ESTIMATED badge and the ops alerting all read from.

CREATE TABLE ingest_runs (
  id              bigserial PRIMARY KEY,
  source          feed_source NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  ok              boolean,
  http_status     int,
  -- Feed document's own snapshot time, not our clock.
  feed_stamped_at timestamptz,
  records_seen    int,
  rows_written    int,
  parse_errors    int NOT NULL DEFAULT 0,
  error           text
);

CREATE INDEX ingest_runs_source_time_idx ON ingest_runs (source, started_at DESC);
