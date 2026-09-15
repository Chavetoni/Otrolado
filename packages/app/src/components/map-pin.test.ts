import { describe, expect, it } from 'vitest';
import type { Freshness } from '@otrolado/shared';
import {
  LEGEND,
  PIN_H_NAMED,
  PIN_TIP,
  pinAnchorY,
  pinCenterOffsetY,
  pinColor,
  pinLabel,
  pinTextColor,
} from './map-pin';
import { color, status, waitColor } from '../theme';
import { closed, HIDALGO, open, pending, ranked, row } from '../__fixtures__/waits';
import { contrastRatio } from '../contrast.test-helpers';

/** A ranked Hidalgo row whose standard lane is `lane`. */
const pin = (lane: ReturnType<typeof open>) => row(ranked({ [HIDALGO]: [lane] }), HIDALGO);
const openAt = (m: number, freshness: Freshness = 'live') => pin(open(m, { freshness }));

describe('pinLabel', () => {
  it('prints a live wait bare and marks a non-live one', () => {
    expect(pinLabel(openAt(41))).toBe('41m');
    expect(pinLabel(openAt(41, 'estimated'))).toBe('~41m');
    expect(pinLabel(openAt(41, 'stale'))).toBe('~41m');
  });

  it('never prints a number for a lane with none — an em dash, not a zero', () => {
    expect(pinLabel(pin(closed()))).toBe('—');
    expect(pinLabel(pin(pending()))).toBe('—');
  });
});

describe('pinColor', () => {
  it('a non-live wait never wears the live scale', () => {
    expect(pinColor(openAt(10, 'estimated'))).toBe(status.moderate.tint);
    expect(pinColor(openAt(10, 'stale'))).toBe(status.heavy.tint);
    expect(pinTextColor(openAt(10, 'estimated'))).toBe(status.moderate.ink);
    expect(pinTextColor(openAt(10, 'stale'))).toBe(status.heavy.ink);
  });

  it('no wait is the neutral grey, never a scale colour', () => {
    const c = pinColor(pin(closed()));
    expect(c).toBe(color.lineStrong);
    expect(Object.values(status).map((s) => s.dot)).not.toContain(c);
  });

  it('LEGEND covers every colour a pin can take', () => {
    const colours = [
      ...[19, 20, 60, 61].map((m) => pinColor(openAt(m))),
      pinColor(openAt(30, 'estimated')),
      pinColor(openAt(30, 'stale')),
      pinColor(pin(closed())),
    ];
    const legend = LEGEND.map((l) => l.color);
    for (const c of colours) expect(legend).toContain(c);
  });

  it('the legend bands sit on the waitStatus boundaries', () => {
    expect(LEGEND[0]!.color).toBe(waitColor(19));
    expect(LEGEND[1]!.color).toBe(waitColor(20));
    expect(LEGEND[1]!.color).toBe(waitColor(60));
    expect(LEGEND[2]!.color).toBe(waitColor(61));
  });
});

describe('pin text contrast', () => {
  it('amber takes navy — white on the amber dot is 2.6:1', () => {
    expect(pinTextColor(openAt(40))).toBe(color.navy);
    expect(contrastRatio(pinTextColor(openAt(40)), pinColor(openAt(40)))).toBeGreaterThan(5.5);
  });

  it('every pin text clears 4.3:1 (white on the green dot is the floor, 4.33)', () => {
    const pins = [
      openAt(10),
      openAt(40),
      openAt(90),
      openAt(30, 'estimated'),
      openAt(30, 'stale'),
      pin(closed()),
    ];
    for (const p of pins) {
      expect(contrastRatio(pinTextColor(p), pinColor(p))).toBeGreaterThanOrEqual(4.3);
    }
  });
});

describe('pin anchoring', () => {
  it('puts the caret tip on the coordinate, named or not', () => {
    for (const named of [true, false]) {
      const h = named ? PIN_H_NAMED : PIN_TIP;
      // Google Maps: `anchor` is the tip's fraction of the pin's height.
      expect(pinAnchorY(named) * h).toBeCloseTo(PIN_TIP);
      // Apple Maps centres the view; the offset must move the tip onto it.
      expect(-h / 2 + PIN_TIP + pinCenterOffsetY(named)).toBeCloseTo(0);
    }
  });
});
