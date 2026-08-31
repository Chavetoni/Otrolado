import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RawCbpPort } from './cbp-parse.js';
import { firstUpdateTime, inferTimezone } from './infer-tz.js';

/**
 * Fixture: one real CBP document, fetched 2026-08-31T03:44Z (evening of
 * Aug 30 border-local). Every record was generated at the same instant,
 * 2026-08-31T03:41:44Z, so the four wall clocks in it are just that instant
 * in PDT/MDT/CDT/EDT — exactly the property zone recovery relies on. It
 * includes the Arizona quirks this module exists for: Nogales, San Luis and
 * Lukeville read 21:41:44 (Mountain *Daylight*) while their update_time
 * strings say "MST", and Naco/Douglas read 20:41:44 (Pacific Daylight) while
 * labelled "PST".
 */
const FIXTURE_URL = new URL('./__fixtures__/bwtnew-2026-08-31T034144Z.json', import.meta.url);
const DOC = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as RawCbpPort[];
const FETCHED_AT = new Date('2026-08-31T03:44:00Z');

function record(portNumber: string): RawCbpPort {
  const r = DOC.find((p) => p.port_number === portNumber);
  if (!r) throw new Error(`fixture has no port ${portNumber}`);
  return r;
}

function infer(r: RawCbpPort) {
  return inferTimezone({
    date: r.date,
    time: r.time,
    abbreviationHint: firstUpdateTime(r as unknown as Record<string, unknown>),
    fetchedAt: FETCHED_AT,
  });
}

describe('inferTimezone against a real document', () => {
  /** The instant 2026-08-31T03:41:44Z, as each feed zone writes it. */
  const ZONE_BY_WALL_CLOCK: Record<string, string> = {
    '20:41:44': 'America/Los_Angeles',
    '21:41:44': 'America/Denver',
    '22:41:44': 'America/Chicago',
    '23:41:44': 'America/New_York',
  };

  it('resolves every record in the document, unambiguously', () => {
    for (const r of DOC) {
      const result = infer(r);
      expect(result, `port ${r.port_number} (${r.port_name})`).not.toBeNull();
      expect(result!.ambiguous, `port ${r.port_number} needed a tie-break`).toBe(false);
      expect(result!.tz, `port ${r.port_number}`).toBe(ZONE_BY_WALL_CLOCK[r.time]);
    }
  });

  it('Nogales resolves to America/Denver despite its "MST" label', () => {
    // CBP applies daylight time uniformly: Arizona crossings are expressed in
    // Mountain Daylight (UTC-6) even though Arizona observes no DST, and even
    // though the feed's own string says "MST". America/Phoenix would parse
    // every one of these an hour wrong.
    const nogales = record('260401');
    expect(nogales.time).toBe('21:41:44');
    expect(firstUpdateTime(nogales as unknown as Record<string, unknown>)).toContain('MST');
    expect(infer(nogales)).toEqual({ tz: 'America/Denver', ambiguous: false });
  });

  it('San Luis and Lukeville resolve to America/Denver the same way', () => {
    for (const id of ['260801', '260201']) {
      expect(infer(record(id))!.tz, `port ${id}`).toBe('America/Denver');
    }
  });

  it('Naco and Douglas are expressed in Pacific Daylight despite "PST" labels', () => {
    // CBP is not even internally consistent about Arizona: these two publish
    // Pacific wall clocks. The zone comes from the clock, never the label.
    for (const id of ['260301', '260101']) {
      const r = record(id);
      expect(r.time).toBe('20:41:44');
      expect(infer(r)!.tz, `port ${id}`).toBe('America/Los_Angeles');
    }
  });
});

describe('the America/Phoenix exclusion', () => {
  // These two tests are the tripwire for re-adding America/Phoenix to the
  // candidate list. Phoenix is UTC-7 year round: in summer it collides with
  // Pacific Daylight, in winter with Mountain Standard. With it excluded,
  // both cases resolve to exactly one candidate (ambiguous: false); the
  // moment someone adds it back, a second zone fits and ambiguous flips true.

  it('a summer Pacific wall clock fits exactly one zone', () => {
    const result = inferTimezone({
      date: '8/30/2026',
      time: '20:41:44',
      fetchedAt: FETCHED_AT,
    });
    expect(result).toEqual({ tz: 'America/Los_Angeles', ambiguous: false });
  });

  it('a winter Mountain wall clock fits exactly one zone', () => {
    const result = inferTimezone({
      date: '1/15/2026',
      time: '19:00:00',
      fetchedAt: new Date('2026-01-16T02:00:00Z'),
    });
    expect(result).toEqual({ tz: 'America/Denver', ambiguous: false });
  });
});

describe('inferTimezone edge cases', () => {
  it('returns null for malformed date or time', () => {
    expect(inferTimezone({ date: 'not a date', time: '20:41:44', fetchedAt: FETCHED_AT })).toBeNull();
    expect(inferTimezone({ date: '8/30/2026', time: '', fetchedAt: FETCHED_AT })).toBeNull();
  });

  it('returns null when no candidate zone lands near the fetch time', () => {
    // 18:00 is at least ~90 min from 03:44Z in every candidate zone — a wall
    // clock that far off means the document and our clock disagree, and
    // guessing a zone would archive history into the wrong hour.
    expect(inferTimezone({ date: '8/30/2026', time: '18:00:00', fetchedAt: FETCHED_AT })).toBeNull();
  });
});

describe('firstUpdateTime', () => {
  it('finds the first non-empty update_time across lane groups', () => {
    const blaine = record('300402');
    expect(firstUpdateTime(blaine as unknown as Record<string, unknown>)).toBe('At 8:00 pm PDT');
  });

  it('returns undefined when every update_time is blank', () => {
    expect(firstUpdateTime({})).toBeUndefined();
  });
});
