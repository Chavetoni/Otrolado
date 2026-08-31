import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';
import type { Direction, LaneStatus, LaneType, TravelMode } from '@otrolado/shared';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** DB-defaulted on insert, still writable on update (Generated<> forbids the latter). */
type ManagedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/**
 * Nullable curated column: the feed-tier seed insert omits it (defaults to
 * null), only the curated overlay writes it.
 */
type Curated<T> = ColumnType<T | null, T | null | undefined, T | null>;

export interface PortsTable {
  id: string;
  crossing_name: string;
  display_name: string;
  port_name: string;
  border: 'mexican' | 'canadian';
  lat: number | null;
  lng: number | null;
  /** Zone CBP expresses timestamps in — not always the civil zone. */
  feed_tz: string;
  feed_tz_source: Generated<'curated' | 'inferred'>;
  feed_tz_ambiguous: Generated<boolean>;
  routable: Generated<boolean>;
  modes: TravelMode[];
  hours_text: string;
  open_24h: boolean;
  coords_approximate: boolean;
  /** v4 ground truth (see migration 009): official sources only, null = omit row in UI. */
  webcam_url: Curated<string>;
  webcam_label: Curated<string>;
  line_start_label: Curated<string>;
  line_start_lat: Curated<number>;
  line_start_lng: Curated<number>;
  created_at: ManagedTimestamp;
  updated_at: ManagedTimestamp;
}

export interface WaitObservationsTable {
  observed_at: Timestamp;
  port_id: string;
  mode: TravelMode;
  lane: LaneType;
  direction: Direction;
  status: LaneStatus;
  wait_minutes: number | null;
  lanes_open: number | null;
  max_lanes: number | null;
  reported_at: Timestamp | null;
  feed_age_seconds: number | null;
  source: 'cbp' | 'cbsa';
  ingested_at: Generated<Timestamp>;
}

export interface IngestRunsTable {
  id: Generated<number>;
  source: 'cbp' | 'cbsa';
  started_at: Generated<Timestamp>;
  finished_at: Timestamp | null;
  ok: boolean | null;
  http_status: number | null;
  feed_stamped_at: Timestamp | null;
  records_seen: number | null;
  rows_written: number | null;
  parse_errors: Generated<number>;
  /** The zero-spread canary — non-zero means some feed_tz is wrong. */
  observed_spread_minutes: number | null;
  error: string | null;
}

export interface Database {
  ports: PortsTable;
  wait_observations: WaitObservationsTable;
  ingest_runs: IngestRunsTable;
}

export type PortRow = Selectable<PortsTable>;
export type NewWaitObservation = Insertable<WaitObservationsTable>;
