-- Widen the directory from the Laredo pilot to every crossing CBP reports.
--
-- The archive is the long pole for the prediction model: history cannot be
-- backfilled, and ingesting all ~85 crossings costs exactly the same as
-- ingesting 4 (one feed call either way). The UI stays scoped to the pilot;
-- only collection widens.

-- We have surveyed coordinates for nothing outside the pilot, and (0,0) is a
-- real place in the Atlantic. Null means "unknown", which is the truth.
ALTER TABLE ports ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE ports ALTER COLUMN lng DROP NOT NULL;

-- A crossing without coordinates cannot be routed to or mapped. Making that
-- explicit stops it being discovered as a null-pointer surprise later.
ALTER TABLE ports ADD COLUMN routable boolean NOT NULL DEFAULT false;

-- CBP publishes no timezone; ours is inferred from the feed's own local
-- timestamps (see ingest/infer-tz.ts). Record how we got it, because a wrong
-- zone silently shifts every timestamp for that crossing by whole hours.
ALTER TABLE ports ADD COLUMN tz_source text NOT NULL DEFAULT 'inferred'
  CHECK (tz_source IN ('curated', 'inferred'));
ALTER TABLE ports ADD COLUMN tz_ambiguous boolean NOT NULL DEFAULT false;

UPDATE ports SET routable = true, tz_source = 'curated' WHERE lat IS NOT NULL;

CREATE INDEX ports_routable_idx ON ports (routable) WHERE routable;
