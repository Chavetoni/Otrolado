-- v4 "ground truth" fields: a link-out webcam and where the northbound queue
-- usually starts. Curated per port by hand (verifiable official sources only —
-- TxDOT / city bridge authorities), never derived from the feed, so the seed's
-- curated overlay is the only writer. Null is the designed state: the UI omits
-- the row entirely rather than render a placeholder or an unverified source.

ALTER TABLE ports ADD COLUMN webcam_url        text;
ALTER TABLE ports ADD COLUMN webcam_label      text;             -- attribution + cadence copy
ALTER TABLE ports ADD COLUMN line_start_label  text;             -- Mexican-side street/landmark
ALTER TABLE ports ADD COLUMN line_start_lat    double precision;
ALTER TABLE ports ADD COLUMN line_start_lng    double precision;

-- A half-coordinate cannot be navigated to; forbid it rather than discover it
-- as a runtime surprise in the maps deep-link.
ALTER TABLE ports ADD CONSTRAINT ports_line_start_coord_pair
  CHECK ((line_start_lat IS NULL) = (line_start_lng IS NULL));
