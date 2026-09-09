import { describe, expect, it } from 'vitest';
import {
  clampToDay,
  formatMinutes,
  laneOf,
  minutesLate,
  planOptions,
  resolveSavedTrip,
  solveTrip,
  tripIsForToday,
} from './trip';
import {
  ANZALDUAS,
  closed,
  GATEWAY,
  HIDALGO,
  open,
  pending,
  PHARR,
  ranked,
  row,
  SENTRI,
  WALK,
  withDrive,
} from './__fixtures__/waits';

const ids = (plan: ReturnType<typeof solveTrip>) => planOptions(plan!).map((o) => o.port.id);

describe('solveTrip — lane selection', () => {
  it('never plans through a closed standard lane', () => {
    const plan = solveTrip(ranked({ [HIDALGO]: [closed()], [PHARR]: [open(20)] }), 1080);
    expect(ids(plan)).toEqual([PHARR]);
  });

  it('never plans through an overdue lane — update_pending is not 0 min', () => {
    const plan = solveTrip(ranked({ [HIDALGO]: [pending()], [PHARR]: [open(20)] }), 1080);
    expect(ids(plan)).toEqual([PHARR]);
  });

  it('SENTRI excludes crossings with no SENTRI lane and ones whose SENTRI is closed', () => {
    const rows = ranked({
      [HIDALGO]: [open(60), open(5, SENTRI)],
      [PHARR]: [open(20)],
      [ANZALDUAS]: [open(30), closed(SENTRI)],
    });
    const plan = solveTrip(rows, 1080, 'sentri');
    expect(ids(plan)).toEqual([HIDALGO]);
    expect(plan!.lane).toBe('sentri');
    expect(plan!.best.waitMinutes).toBe(5);
  });

  it('laneOf refuses a lane whose mode does not match the trip lane', () => {
    const passengerRows = ranked({ [GATEWAY]: [open(10)] });
    expect(laneOf(row(passengerRows, GATEWAY), 'walking')).toBeNull();
    const walkRows = ranked({ [GATEWAY]: [open(10, WALK)] }, { mode: 'pedestrian' });
    expect(laneOf(row(walkRows, GATEWAY), 'walking')?.mode).toBe('pedestrian');
  });

  it('returns null, not an empty plan, when nothing is usable', () => {
    expect(solveTrip(ranked({ [HIDALGO]: [closed()], [PHARR]: [pending()] }), 1080)).toBeNull();
    expect(solveTrip([], 1080)).toBeNull();
  });
});

describe('solveTrip — arithmetic and order', () => {
  it('leave-by = target − drive − wait, with no buffer or clearance', () => {
    const r = withDrive(row(ranked({ [HIDALGO]: [open(35)] }), HIDALGO), 20);
    const plan = solveTrip([r], 1080)!;
    expect(plan.best.leaveMinutes).toBe(1025);
    expect(plan.best.atBridgeMinutes).toBe(1045);
    expect(plan.best.acrossMinutes).toBe(1080);
  });

  it('sorts latest leave-by first and breaks ties on the shorter line', () => {
    const rows = ranked({ [HIDALGO]: [open(30)], [PHARR]: [open(20)], [ANZALDUAS]: [open(50)] });
    const plan = solveTrip(
      [
        withDrive(row(rows, HIDALGO), 10), // leave 1040, wait 30
        withDrive(row(rows, PHARR), 20), // leave 1040, wait 20 — wins the tie
        withDrive(row(rows, ANZALDUAS), 5), // leave 1025
      ],
      1080,
    );
    expect(ids(plan)).toEqual([PHARR, HIDALGO, ANZALDUAS]);
  });

  it('worstFreshness is judged over the candidates only', () => {
    const rows = ranked({ [HIDALGO]: [open(20)], [PHARR]: [closed({ freshness: 'stale' })] });
    expect(solveTrip(rows, 1080)!.worstFreshness).toBe('live');
    const mixed = ranked({ [HIDALGO]: [open(20)], [PHARR]: [open(5, { freshness: 'estimated' })] });
    expect(solveTrip(mixed, 1080)!.worstFreshness).toBe('estimated');
  });
});

describe('resolveSavedTrip', () => {
  const saved = { targetMinutes: 1080, lane: 'general' as const, viaPortId: HIDALGO };

  it('via is null when the saved lane closed, even though other rows still plan', () => {
    const status = resolveSavedTrip(saved, ranked({ [HIDALGO]: [closed()], [PHARR]: [open(10)] }), 900);
    expect(status.via).toBeNull();
    expect(status.departureHasPassed).toBe(false);
  });

  it('judges departureHasPassed on the saved crossing, not the recommendation', () => {
    const rows = ranked({ [HIDALGO]: [open(60)], [PHARR]: [open(10)] });
    const fixed = [withDrive(row(rows, HIDALGO), 20), withDrive(row(rows, PHARR), 10)];
    // Hidalgo leaves at 1000, Pharr at 1060. At 1030 the saved Hidalgo trip is gone.
    const status = resolveSavedTrip(saved, fixed, 1030);
    expect(status.via?.port.id).toBe(HIDALGO);
    expect(status.via?.leaveMinutes).toBe(1000);
    expect(status.departureHasPassed).toBe(true);
  });

  it('moves with the line', () => {
    const at60 = resolveSavedTrip(saved, [withDrive(row(ranked({ [HIDALGO]: [open(60)] }), HIDALGO), 20)], 600);
    const at40 = resolveSavedTrip(saved, [withDrive(row(ranked({ [HIDALGO]: [open(40)] }), HIDALGO), 20)], 600);
    expect(at40.via!.leaveMinutes - at60.via!.leaveMinutes).toBe(20);
  });
});

describe('tripIsForToday — local calendar date (TZ=America/Chicago)', () => {
  it('runs in the zone the tests assume', () => {
    expect(new Date('2026-09-06T05:00:00Z').getHours()).toBe(0);
  });

  it('same local date across a UTC date boundary is today', () => {
    // 18:30 CDT Sep 6 saved; now 20:00 CDT Sep 6 (01:00Z Sep 7).
    expect(tripIsForToday('2026-09-06T23:30:00Z', new Date('2026-09-07T01:00:00Z'))).toBe(true);
  });

  it('expires at local midnight', () => {
    // 23:59 CDT Sep 5 saved; now 00:00 CDT Sep 6.
    expect(tripIsForToday('2026-09-06T04:59:00Z', new Date('2026-09-06T05:00:00Z'))).toBe(false);
  });

  it('is unaffected by the DST transitions', () => {
    expect(tripIsForToday('2026-11-01T06:30:00Z', new Date('2026-11-01T07:30:00Z'))).toBe(true);
    expect(tripIsForToday('2026-03-08T07:30:00Z', new Date('2026-03-08T08:30:00Z'))).toBe(true);
  });
});

describe('clock helpers', () => {
  it('clampToDay keeps a target inside today', () => {
    expect(clampToDay(1440)).toBe(1439);
    expect(clampToDay(-15)).toBe(0);
    expect(clampToDay(600)).toBe(600);
  });

  it('formatMinutes wraps rather than clamps', () => {
    expect(formatMinutes(-20)).toBe('11:40 PM');
    expect(formatMinutes(1440)).toBe('12:00 AM');
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(formatMinutes(720)).toBe('12:00 PM');
    expect(formatMinutes(1025)).toBe('5:05 PM');
  });
});

describe('minutesLate', () => {
  // The sentence this replaces was "too late", which told a user their plan
  // had failed without telling them by how much — and six minutes late is a
  // completely different decision from ninety.
  const plan = solveTrip(ranked({ [HIDALGO]: [open(20)] }), 1080)!;
  const option = plan.best;

  it('is null while the departure is still ahead', () => {
    expect(minutesLate(option, option.leaveMinutes - 1)).toBeNull();
  });

  it('is null at the departure itself — on time is not late', () => {
    expect(minutesLate(option, option.leaveMinutes)).toBeNull();
  });

  it('counts the minutes the departure has been missed by', () => {
    expect(minutesLate(option, option.leaveMinutes + 13)).toBe(13);
  });
});
