import { useEffect, useRef } from 'react';
import type { Port } from '@otrolado/shared';
import {
  evaluateFeedRules,
  evaluateLeaveRule,
  summarize,
  type Snapshot,
} from './alerts';
import { prefs, usePrefs } from './prefs';
import { usePorts, useWaits } from './queries';
import { nowInMinutes } from './trip';

/**
 * Runs the alert rules while the app is open. Two cadences, because the rules
 * have two different clocks:
 *
 * - FEED-DELTA rules (spike, closure) compare a previous snapshot against the
 *   current one, so they only make sense when the feed document actually
 *   changed. They run behind the `generatedAt` guard below — at ingest cadence
 *   (~15 min), not poll cadence, because between rebuilds every poll returns
 *   the same document and there is nothing to diff.
 *
 * - The TIME-TO-LEAVE nudge is a function of the wall clock, not of a feed
 *   change. It runs on its own ~60 s timer, independent of the feed guard, so
 *   it fires when the departure window opens even if ingest has stalled and
 *   `generatedAt` is frozen. Gating it on a new feed document would evaluate a
 *   clock rule at feed granularity: "leave in 15 min" could arrive as "leave
 *   in 1 min", or never.
 *
 * Mounted in the tabs layout, not in the Alerts screen — rules have to keep
 * evaluating while the user is looking at Crossings, which is where they will
 * be most of the time. Both queries are shared by key, so this adds no network
 * traffic; it only observes what the app already fetches every 60 s.
 *
 * Evaluation is on the PASSENGER standard lane northbound. Alerts are not
 * currently per-persona: a single mode keeps the diff unambiguous, and vehicle
 * is the mode the overwhelming majority of crossings are made in. Widening this
 * means storing the user's persona in prefs and keying the previous snapshot by
 * mode, so a mode switch does not diff a walk lane against a drive lane.
 */

/** How often the clock-driven leave rule re-checks the time. */
const LEAVE_TICK_MS = 60_000;

export function useAlertWatch(): void {
  const ports = usePorts();
  const waits = useWaits();
  const { rules, watchlist, trip } = usePrefs();

  /**
   * Previous snapshot, held in a ref rather than state: writing it must not
   * itself cause a render, or every poll would run this effect twice.
   */
  const prevRef = useRef<Snapshot>(new Map());
  /**
   * The feed document we last evaluated. Guards against re-running on renders
   * that were caused by something else — a tab change, a prefs write — which
   * would diff a snapshot against itself and, worse, overwrite `prevRef` with
   * the current values so a real change later looked like no change at all.
   */
  const lastGenRef = useRef<string | null>(null);

  const generatedAt = waits.data?.generatedAt ?? null;

  // Feed-delta rules: only when the feed document changed. The first document
  // seeds `prevRef` and fires nothing — `evaluateFeedRules` requires a prev.
  useEffect(() => {
    if (!generatedAt || generatedAt === lastGenRef.current) return;
    lastGenRef.current = generatedAt;

    const next = summarize(waits.data, 'passenger');
    const prev = prevRef.current;
    prevRef.current = next;

    const nameById = new Map<string, string>(
      (ports.data?.ports ?? []).map((p: Port) => [p.id, p.displayName]),
    );
    const nameOf = (id: string): string => nameById.get(id) ?? id;

    prefs.pushEvents(evaluateFeedRules(prev, next, watchlist, rules, nameOf, generatedAt));
  }, [generatedAt, waits.data, ports.data, watchlist, rules]);

  // Time-to-leave: its own timer, deliberately NOT behind the feed guard.
  // Evaluates immediately (an app opened mid-window must nudge now, not a
  // minute from now) and then every LEAVE_TICK_MS. The event id is day-scoped
  // to the departure, so `pushEvents` dedupes the repeated ticks inside the
  // 15-min window down to one activity row per departure.
  const leaveEnabled = rules.time_to_leave;
  useEffect(() => {
    if (!leaveEnabled || !trip) return;

    const { leaveMinutes, viaName } = trip;
    const check = (): void => {
      const event = evaluateLeaveRule(
        leaveMinutes,
        nowInMinutes(),
        viaName,
        new Date().toISOString(),
      );
      if (event) prefs.pushEvents([event]);
    };

    check();
    const timer = setInterval(check, LEAVE_TICK_MS);
    return () => clearInterval(timer);
  }, [leaveEnabled, trip]);
}
