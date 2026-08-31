-- `tz` was a lie by omission: what we store is the zone CBP EXPRESSES its
-- timestamps in, which is not always the crossing's civil timezone.
--
-- Verified against the live feed: CBP applies daylight time uniformly, so
-- Arizona crossings (Nogales, San Luis, Lukeville) are published in Mountain
-- Daylight (UTC-6) even though Arizona does not observe DST and its real zone
-- is America/Phoenix (UTC-7 year round). Parsing those records with the
-- geographically correct zone shifts every reading by an hour.
--
-- Renamed so nobody reaches for this column to render a crossing's local
-- clock. When the pilot expands into Arizona, a separate curated `local_tz`
-- will be needed for port hours and forecast hour labels.

ALTER TABLE ports RENAME COLUMN tz TO feed_tz;
ALTER TABLE ports RENAME COLUMN tz_source TO feed_tz_source;
ALTER TABLE ports RENAME COLUMN tz_ambiguous TO feed_tz_ambiguous;

COMMENT ON COLUMN ports.feed_tz IS
  'Zone CBP expresses this crossing''s timestamps in. NOT necessarily the '
  'crossing''s civil timezone — CBP publishes Arizona in Mountain Daylight.';
