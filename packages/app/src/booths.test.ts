import { describe, expect, it } from 'vitest';
import { boothBreakdown } from './booths';
import { closed, open, pending, READY, SENTRI } from './__fixtures__/waits';

describe('boothBreakdown', () => {
  /**
   * The case the whole module exists for, from the live feed on 2026-09-15:
   * Hidalgo publishes `maximum_lanes: 12` once for the passenger group, with
   * standard 2, SENTRI 2 and Ready 3 open. Seven booths are staffed. Pairing
   * the standard lane's own `lanesOpen` with the group max would report "2 of
   * 12" and leave five staffed booths looking shut.
   */
  it('splits a group max around the ranked lane', () => {
    const std = open(15, { lanesOpen: 2, maxLanes: 12 });
    const lanes = [
      std,
      open(0, { ...SENTRI, lanesOpen: 2, maxLanes: 12 }),
      open(10, { ...READY, lanesOpen: 3, maxLanes: 12 }),
    ];
    expect(boothBreakdown(lanes, std)).toEqual({ max: 12, onLane: 2, onOther: 3 + 2, closed: 5 });
  });

  it('always sums the three buckets to max', () => {
    const std = open(15, { lanesOpen: 1, maxLanes: 8 });
    const b = boothBreakdown([std, open(0, { ...SENTRI, lanesOpen: 2, maxLanes: 8 })], std)!;
    expect(b.onLane + b.onOther + b.closed).toBe(b.max);
  });

  /**
   * `maximum_lanes` is the literal string "N/A" for the pedestrian group at 5
   * of the 11 pilot crossings, which parses to null. No count means no strip —
   * never a strip of closed booths, which would assert the plaza is shut.
   */
  it('is null when CBP publishes no booth count', () => {
    const std = open(15, { lanesOpen: 2, maxLanes: null });
    expect(boothBreakdown([std], std)).toBeNull();
  });

  it('is null for a nonsensical max rather than drawing an empty track', () => {
    const std = open(15, { lanesOpen: 0, maxLanes: 0 });
    expect(boothBreakdown([std], std)).toBeNull();
  });

  /**
   * A closed standard lane still has a plaza, and its other lanes may be the
   * reason to keep the row: "standard is shut, three Ready booths are open" is
   * exactly the sentence the strip should be able to draw.
   */
  it('keeps the plaza when the ranked lane is closed', () => {
    const std = closed({ maxLanes: 5 });
    const lanes = [std, open(10, { ...READY, lanesOpen: 3, maxLanes: 5 })];
    expect(boothBreakdown(lanes, std)).toEqual({ max: 5, onLane: 0, onOther: 3, closed: 2 });
  });

  it('recovers max from a sibling lane when the ranked lane is missing', () => {
    const lanes = [open(10, { ...READY, lanesOpen: 3, maxLanes: 5 })];
    expect(boothBreakdown(lanes, null)).toEqual({ max: 5, onLane: 0, onOther: 3, closed: 2 });
  });

  /**
   * The bug the simulator caught on 2026-09-16. At 00:00 local CBP flips every
   * pilot port to "Update Pending" with an empty `lanes_open`, and treating
   * that empty string as 0 drew a full track of closed booths reading
   * "0/12 standard" — an invented figure, and the most alarming one on offer,
   * on a screen whose entire premise is never doing that. CBP has not said how
   * many booths are open, so the strip says nothing.
   */
  it('draws nothing when CBP has posted no figure for the ranked lane', () => {
    const std = pending({ maxLanes: 12 });
    expect(boothBreakdown([std], std)).toBeNull();
  });

  /**
   * A sibling's missing count would land in the remainder and be drawn as a
   * closed booth, so the strip would assert closures CBP never reported.
   */
  it('draws nothing when a sibling lane has no figure', () => {
    const std = open(15, { lanesOpen: 2, maxLanes: 12 });
    expect(boothBreakdown([std, pending({ ...SENTRI, maxLanes: 12 })], std)).toBeNull();
  });

  /**
   * The other empty `lanes_open`: a lane CBP reports as CLOSED really does
   * have zero booths, and a lane that does not exist at this crossing has
   * zero of the group's booths serving it. Both are facts, not gaps.
   */
  it('counts a closed or absent lane as a real zero', () => {
    const std = open(15, { lanesOpen: 2, maxLanes: 6 });
    const lanes = [
      std,
      closed({ ...SENTRI, maxLanes: 6 }),
      { ...open(0, READY), status: 'not_available', waitMinutes: null, lanesOpen: null, maxLanes: 6 },
    ] as const;
    expect(boothBreakdown(lanes, std)).toEqual({ max: 6, onLane: 2, onOther: 0, closed: 4 });
  });

  /**
   * `lanes_open` and `maximum_lanes` are independent fields, so nothing in the
   * feed guarantees they agree. They must never produce more pills than the
   * track has booths.
   */
  it('clamps when the open counts exceed the group max', () => {
    const std = open(15, { lanesOpen: 3, maxLanes: 4 });
    const lanes = [std, open(0, { ...SENTRI, lanesOpen: 3, maxLanes: 4 })];
    const b = boothBreakdown(lanes, std)!;
    expect(b).toEqual({ max: 4, onLane: 3, onOther: 1, closed: 0 });
    expect(b.onLane + b.onOther + b.closed).toBe(b.max);
  });
});
