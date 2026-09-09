import { describe, expect, it } from 'vitest';
import {
  fasterThanText,
  minutesBehindBest,
  rankPorts,
  readySavings,
  savingsText,
} from './ranking';
import { DEFAULT_ORIGIN } from './drive';
import {
  ANZALDUAS,
  closed,
  HIDALGO,
  open,
  pending,
  PHARR,
  pilotPort,
  ranked,
  READY,
  row,
  SENTRI,
  waits,
} from './__fixtures__/waits';

describe('rankPorts', () => {
  it('totals on the standard lane even when SENTRI is shorter', () => {
    const r = row(ranked({ [HIDALGO]: [open(60), open(3, SENTRI)] }), HIDALGO);
    expect(r.totalMinutes).toBe(r.drive.minutes + 60);
    expect(r.trusted?.waitMinutes).toBe(3);
  });

  it('keeps a crossing whose standard lane is closed, without a total, below every total', () => {
    const rows = ranked({ [HIDALGO]: [closed(), open(2, SENTRI)], [PHARR]: [open(50)], [ANZALDUAS]: [open(40)] });
    const h = row(rows, HIDALGO);
    expect(h.totalMinutes).toBeNull();
    expect(h.trusted?.waitMinutes).toBe(2);
    // Every row with a total sorts above it (other pilot ports with no data
    // share the null-total tail, ordered by drive).
    const lastWithTotal = rows.reduce((i, r, idx) => (r.totalMinutes !== null ? idx : i), -1);
    expect(rows.findIndex((r) => r.port.id === HIDALGO)).toBeGreaterThan(lastWithTotal);
  });

  it('treats update_pending as no total, not drive + 0', () => {
    expect(row(ranked({ [HIDALGO]: [pending()] }), HIDALGO).totalMinutes).toBeNull();
  });

  it('excludes non-routable ports and ports that do not offer the mode', () => {
    const notRoutable = rankPorts(
      [{ ...pilotPort(HIDALGO), routable: false }],
      waits({ [HIDALGO]: [open(10)] }),
      DEFAULT_ORIGIN,
      'passenger',
      'northbound',
    );
    expect(notRoutable).toEqual([]);
    const walking = ranked({}, { mode: 'pedestrian' }).map((r) => r.port.id);
    expect(walking).not.toContain(ANZALDUAS);
    expect(walking).not.toContain(PHARR);
    expect(walking).toContain(HIDALGO);
  });
});

describe('readySavings', () => {
  it('returns null unless both lanes are live', () => {
    const live = row(ranked({ [HIDALGO]: [open(40), open(10, READY)] }), HIDALGO);
    expect(readySavings(live)).toBe(30);
    const aged = row(ranked({ [HIDALGO]: [open(40), open(10, { ...READY, freshness: 'estimated' })] }), HIDALGO);
    expect(readySavings(aged)).toBeNull();
  });
});

describe('savingsText', () => {
  it('says so when only one crossing is reporting', () => {
    expect(savingsText(ranked({ [HIDALGO]: [open(10)], [PHARR]: [closed()] }))).toBe('Only crossing reporting right now');
    expect(savingsText(ranked({ [HIDALGO]: [closed()] }))).toBeNull();
  });
});

describe('fasterThanText', () => {
  // The hero chip. It names the crossing being beaten, because "29 min faster"
  // is only useful if you know what it is faster than.
  it('names the runner-up and the door-to-door gap', () => {
    const rows = ranked({ [HIDALGO]: [open(5)], [PHARR]: [open(40)] });
    const text = fasterThanText(rows)!;
    const [best, second] = rows;
    expect(text).toBe(`${second!.totalMinutes! - best!.totalMinutes!} min faster than ${second!.port.displayName}`);
  });

  it('says so rather than claiming an advantage when only one crossing reports', () => {
    expect(fasterThanText(ranked({ [HIDALGO]: [open(5)], [PHARR]: [closed()] }))).toBe(
      'Only crossing reporting right now',
    );
  });

  it('is null when nothing has a total — there is no "best" to boast about', () => {
    expect(fasterThanText(ranked({ [HIDALGO]: [closed()], [PHARR]: [pending()] }))).toBeNull();
  });
});

describe('minutesBehindBest', () => {
  it('gives the leader no chip and every other row its gap', () => {
    const rows = ranked({ [HIDALGO]: [open(5)], [PHARR]: [open(40)] });
    const [best, second] = rows;
    expect(minutesBehindBest(best!, rows)).toBeNull();
    expect(minutesBehindBest(second!, rows)).toBe(second!.totalMinutes! - best!.totalMinutes!);
  });

  it('gives a row with no total no chip — there is nothing to compare', () => {
    const rows = ranked({ [HIDALGO]: [open(5)], [PHARR]: [closed()] });
    expect(minutesBehindBest(row(rows, PHARR), rows)).toBeNull();
  });
});
