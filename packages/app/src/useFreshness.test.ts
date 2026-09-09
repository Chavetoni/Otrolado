import { describe, expect, it } from 'vitest';
import { reAgeWaits, reportedAgeSeconds } from './useFreshness';
import { HIDALGO, OBSERVED_AT, open, waits } from './__fixtures__/waits';

const MIN = 60_000;
/** We fetched one minute after CBP's reading was observed. */
const FETCHED_AT = Date.parse(OBSERVED_AT) + MIN;
const laneAt = (doc: ReturnType<typeof waits>, nowMs: number) =>
  reAgeWaits(doc, FETCHED_AT, nowMs).ports[0]!.lanes[0]!;

describe('reAgeWaits', () => {
  const doc = waits({ [HIDALGO]: [open(20)] }, { ingestAgeSeconds: 60 });

  it('degrades live → estimated → stale purely from sitting time', () => {
    expect(laneAt(doc, FETCHED_AT).freshness).toBe('live');
    expect(laneAt(doc, FETCHED_AT + 40 * MIN).freshness).toBe('estimated');
    expect(laneAt(doc, FETCHED_AT + 50 * MIN).freshness).toBe('stale');
  });

  it('takes the worse of ingest age and reading age, and null ingest age is stale', () => {
    // Fresh poll, old reading: CBP dropped this lane from the document.
    const oldReading = waits({ [HIDALGO]: [open(20, { observedAt: new Date(FETCHED_AT - 50 * MIN).toISOString() })] }, { ingestAgeSeconds: 60 });
    expect(laneAt(oldReading, FETCHED_AT).freshness).toBe('stale');
    // Old poll, fresh reading: our ingest stalled.
    const oldPoll = waits({ [HIDALGO]: [open(20)] }, { ingestAgeSeconds: 50 * 60 });
    expect(laneAt(oldPoll, FETCHED_AT).freshness).toBe('stale');
    // No successful poll on record at all.
    const never = waits({ [HIDALGO]: [open(20)] }, { ingestAgeSeconds: null });
    expect(laneAt(never, FETCHED_AT).freshness).toBe('stale');
    expect(reAgeWaits(never, FETCHED_AT, FETCHED_AT + MIN).ingestAgeSeconds).toBeNull();
  });

  it('clamps a fetch "in the future" to zero sitting time', () => {
    expect(reAgeWaits(doc, FETCHED_AT, FETCHED_AT - MIN).ingestAgeSeconds).toBe(60);
  });

  it("does not gate on CBP's hour-granular feed age", () => {
    const skewed = waits({ [HIDALGO]: [open(20, { feedAgeSeconds: 55 * 60 })] }, { ingestAgeSeconds: 60 });
    expect(laneAt(skewed, FETCHED_AT).freshness).toBe('live');
  });
});

describe('reportedAgeSeconds', () => {
  it('is 0 for a stamp in the future and null for an unparseable one', () => {
    expect(reportedAgeSeconds({ reportedAt: '2026-09-05T16:00:00Z' }, Date.parse('2026-09-05T15:00:00Z'))).toBe(0);
    expect(reportedAgeSeconds({ reportedAt: 'At 3:00 pm' }, Date.now())).toBeNull();
    expect(reportedAgeSeconds({ reportedAt: null }, Date.now())).toBeNull();
  });
});
