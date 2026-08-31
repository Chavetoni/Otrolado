import type { Direction, LaneStatus, LaneType, TravelMode, WaitReading } from '@otrolado/shared';
import { localParts, zonedToUtc } from '../lib/tz.js';

/** Raw feed shapes. Every value arrives as a string, including numbers. */
interface RawLane {
  update_time?: string;
  operational_status?: string;
  delay_minutes?: string;
  lanes_open?: string;
}
interface RawGroup {
  maximum_lanes?: string;
  [k: string]: unknown;
}
export interface RawCbpPort {
  port_number: string;
  border: string;
  port_name: string;
  crossing_name: string;
  hours: string;
  date: string;   // 'M/D/YYYY', port-local
  time: string;   // 'HH:MM:SS', port-local
  port_status: string;
  construction_notice?: string;
  commercial_vehicle_lanes?: RawGroup;
  passenger_vehicle_lanes?: RawGroup;
  pedestrian_lanes?: RawGroup;
}

/**
 * Which lane keys live under which group. CBP reports each of these
 * independently — a Ready Lane wait is a measured number, not a multiple of
 * the standard wait.
 */
const GROUPS: ReadonlyArray<{
  key: keyof RawCbpPort & string;
  mode: TravelMode;
  lanes: ReadonlyArray<readonly [string, LaneType]>;
}> = [
  {
    key: 'passenger_vehicle_lanes',
    mode: 'passenger',
    lanes: [
      ['standard_lanes', 'standard'],
      ['NEXUS_SENTRI_lanes', 'nexus_sentri'],
      ['ready_lanes', 'ready'],
    ],
  },
  {
    key: 'pedestrian_lanes',
    mode: 'pedestrian',
    lanes: [
      ['standard_lanes', 'standard'],
      ['ready_lanes', 'ready'],
    ],
  },
  {
    key: 'commercial_vehicle_lanes',
    mode: 'commercial',
    lanes: [
      ['standard_lanes', 'standard'],
      ['FAST_lanes', 'fast'],
    ],
  },
];

/** The five states CBP actually emits, normalised. */
function toStatus(operational: string | undefined): LaneStatus {
  const s = (operational ?? '').trim().toLowerCase();
  switch (s) {
    case 'no delay':
    case 'delay':
      return 'open';
    case 'lanes closed':
      return 'closed';
    case 'update pending':
      return 'update_pending';
    case 'n/a':
    case '':
      return 'not_available';
    default:
      // Unknown status: refuse to guess. Recorded as unreported rather than
      // silently mapped to a number.
      return 'update_pending';
  }
}

function toInt(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === '' || t.toUpperCase() === 'N/A') return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/** 'M/D/YYYY' + 'HH:MM:SS' in port-local time -> instant. */
export function parseSnapshotTime(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  return zonedToUtc(
    Number(d[3]), Number(d[1]), Number(d[2]),
    Number(t[1]), Number(t[2]), Number(t[3]), tz,
  );
}

/**
 * 'At 3:00 pm CDT' -> instant, resolved against the snapshot's local date.
 *
 * Caveat worth knowing before trusting the result: CBP posts this at HOUR
 * granularity, and it is occasionally AHEAD of the snapshot clock (observed:
 * a port stamped 16:49 local reporting "At 5:00 pm"). So the derived age is a
 * coarse ±1h signal, not a precise one — see freshness.ts, which is why the
 * staleness policy does not rest on this value alone.
 */
export function parseReportedAt(updateTime: string | undefined, snapshot: Date, tz: string): Date | null {
  const raw = (updateTime ?? '').trim();
  if (!raw) return null;
  const m = /^at\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/i.exec(raw);
  if (!m) return null;

  let hour = Number(m[1]) % 12;
  if (m[3]!.toLowerCase() === 'pm') hour += 12;

  const { y, mo, d } = localParts(snapshot, tz);
  let at = zonedToUtc(y, mo, d, hour, Number(m[2]), 0, tz);

  // A report more than 2h in the future almost certainly belongs to yesterday
  // (late-evening snapshot reading an early-morning stamp). Small forward
  // skews are a known feed quirk and are left to be clamped downstream.
  if (at.getTime() - snapshot.getTime() > 2 * 60 * 60 * 1000) {
    at = new Date(at.getTime() - 24 * 60 * 60 * 1000);
  }
  return at;
}

export interface ParsedPort {
  readonly portId: string;
  readonly crossingName: string;
  readonly portName: string;
  readonly border: 'mexican' | 'canadian';
  readonly hoursText: string;
  readonly portStatus: string;
  readonly constructionNotice: string | null;
  readonly observedAt: Date;
  readonly readings: readonly WaitReading[];
}

/**
 * One feed record -> its readings.
 *
 * `tz` must be the crossing's own zone; without it the snapshot timestamp is
 * meaningless. Returns null when the record has no usable timestamp, so a
 * malformed record is dropped and counted rather than written with a guessed
 * time.
 */
export function parsePort(raw: RawCbpPort, tz: string): ParsedPort | null {
  const observedAt = parseSnapshotTime(raw.date, raw.time, tz);
  if (!observedAt) return null;

  const border: 'mexican' | 'canadian' =
    raw.border.toLowerCase().includes('canad') ? 'canadian' : 'mexican';

  // CBP publishes US-bound waits only. Southbound has no federal feed and is
  // never inferred here — see LIMITS.southbound.
  const direction: Direction = 'northbound';

  const readings: WaitReading[] = [];
  for (const group of GROUPS) {
    const g = raw[group.key] as RawGroup | undefined;
    if (!g) continue;
    const maxLanes = toInt(g.maximum_lanes);

    for (const [laneKey, lane] of group.lanes) {
      const rawLane = g[laneKey] as RawLane | undefined;
      if (!rawLane) continue;

      let status = toStatus(rawLane.operational_status);
      const delay = toInt(rawLane.delay_minutes);

      // 'delay' with no figure attached is not a number we can show. Demote
      // rather than invent one.
      let waitMinutes: number | null = null;
      if (status === 'open') {
        const isNoDelay = (rawLane.operational_status ?? '').trim().toLowerCase() === 'no delay';
        if (isNoDelay) waitMinutes = delay ?? 0;
        else if (delay !== null) waitMinutes = delay;
        else status = 'update_pending';
      }

      const reportedAt = parseReportedAt(rawLane.update_time, observedAt, tz);
      const feedAgeSeconds = reportedAt
        ? Math.max(0, Math.round((observedAt.getTime() - reportedAt.getTime()) / 1000))
        : null;

      readings.push({
        portId: raw.port_number,
        mode: group.mode,
        lane,
        direction,
        status,
        waitMinutes,
        lanesOpen: toInt(rawLane.lanes_open),
        maxLanes,
        reportedAt: reportedAt ? reportedAt.toISOString() : null,
        observedAt: observedAt.toISOString(),
        feedAgeSeconds,
        source: 'cbp',
      });
    }
  }

  const notice = (raw.construction_notice ?? '').trim();
  return {
    portId: raw.port_number,
    crossingName: raw.crossing_name,
    portName: raw.port_name,
    border,
    hoursText: raw.hours,
    portStatus: raw.port_status,
    constructionNotice: notice === '' ? null : notice,
    observedAt,
    readings,
  };
}
