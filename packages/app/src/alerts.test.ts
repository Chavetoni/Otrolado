import { describe, expect, it } from 'vitest';
import type { Freshness } from '@otrolado/shared';
import {
  ALERT_RULES,
  evaluateFasterRule,
  evaluateFeedRules,
  evaluateLeaveRule,
  evaluateUnplannableRule,
  FASTER_THRESHOLD,
  LEAVE_LEAD_MINUTES,
  SPIKE_THRESHOLD,
  summarize,
  type Snapshot,
} from './alerts';
import { closed, HIDALGO, open, pending, PHARR, waits, WALK } from './__fixtures__/waits';

const ALL_ON = { faster: true, spike: true, time_to_leave: true, closure: true } as const;
const KEY = '2026-09-06T14:00:00.000Z';
const name = (id: string) => `port ${id}`;
const snap = (entries: Record<string, { wait: number | null; closed: boolean }>): Snapshot =>
  new Map(Object.entries(entries));

describe('evaluateLeaveRule', () => {
  it('keeps one id per trip across UTC midnight and across a drifting leave time', () => {
    const a = evaluateLeaveRule(1025, 1012, 'Hidalgo', '2026-09-06T23:59:30Z', KEY, false)!;
    const b = evaluateLeaveRule(1030, 1020, 'Hidalgo', '2026-09-07T00:04:30Z', KEY, false)!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(`trip-leave-${KEY}`); // the trip key only — no `at` date
    expect(a.title).toBe('Leave in 13 min');
    expect(b.title).toBe('Leave in 10 min');
  });

  it('fires only inside the lead window', () => {
    const at = (until: number) => evaluateLeaveRule(1000, 1000 - until, 'X', KEY, KEY, false);
    expect(at(LEAVE_LEAD_MINUTES + 1)).toBeNull();
    expect(at(LEAVE_LEAD_MINUTES)?.title).toBe(`Leave in ${LEAVE_LEAD_MINUTES} min`);
    expect(at(0)?.title).toBe('Time to leave');
    expect(at(-1)).toBeNull();
  });

  it('hedges the body when the wait behind it is not live', () => {
    const live = evaluateLeaveRule(1000, 995, 'Hidalgo', KEY, KEY, false)!;
    const notLive = evaluateLeaveRule(1000, 995, 'Hidalgo', KEY, KEY, true)!;
    expect(live.body).toBe('Your saved trip goes via Hidalgo.');
    expect(notLive.body).toContain('isn’t live');
  });
});

describe('evaluateUnplannableRule', () => {
  it('names the lane and is keyed by the trip only', () => {
    const e = evaluateUnplannableRule('Anzalduas', 'SENTRI', '2026-09-06T23:59:30Z', KEY);
    expect(e.id).toBe(`trip-unplannable-${KEY}`);
    expect(e.body).toContain('SENTRI lane');
    expect(e.body).not.toContain('standard');
    expect(e.ruleId).toBe('time_to_leave');
  });
});

describe('evaluateFeedRules', () => {
  it('fires nothing on the first poll — there is no previous snapshot', () => {
    const next = snap({ [HIDALGO]: { wait: 50, closed: false } });
    expect(evaluateFeedRules(new Map(), next, [HIDALGO], ALL_ON, name, KEY)).toEqual([]);
  });

  it('spikes at the threshold, only for watched crossings, only when the rule is on', () => {
    const prev = snap({ [HIDALGO]: { wait: 10, closed: false } });
    const fire = evaluateFeedRules(prev, snap({ [HIDALGO]: { wait: 10 + SPIKE_THRESHOLD, closed: false } }), [HIDALGO], ALL_ON, name, KEY);
    expect(fire.map((e) => e.ruleId)).toEqual(['spike']);
    const under = evaluateFeedRules(prev, snap({ [HIDALGO]: { wait: 10 + SPIKE_THRESHOLD - 1, closed: false } }), [HIDALGO], ALL_ON, name, KEY);
    expect(under).toEqual([]);
    const unwatched = evaluateFeedRules(prev, snap({ [HIDALGO]: { wait: 90, closed: false } }), [PHARR], ALL_ON, name, KEY);
    expect(unwatched).toEqual([]);
    const off = evaluateFeedRules(prev, snap({ [HIDALGO]: { wait: 90, closed: false } }), [HIDALGO], { ...ALL_ON, spike: false }, name, KEY);
    expect(off).toEqual([]);
  });

  it('reports closure transitions as three different sentences', () => {
    const openS = snap({ [HIDALGO]: { wait: 20, closed: false } });
    const closedS = snap({ [HIDALGO]: { wait: null, closed: true } });
    const quietS = snap({ [HIDALGO]: { wait: null, closed: false } });
    expect(evaluateFeedRules(openS, closedS, [HIDALGO], ALL_ON, name, KEY).map((e) => e.id)).toEqual([`${HIDALGO}-closed-${KEY}`]);
    expect(evaluateFeedRules(closedS, openS, [HIDALGO], ALL_ON, name, KEY).map((e) => e.id)).toEqual([`${HIDALGO}-reopen-${KEY}`]);
    expect(evaluateFeedRules(openS, quietS, [HIDALGO], ALL_ON, name, KEY).map((e) => e.id)).toEqual([`${HIDALGO}-quiet-${KEY}`]);
    expect(evaluateFeedRules(closedS, closedS, [HIDALGO], ALL_ON, name, KEY)).toEqual([]);
  });
});

describe('summarize', () => {
  it('keeps the five lane states distinct and ignores other modes', () => {
    const s = summarize(
      waits({ [HIDALGO]: [pending()], [PHARR]: [closed()], ['535504']: [open(5, WALK)] }),
      'passenger',
    );
    expect(s.get(HIDALGO)).toEqual({ wait: null, closed: false });
    expect(s.get(PHARR)).toEqual({ wait: null, closed: true });
    expect(s.has('535504')).toBe(false);
    expect(summarize(undefined, 'passenger').size).toBe(0);
  });
});

describe('ALERT_RULES', () => {
  it('quotes the real thresholds rather than a copywriter\u2019s round number', () => {
    expect(ALERT_RULES.find((r) => r.id === 'spike')!.desc).toContain(String(SPIKE_THRESHOLD));
    expect(ALERT_RULES.find((r) => r.id === 'faster')!.desc).toContain(String(FASTER_THRESHOLD));
  });

  it('leads with the decision-shaped rule, and every rule it lists can run', () => {
    // "Another crossing is faster" is first because it hands back an action.
    expect(ALERT_RULES[0]!.id).toBe('faster');
    // A rule that cannot be evaluated must carry its reason; none is blocked
    // now that `reroute` (which needed turn-by-turn) is gone.
    for (const rule of ALERT_RULES) {
      expect(rule.available || rule.blockedReason !== null).toBe(true);
    }
  });
});

describe('evaluateFasterRule', () => {
  const live = { portId: HIDALGO, leaveMinutes: 600, freshness: 'live' as Freshness };
  const alt = (leaveMinutes: number, freshness: Freshness = 'live') => [
    { portId: HIDALGO, name: 'Hidalgo', leaveMinutes: 600, freshness: 'live' as Freshness },
    { portId: PHARR, name: 'Pharr', leaveMinutes, freshness },
  ];
  const fire = (
    saved = live,
    alternatives = alt(600 + FASTER_THRESHOLD),
    now = 500,
  ) => evaluateFasterRule(saved, alternatives, now, 'Hidalgo', KEY, 'trip-1');

  it('fires at the threshold and names the gain', () => {
    const e = fire()!;
    expect(e.ruleId).toBe('faster');
    expect(e.portId).toBe(PHARR);
    expect(e.title).toContain(String(FASTER_THRESHOLD));
    expect(e.tone).toBe('good');
  });

  it('will not recommend a switch on a figure nobody stands behind', () => {
    // Stale on the alternative's side...
    expect(fire(live, alt(600 + FASTER_THRESHOLD, 'stale'))).toBeNull();
    // ...or on the saved trip's own.
    expect(fire({ ...live, freshness: 'stale' })).toBeNull();
  });

  it('stays quiet inside CBP\u2019s reporting accuracy', () => {
    expect(fire(live, alt(600 + FASTER_THRESHOLD - 1))).toBeNull();
  });

  it('stays quiet once a departure has passed on either side', () => {
    // Your own departure is behind you: the leave rule owns that, not this one.
    expect(fire(live, alt(600 + FASTER_THRESHOLD), 700)).toBeNull();
    // The alternative's departure is behind you: there is nothing to switch to.
    expect(fire({ ...live, leaveMinutes: 300 }, alt(320), 330)).toBeNull();
  });

  it('keys one event per alternative, so a moving margin does not spam', () => {
    const a = fire()!;
    const b = fire(live, alt(600 + FASTER_THRESHOLD + 7))!;
    expect(a.id).toBe(b.id);
  });
});
