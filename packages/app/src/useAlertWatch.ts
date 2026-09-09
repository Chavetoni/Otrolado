import { useEffect, useRef } from 'react';
import type { Port } from '@otrolado/shared';
import {
  evaluateFasterRule,
  evaluateFeedRules,
  evaluateLeaveRule,
  evaluateUnplannableRule,
  summarize,
  type Snapshot,
} from './alerts';
import { prefs, usePrefs } from './prefs';
import { usePorts, useWaits } from './queries';
import { rankPorts } from './ranking';
import { nowInMinutes, planOptions, solveTrip, tripLaneLabel, tripLaneMode } from './trip';
import { useAgedWaits } from './useFreshness';
import { useOrigin } from './useOrigin';
import { useSavedTrip } from './useSavedTrip';

/**
 * Runs the alert rules while the app is open. Two cadences, because the rules
 * have two different clocks:
 *
 * - FEED-DELTA rules (spike, closure) compare a previous snapshot against the
 *   current one, so they only make sense when the feed document actually
 *   changed. They run behind the `generatedAt` guard below — at ingest cadence
 *   (~15 min), not poll cadence, because between rebuilds every poll returns
 *   the same document and there is nothing to diff. They evaluate the
 *   PASSENGER standard lane northbound for every watched crossing: a single
 *   mode keeps the diff unambiguous, and vehicle is the mode the overwhelming
 *   majority of crossings are made in. Widening this means keying the previous
 *   snapshot by mode, so a mode switch does not diff a walk lane against a
 *   drive lane.
 *
 * - The TIME-TO-LEAVE nudge is a function of the wall clock, not of a feed
 *   change. It runs on its own ~60 s timer, independent of the feed guard, so
 *   it fires when the departure window opens even if ingest has stalled and
 *   `generatedAt` is frozen. Gating it on a new feed document would evaluate a
 *   clock rule at feed granularity: "leave in 15 min" could arrive as "leave
 *   in 1 min", or never. Its input is the saved trip RE-SOLVED by
 *   `useSavedTrip` on every poll — on the trip's own lane, not the passenger
 *   standard lane the feed rules use — so the departure it nudges on is the
 *   one the Trips tab is showing, not the figure from save time.
 *
 * Trips are today-only. `useSavedTrip` marks a trip saved on an earlier day as
 * `expired` and solves nothing for it; this hook watches nothing for it either.
 * (`prefs` also drops an expired trip at hydration, so this mostly matters for
 * an app left open across midnight.)
 *
 * Mounted in the tabs layout, not in the Alerts screen — rules have to keep
 * evaluating while the user is looking at Crossings, which is where they will
 * be most of the time. Both queries are shared by key, so this adds no network
 * traffic; it only observes what the app already fetches every 60 s.
 */

/** How often the clock-driven leave rule re-checks the time. */
const LEAVE_TICK_MS = 60_000;

export function useAlertWatch(): void {
  const ports = usePorts();
  const waits = useWaits();
  const { rules, watchlist } = usePrefs();
  const savedTrip = useSavedTrip();
  const origin = useOrigin();
  // The same re-aged document every screen reads, so a rule can never judge a
  // reading "live" that the Plan screen is already showing as stale.
  const aged = useAgedWaits(waits);

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
  //
  // A document restored from the persister does not count as first: it can be
  // hours old, and diffing last night's 10-min line against this morning's
  // 50-min one would report a "spike" that never happened. The seed has to be
  // something we fetched recently, so a restored document is skipped and the
  // first live poll becomes the baseline instead.
  const fetchedAt = waits.dataUpdatedAt;
  useEffect(() => {
    if (!generatedAt || generatedAt === lastGenRef.current) return;
    if (lastGenRef.current === null) {
      const maxSeedAgeMs = (waits.data?.thresholds.estimatedAfterS ?? 30 * 60) * 1000;
      if (Date.now() - fetchedAt > maxSeedAgeMs) return;
    }
    lastGenRef.current = generatedAt;

    const next = summarize(waits.data, 'passenger');
    const prev = prevRef.current;
    prevRef.current = next;

    const nameById = new Map<string, string>(
      (ports.data?.ports ?? []).map((p: Port) => [p.id, p.displayName]),
    );
    const nameOf = (id: string): string => nameById.get(id) ?? id;

    prefs.pushEvents(evaluateFeedRules(prev, next, watchlist, rules, nameOf, generatedAt));
  }, [generatedAt, fetchedAt, waits.data, ports.data, watchlist, rules]);

  // Time-to-leave: its own timer, deliberately NOT behind the feed guard.
  // Evaluates immediately (an app opened mid-window must nudge now, not a
  // minute from now) and then every LEAVE_TICK_MS. The event id is keyed to
  // the trip alone (its `savedAt`), so `pushEvents` dedupes the repeated ticks
  // inside the 15-min window — and the drifting leave time across them — down
  // to one activity row per saved trip.
  //
  // `status` is null for an expired trip, and for a current one until ports
  // and waits have loaded; `status.via` is null when the trip's lane at the
  // saved crossing cannot be planned through right now. The effect re-arms
  // whenever the re-solved leave time, or that plannability, changes.
  const leaveEnabled = rules.time_to_leave;
  const status = savedTrip && !savedTrip.expired ? savedTrip.status : null;
  const via = status?.via ?? null;
  const leaveMinutes = via?.leaveMinutes ?? null;
  // Anything short of `live` — estimated or stale — gets the caveat. Both mean
  // the leave time is standing on a number the feed has not confirmed.
  const notLive = via !== null && via.freshness !== 'live';
  const unplannable = status !== null && via === null;
  const viaName = savedTrip?.trip.viaName ?? null;
  const tripKey = savedTrip?.trip.savedAt ?? null;
  const targetMinutes = savedTrip?.trip.targetMinutes ?? null;
  const lane = savedTrip?.trip.lane ?? null;
  useEffect(() => {
    if (!leaveEnabled || viaName === null || tripKey === null || targetMinutes === null) return;

    if (unplannable) {
      // Only while the trip is still ahead. A bridge whose lane closes for
      // the night makes every trip through it unplannable; telling someone at
      // 10 PM that their 2 PM trip "needs a look" is noise about a trip that
      // is over. Checked at call time — the effect re-runs when plannability
      // changes, so a closure that lands before the target still fires.
      if (targetMinutes < nowInMinutes() || lane === null) return;
      const laneLabel = tripLaneLabel(lane);
      prefs.pushEvents([
        evaluateUnplannableRule(viaName, laneLabel, new Date().toISOString(), tripKey),
      ]);
      return;
    }
    if (leaveMinutes === null) return;

    const check = (): void => {
      const event = evaluateLeaveRule(
        leaveMinutes,
        nowInMinutes(),
        viaName,
        new Date().toISOString(),
        tripKey,
        notLive,
      );
      if (event) prefs.pushEvents([event]);
    };

    check();
    const timer = setInterval(check, LEAVE_TICK_MS);
    return () => clearInterval(timer);
  }, [leaveEnabled, leaveMinutes, notLive, unplannable, viaName, tripKey, targetMinutes, lane]);

  /**
   * "Another crossing is faster."
   *
   * A FEED rule, not a clock rule: it can only change when the document
   * changes, so it rides the same `generatedAt` guard the spike and closure
   * rules use rather than re-solving eleven crossings every 60 s for an answer
   * that cannot have moved.
   *
   * It re-solves the saved trip's question across the whole field, on the
   * trip's own lane, from the shared origin — the same three inputs the Plan
   * screen uses — so the alert and the screen can never disagree. Unlike the
   * feed-delta rules it needs no previous snapshot: "is there a better bridge
   * right now" is answered by the current document alone, which is also why it
   * can fire on the very first poll.
   */
  const fasterEnabled = rules.faster;
  const fasterGen = waits.data?.generatedAt ?? null;
  const savedLane = savedTrip && !savedTrip.expired ? savedTrip.trip.lane : null;
  const savedPortId = savedTrip && !savedTrip.expired ? savedTrip.trip.viaPortId : null;
  useEffect(() => {
    if (!fasterEnabled || savedLane === null || savedPortId === null) return;
    if (viaName === null || tripKey === null || targetMinutes === null) return;

    const ranked = rankPorts(
      ports.data?.ports ?? [],
      aged.data,
      origin,
      tripLaneMode(savedLane),
      'northbound',
    );
    const plan = solveTrip(ranked, targetMinutes, savedLane);
    if (!plan) return;
    const options = planOptions(plan);
    const mine = options.find((o) => o.port.id === savedPortId);
    if (!mine) return;

    const event = evaluateFasterRule(
      { leaveMinutes: mine.leaveMinutes, freshness: mine.freshness, portId: savedPortId },
      options.map((o) => ({
        portId: o.port.id,
        name: o.port.displayName,
        leaveMinutes: o.leaveMinutes,
        freshness: o.freshness,
      })),
      nowInMinutes(),
      viaName,
      new Date().toISOString(),
      tripKey,
    );
    if (event) prefs.pushEvents([event]);
  }, [
    fasterEnabled,
    fasterGen,
    aged.data,
    ports.data,
    origin,
    savedLane,
    savedPortId,
    viaName,
    tripKey,
    targetMinutes,
  ]);
}
