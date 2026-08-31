-- Domain enums.
--
-- These mirror the CBP feed's own distinctions. The important one is
-- lane_status: CBP reports five states, and three of them are NOT a number.
-- Modelling wait as a bare nullable int loses the difference between "this
-- crossing has no SENTRI lane", "SENTRI is closed right now", and "SENTRI is
-- open but the officer hasn't posted a figure" — which are three different
-- things to show a user, none of them "0 min".

CREATE TYPE travel_mode AS ENUM ('passenger', 'pedestrian', 'commercial');

CREATE TYPE lane_type AS ENUM ('standard', 'nexus_sentri', 'ready', 'fast');

CREATE TYPE direction AS ENUM ('northbound', 'southbound');

CREATE TYPE lane_status AS ENUM (
  'open',            -- reporting; wait_minutes is meaningful (0 is valid)
  'closed',          -- lane exists, currently closed
  'update_pending',  -- lane exists and is open, no current figure posted
  'not_available'    -- no lane of this class at this crossing
);

CREATE TYPE feed_source AS ENUM ('cbp', 'cbsa');
