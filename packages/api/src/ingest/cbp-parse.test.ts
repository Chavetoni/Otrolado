import { readFileSync } from 'node:fs';
import type { LaneStatus, WaitReading } from '@otrolado/shared';
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../lib/tz.js';
import { parsePort, parseReportedAt, parseSnapshotTime, type RawCbpPort } from './cbp-parse.js';

/**
 * Fixture: one real CBP document (85 records, all 7 lane slots each),
 * fetched 2026-08-31T03:44Z. Every record was generated at the same instant,
 * 2026-08-31T03:41:44Z. It exhibits:
 *  - all five raw lane statuses ('no delay' x95, 'delay' x62, 'N/A' x242,
 *    'Lanes Closed' x91, 'Update Pending' x105);
 *  - Arizona ports published in Mountain Daylight under "MST" labels
 *    (Nogales, San Luis, Lukeville) and in Pacific Daylight under "PST"
 *    (Naco, Douglas);
 *  - a future update_time (San Luis I: stamped 21:41 reporting "At 11:00 pm");
 *  - an hours-stale update_time (Laredo Bridge II: "At 3:00 pm CDT" at 22:41).
 */
const FIXTURE_URL = new URL('./__fixtures__/bwtnew-2026-08-31T034144Z.json', import.meta.url);
const DOC = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as RawCbpPort[];

/** The document instant, 2026-08-31T03:41:44Z, as each feed zone writes it. */
const ZONE_BY_WALL_CLOCK: Record<string, string> = {
  '20:41:44': 'America/Los_Angeles',
  '21:41:44': 'America/Denver',
  '22:41:44': 'America/Chicago',
  '23:41:44': 'America/New_York',
};
const DOC_INSTANT = '2026-08-31T03:41:44.000Z';

function feedTz(r: RawCbpPort): string {
  const tz = ZONE_BY_WALL_CLOCK[r.time];
  if (!tz) throw new Error(`unexpected wall clock ${r.time} in fixture`);
  return tz;
}

function reading(portNumber: string, lane: WaitReading['lane'], mode: WaitReading['mode'] = 'passenger'): WaitReading {
  const raw = DOC.find((p) => p.port_number === portNumber);
  if (!raw) throw new Error(`fixture has no port ${portNumber}`);
  const parsed = parsePort(raw, feedTz(raw));
  const r = parsed?.readings.find((x) => x.lane === lane && x.mode === mode);
  if (!r) throw new Error(`port ${portNumber} has no ${mode}/${lane} reading`);
  return r;
}

describe('parsePort over the whole document', () => {
  const parsed = DOC.map((r) => parsePort(r, feedTz(r)));

  it('parses all 85 records with no nulls', () => {
    expect(DOC).toHaveLength(85);
    expect(parsed.filter((p) => p === null)).toHaveLength(0);
  });

  it('every record resolves to the same instant (zero-spread invariant)', () => {
    // All records in one document describe one instant, so the spread of
    // resolved timestamps is the canary for a wrong feed_tz: 0 when every
    // zone is right, ~60 the moment one is wrong. See run.ts.
    for (const p of parsed) {
      expect(p!.observedAt.toISOString()).toBe(DOC_INSTANT);
    }
  });

  it('the canary fires: parsing Nogales with America/Phoenix shifts it an hour', () => {
    const nogales = DOC.find((r) => r.port_number === '260402')!;
    const wrong = parsePort(nogales, 'America/Phoenix')!;
    expect(wrong.observedAt.getTime() - new Date(DOC_INSTANT).getTime()).toBe(60 * 60 * 1000);
  });

  it('yields 595 readings with the expected status histogram', () => {
    const all = parsed.flatMap((p) => p!.readings);
    expect(all).toHaveLength(595);
    const hist: Partial<Record<LaneStatus, number>> = {};
    for (const r of all) hist[r.status] = (hist[r.status] ?? 0) + 1;
    // open = 95 'no delay' + 62 'delay' (all with figures in this document).
    expect(hist).toEqual({ open: 157, closed: 91, not_available: 242, update_pending: 105 });
  });

  it('wait_minutes is present exactly when the lane is open', () => {
    // Mirrors the wait_minutes_only_when_open CHECK: a closed lane, a missing
    // lane and an overdue report are not 0 minutes.
    for (const r of parsed.flatMap((p) => p!.readings)) {
      if (r.status === 'open') expect(r.waitMinutes).not.toBeNull();
      else expect(r.waitMinutes).toBeNull();
    }
  });

  it('every reading is northbound — southbound is never inferred', () => {
    for (const r of parsed.flatMap((p) => p!.readings)) {
      expect(r.direction).toBe('northbound');
    }
  });

  it('maps the border string per record', () => {
    for (let i = 0; i < DOC.length; i++) {
      const expected = DOC[i]!.border === 'Canadian Border' ? 'canadian' : 'mexican';
      expect(parsed[i]!.border).toBe(expected);
    }
  });
});

describe('known-tricky records', () => {
  it('Blaine Peace Arch standard: a plain measured delay', () => {
    const r = reading('300402', 'standard');
    expect(r).toMatchObject({
      status: 'open',
      waitMinutes: 35,
      lanesOpen: 3,
      maxLanes: 10,
      reportedAt: '2026-08-31T03:00:00.000Z', // 'At 8:00 pm PDT'
      feedAgeSeconds: 2504, // 41m44s — hour-granular stamps sweep 0..~59min
      observedAt: DOC_INSTANT,
    });
  });

  it('San Luis I standard: update_time in the FUTURE is kept, age clamps to 0', () => {
    // Stamped 21:41 local, reporting "At 11:00 pm MST" — 1h18m ahead. Under
    // the 2h threshold it is not rolled back a day, and feed age floors at 0
    // rather than going negative.
    const r = reading('260801', 'standard');
    expect(r.reportedAt).toBe('2026-08-31T05:00:00.000Z');
    expect(r.feedAgeSeconds).toBe(0);
    expect(r.waitMinutes).toBe(60);
  });

  it('Laredo Bridge II standard: an hours-stale report keeps its real age', () => {
    const r = reading('230402', 'standard');
    expect(r.reportedAt).toBe('2026-08-30T20:00:00.000Z'); // 'At 3:00 pm CDT'
    expect(r.feedAgeSeconds).toBe(27704); // 7h41m44s
    expect(r.status).toBe('open');
  });

  it('Point Roberts: Update Pending carries no numbers at all', () => {
    for (const lane of ['standard', 'nexus_sentri', 'ready'] as const) {
      const r = reading('300403', lane);
      expect(r).toMatchObject({
        status: 'update_pending',
        waitMinutes: null,
        lanesOpen: null,
        reportedAt: null,
        feedAgeSeconds: null,
      });
    }
  });

  it('Alexandria Bay: no delay 0 / Lanes Closed / N/A are three different things', () => {
    expect(reading('070801', 'standard')).toMatchObject({ status: 'open', waitMinutes: 0 });
    expect(reading('070801', 'nexus_sentri')).toMatchObject({ status: 'closed', waitMinutes: null });
    expect(reading('070801', 'ready')).toMatchObject({ status: 'not_available', waitMinutes: null });
  });

  it('Nogales Mariposa parses cleanly under America/Denver despite the MST label', () => {
    const r = reading('260402', 'standard');
    expect(r.observedAt).toBe(DOC_INSTANT);
    expect(r.reportedAt).toBe('2026-08-31T03:00:00.000Z'); // 'At 9:00 pm MST' = 21:00 MDT
  });
});

describe('parsePort targeted cases', () => {
  const TZ = 'America/Chicago';

  function makeRaw(lanes: Record<string, unknown>): RawCbpPort {
    return {
      port_number: '999999',
      border: 'Mexican Border',
      port_name: 'Testport',
      crossing_name: 'Test Bridge',
      hours: '24 hrs/day',
      date: '8/30/2026',
      time: '22:41:44',
      port_status: 'Open',
      passenger_vehicle_lanes: { maximum_lanes: '4', ...lanes },
    };
  }

  it("'delay' with no figure demotes to update_pending rather than inventing a number", () => {
    // Real feed shape: operational_status 'delay' with delay_minutes ''. There
    // is no number to show, and 0 would be a lie in the other direction.
    for (const dm of ['', 'N/A'] as const) {
      const parsed = parsePort(makeRaw({
        standard_lanes: { update_time: 'At 10:00 pm CDT', operational_status: 'delay', delay_minutes: dm, lanes_open: '2' },
      }), TZ)!;
      const r = parsed.readings[0]!;
      expect(r.status).toBe('update_pending');
      expect(r.waitMinutes).toBeNull();
    }
  });

  it("'no delay' with a blank figure is a legitimate 0", () => {
    const parsed = parsePort(makeRaw({
      standard_lanes: { update_time: 'At 10:00 pm CDT', operational_status: 'no delay', delay_minutes: '', lanes_open: '2' },
    }), TZ)!;
    expect(parsed.readings[0]).toMatchObject({ status: 'open', waitMinutes: 0 });
  });

  it('an unknown status string is recorded as update_pending, not guessed at', () => {
    const parsed = parsePort(makeRaw({
      standard_lanes: { update_time: '', operational_status: 'Temporarily Suspended', delay_minutes: '15', lanes_open: '1' },
    }), TZ)!;
    expect(parsed.readings[0]).toMatchObject({ status: 'update_pending', waitMinutes: null });
  });

  it('a record with no usable timestamp returns null instead of a guessed time', () => {
    const good = makeRaw({});
    expect(parsePort({ ...good, date: 'not a date' }, TZ)).toBeNull();
    expect(parsePort({ ...good, time: '' }, TZ)).toBeNull();
  });

  it('construction_notice is trimmed to null when blank', () => {
    expect(parsePort({ ...makeRaw({}), construction_notice: '   ' }, TZ)!.constructionNotice).toBeNull();
    expect(parsePort({ ...makeRaw({}), construction_notice: 'lane work' }, TZ)!.constructionNotice).toBe('lane work');
  });
});

describe('parseSnapshotTime', () => {
  it('resolves feed date+time in the port zone', () => {
    expect(parseSnapshotTime('8/30/2026', '22:41:44', 'America/Chicago')!.toISOString())
      .toBe(DOC_INSTANT);
  });

  it('rejects malformed input', () => {
    expect(parseSnapshotTime('2026-08-30', '22:41:44', 'America/Chicago')).toBeNull();
    expect(parseSnapshotTime('8/30/2026', '22:41', 'America/Chicago')).toBeNull();
  });
});

describe('parseReportedAt', () => {
  const TZ = 'America/Chicago';

  it('resolves against the snapshot local date', () => {
    const snapshot = zonedToUtc(2026, 8, 30, 22, 41, 44, TZ);
    expect(parseReportedAt('At 10:00 pm CDT', snapshot, TZ)!.toISOString())
      .toBe('2026-08-31T03:00:00.000Z');
  });

  it('rolls a stamp more than 2h in the future back a day', () => {
    // A 00:30 snapshot reading "At 11:00 pm" is yesterday evening's report,
    // not one 22.5 hours from now.
    const snapshot = zonedToUtc(2026, 8, 31, 0, 30, 0, TZ);
    expect(parseReportedAt('At 11:00 pm CDT', snapshot, TZ)!.toISOString())
      .toBe('2026-08-31T04:00:00.000Z'); // Aug 30 23:00 CDT
  });

  it('keeps a small forward skew — the observed hour-boundary feed quirk', () => {
    // Observed live: a port stamped 16:49 local reporting "At 5:00 pm".
    const snapshot = zonedToUtc(2026, 8, 30, 16, 49, 0, TZ);
    expect(parseReportedAt('At 5:00 pm CDT', snapshot, TZ)!.toISOString())
      .toBe('2026-08-30T22:00:00.000Z');
  });

  it('handles 12 am and 12 pm', () => {
    const midnightish = zonedToUtc(2026, 8, 31, 0, 30, 0, TZ);
    expect(parseReportedAt('At 12:00 am CDT', midnightish, TZ)!.toISOString())
      .toBe('2026-08-31T05:00:00.000Z');
    const midday = zonedToUtc(2026, 8, 30, 12, 49, 0, TZ);
    expect(parseReportedAt('At 12:00 pm CDT', midday, TZ)!.toISOString())
      .toBe('2026-08-30T17:00:00.000Z');
  });

  it('returns null for blank or unparseable stamps', () => {
    const snapshot = zonedToUtc(2026, 8, 30, 22, 41, 44, TZ);
    expect(parseReportedAt('', snapshot, TZ)).toBeNull();
    expect(parseReportedAt(undefined, snapshot, TZ)).toBeNull();
    expect(parseReportedAt('N/A', snapshot, TZ)).toBeNull();
  });
});
