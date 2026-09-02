-- CBP's own historical hour-by-weekday wait averages, imported from the
-- bwt.cbp.gov historical API (api/historicalwaittimes). Bridges the cold
-- start: the "typical wait" table and chart can render from this today,
-- attributed to CBP, until ~6 weeks of our own archive exists and our
-- status-aware medians from wait_observations supersede it.
--
-- What these numbers are, per CBP's own disclosure on bwt.cbp.gov/historical:
-- "Averages are based on data from previous year" — last year's mean for that
-- calendar month, weekday and hour. A climatology, not a forecast. Anything
-- rendered from this table must say it is a CBP historical average; it must
-- never blend silently with live numbers or wear our forecast's label.
--
-- Absence of a row is meaningful: ports that are not open 24h simply have no
-- rows for closed hours (CBP omits them), and all-zero (mode, lane, month)
-- series are dropped at import — CBP reports a lane class that does not
-- exist (or did not exist those months) as zeros, which would otherwise read
-- as "0 min" for a lane with no history.

CREATE TABLE typical_waits (
  port_id           text        NOT NULL REFERENCES ports (id),
  mode              travel_mode NOT NULL,
  lane              lane_type   NOT NULL,
  -- Calendar month the average describes, 1-12.
  month             int         NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- ISO day of week, 1 = Monday .. 7 = Sunday (CBP's feed uses 0 = Monday;
  -- the importer converts so this matches EXTRACT(ISODOW) and Luxon).
  dow               int         NOT NULL CHECK (dow BETWEEN 1 AND 7),
  -- Port-local hour of day, 0-23.
  hour              int         NOT NULL CHECK (hour BETWEEN 0 AND 23),
  avg_wait_minutes  int         NOT NULL CHECK (avg_wait_minutes >= 0),

  source            feed_source NOT NULL DEFAULT 'cbp',
  imported_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (port_id, mode, lane, month, dow, hour)
);
