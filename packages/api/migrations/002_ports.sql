-- ~85 crossings on the CBP feed today (55 Mexican border, 30 Canadian);
-- CBSA adds more. Effectively static: reseeded, never written at runtime.

CREATE TABLE ports (
  id                  text PRIMARY KEY,           -- CBP port_number, e.g. '230402'
  crossing_name       text        NOT NULL,       -- 'Bridge II'
  display_name        text        NOT NULL,       -- 'Juárez–Lincoln Intl'
  port_name           text        NOT NULL,       -- 'Laredo' (CBP city grouping)
  border              text        NOT NULL CHECK (border IN ('mexican', 'canadian')),
  lat                 double precision NOT NULL,
  lng                 double precision NOT NULL,
  tz                  text        NOT NULL,       -- IANA; CBP stamps are port-local
  modes               travel_mode[] NOT NULL,     -- which classes exist here
  hours_text          text        NOT NULL,       -- raw feed string
  open_24h            boolean     NOT NULL,
  -- Hand-approximated coordinates. Must be false before ETAs ship: a wrong
  -- plaza coordinate silently corrupts every drive time to that crossing.
  coords_approximate  boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ports_border_idx ON ports (border);
