-- The webcam label IS the provenance ("TxDOT cam · I-35 S at the bridge ·
-- refreshed ~1 min"): a URL without it renders a camera with no attribution,
-- a label without a URL promises a view it can't open. Same both-or-neither
-- rule the line-start coordinate pair already has (migration 009).
ALTER TABLE ports ADD CONSTRAINT ports_webcam_pair
  CHECK ((webcam_url IS NULL) = (webcam_label IS NULL));
