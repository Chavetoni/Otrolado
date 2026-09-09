import type { Freshness, TravelMode, WaitsResponse } from '@otrolado/shared';

/**
 * Alert rules: the catalogue, and the pure evaluation over two feed snapshots.
 *
 * WHAT "ALERT" MEANS TODAY
 *
 * These fire in the foreground only. There is no account to hang a rule on and
 * no push queue to deliver from, so the app evaluates rules itself against each
 * `/v1/waits` poll while it is open, and surfaces hits in-app. That is a real
 * capability, not a placeholder — but it is strictly less than a notification,
 * and the screen says so rather than implying your phone will buzz.
 *
 * A rule that cannot be evaluated at all is listed with `available: false` and
 * the reason, instead of being offered as a toggle that silently does nothing.
 * An alert that never arrives is worse than one you were never promised.
 */

export type AlertRuleId = 'faster' | 'spike' | 'time_to_leave' | 'closure';

/**
 * Jump, in minutes, that counts as a spike. From the prototype's copy.
 *
 * Declared ahead of `ALERT_RULES` because the catalogue's description quotes
 * it — a `const` is in its temporal dead zone until its line runs, so the
 * other order would throw at module load.
 */
export const SPIKE_THRESHOLD = 15;

/** How long before the planned departure the time-to-leave nudge fires. */
export const LEAVE_LEAD_MINUTES = 15;

export interface AlertRule {
  readonly id: AlertRuleId;
  readonly name: string;
  readonly desc: string;
  /** False when the inputs to evaluate this rule do not exist yet. */
  readonly available: boolean;
  /** Why it cannot run. Rendered verbatim; null when available. */
  readonly blockedReason: string | null;
}

/**
 * How much better an alternative must be before it is worth interrupting
 * someone. 15 minutes clears CBP's own ±10 min officer-reporting accuracy, so
 * the alert cannot fire on two readings that are, within the feed's
 * precision, the same. Deliberately equal to SPIKE_THRESHOLD: both answer
 * "is this difference real?" against the same instrument.
 */
export const FASTER_THRESHOLD = 15;

/**
 * The rules, most decision-shaped first.
 *
 * "Another crossing is faster" leads because it is the only rule that hands
 * the user an action rather than a fact — a spike tells you the line grew, this
 * tells you what to do about it. It replaces the old `reroute` rule, which was
 * permanently disabled behind "needs turn-by-turn routing": that framing was
 * too ambitious for the question most people actually have. Comparing a saved
 * trip's crossing against the alternatives from a STATIC origin needs no
 * position on the road at all — only the trip the user already saved and the
 * feed we already poll. A mid-drive version still needs routing; this is the
 * part that does not.
 */
export const ALERT_RULES: readonly AlertRule[] = [
  {
    id: 'faster',
    name: 'Another crossing is faster',
    desc: `When your saved trip could leave ${FASTER_THRESHOLD}+ min later elsewhere`,
    available: true,
    blockedReason: null,
  },
  {
    id: 'time_to_leave',
    name: 'Leave-by updates',
    desc: 'A nudge when your planned window opens',
    available: true,
    blockedReason: null,
  },
  {
    id: 'closure',
    name: 'Closures & lane status',
    desc: 'Standard lane closing or going quiet at a watched crossing',
    available: true,
    blockedReason: null,
  },
  {
    id: 'spike',
    name: 'Wait changes',
    desc: `Spikes of ${SPIKE_THRESHOLD}+ min at a watched crossing`,
    available: true,
    blockedReason: null,
  },
];

export interface AlertEvent {
  readonly id: string;
  readonly ruleId: AlertRuleId;
  readonly portId: string | null;
  readonly title: string;
  readonly body: string;
  readonly at: string;
  readonly tone: 'bad' | 'warn' | 'good';
}

/**
 * The slice of a snapshot the rules actually compare.
 *
 * Reduced to the standard lane for one mode, because that is the lane the app
 * ranks and plans on — diffing every lane would fire a spike alert about a
 * SENTRI queue most users cannot enter.
 */
export type LaneSummary = { readonly wait: number | null; readonly closed: boolean };
export type Snapshot = ReadonlyMap<string, LaneSummary>;

export function summarize(waits: WaitsResponse | undefined, mode: TravelMode): Snapshot {
  const out = new Map<string, LaneSummary>();
  for (const p of waits?.ports ?? []) {
    const lane = p.lanes.find(
      (l) => l.mode === mode && l.direction === 'northbound' && l.lane === 'standard',
    );
    if (!lane) continue;
    out.set(p.portId, {
      wait: lane.status === 'open' ? lane.waitMinutes : null,
      closed: lane.status === 'closed',
    });
  }
  return out;
}

/**
 * Diff two snapshots into events.
 *
 * Deliberately requires a `prev`: on the very first poll there is nothing to
 * compare against, and reporting "wait spike" for every crossing merely because
 * we just started looking would be noise dressed as signal.
 *
 * `watchlist` empty means watch nothing. Spike alerts for all eleven crossings
 * at once would be unreadable, and the user pinning a crossing is what makes
 * the alert about their trip rather than about the border in general.
 */
export function evaluateFeedRules(
  prev: Snapshot,
  next: Snapshot,
  watchlist: readonly string[],
  enabled: Readonly<Record<AlertRuleId, boolean>>,
  nameOf: (portId: string) => string,
  at: string,
): AlertEvent[] {
  const events: AlertEvent[] = [];
  if (prev.size === 0) return events;

  for (const portId of watchlist) {
    const before = prev.get(portId);
    const after = next.get(portId);
    if (!before || !after) continue;

    if (enabled.spike && before.wait !== null && after.wait !== null) {
      const jump = after.wait - before.wait;
      if (jump >= SPIKE_THRESHOLD) {
        events.push({
          id: `${portId}-spike-${at}`,
          ruleId: 'spike',
          portId,
          title: `Wait spike at ${nameOf(portId)}`,
          body: `Jumped ${before.wait} → ${after.wait} min in the standard lane.`,
          at,
          tone: 'bad',
        });
      }
    }

    if (enabled.closure) {
      if (!before.closed && after.closed) {
        events.push({
          id: `${portId}-closed-${at}`,
          ruleId: 'closure',
          portId,
          title: `${nameOf(portId)} standard lane closed`,
          body: 'CBP is reporting this lane as closed. Your trusted lane may still be open.',
          at,
          tone: 'bad',
        });
      } else if (before.closed && !after.closed) {
        events.push({
          id: `${portId}-reopen-${at}`,
          ruleId: 'closure',
          portId,
          title: `${nameOf(portId)} standard lane reopened`,
          body:
            after.wait === null
              ? 'Reporting again, no wait posted yet.'
              : `Reporting again at ${after.wait} min.`,
          at,
          tone: 'good',
        });
      } else if (before.wait !== null && after.wait === null && !after.closed) {
        events.push({
          id: `${portId}-quiet-${at}`,
          ruleId: 'closure',
          portId,
          title: `${nameOf(portId)} stopped reporting`,
          body: 'CBP has not posted a current figure for this lane.',
          at,
          tone: 'warn',
        });
      }
    }
  }

  return events;
}

/**
 * The time-to-leave nudge. Separate from the feed diff because it is a function
 * of the clock, not of a snapshot change — it must be able to fire on a tick
 * where the feed did not move at all.
 *
 * `leaveMinutes` is the saved trip's departure RE-SOLVED against the wait
 * reported now, not the figure from save time — see `resolveSavedTrip`.
 *
 * THE EVENT ID IS THE TRIP, AND NOTHING ELSE. `tripKey` is the trip's
 * `savedAt`, unique per saved trip. It is deliberately NOT keyed by the leave
 * time (which drifts as the line moves, and would fire a fresh "leave in N
 * min" every time the number ticked inside the window) and NOT keyed by the
 * calendar day either. A day component taken from the ISO timestamp is the UTC
 * date, while the trip lives on the local day: a departure window straddling
 * 00:00Z — 19:00–19:15 CDT — would produce two ids and two rows for one trip.
 * Day scoping is unnecessary anyway, because a saved trip expires with the day
 * it was saved on (`tripIsForToday`) and a new trip gets a new `savedAt`.
 *
 * `notLive` is true when the wait behind the re-solve is anything other than
 * `live` — estimated or stale. Either way the leave time is standing on a
 * number the feed has not confirmed, and the nudge says so.
 */
export function evaluateLeaveRule(
  leaveMinutes: number,
  nowMinutes: number,
  viaName: string,
  at: string,
  tripKey: string,
  notLive: boolean,
): AlertEvent | null {
  const until = leaveMinutes - nowMinutes;
  if (until > LEAVE_LEAD_MINUTES || until < 0) return null;
  return {
    id: `trip-leave-${tripKey}`,
    ruleId: 'time_to_leave',
    portId: null,
    title: until <= 0 ? 'Time to leave' : `Leave in ${until} min`,
    body: notLive
      ? `Your saved trip goes via ${viaName}. The wait behind this isn’t live — check the line before you go.`
      : `Your saved trip goes via ${viaName}.`,
    at,
    tone: 'warn',
  };
}

/**
 * The saved crossing cannot be planned through right now — the trip's lane is
 * closed, does not exist at that crossing, or is not reporting. Firing nothing
 * here would be the silent non-delivery this product is built to avoid: the
 * user is waiting for a nudge that can no longer be computed, and needs to be
 * told that instead.
 *
 * `laneLabel` is the trip's lane as the picker names it (General, Ready,
 * SENTRI, Walking) — a SENTRI trip must not be told about the standard lane.
 * Once per trip, via the id; same scheme and same reasoning as
 * `evaluateLeaveRule` — no day component.
 */
export function evaluateUnplannableRule(
  viaName: string,
  laneLabel: string,
  at: string,
  tripKey: string,
): AlertEvent {
  return {
    id: `trip-unplannable-${tripKey}`,
    ruleId: 'time_to_leave',
    portId: null,
    title: 'Saved trip needs a look',
    body: `${viaName} has no open ${laneLabel} lane reported right now, so your leave time can’t be updated.`,
    at,
    tone: 'warn',
  };
}

/**
 * "Another crossing is faster" — the one rule that hands back a decision.
 *
 * WHAT IT COMPARES. Both sides are the SAME question solved on the SAME lane
 * for the SAME arrival target: how late can you leave and still make it? A
 * crossing you can leave for later is strictly better, and because leave-by
 * already folds in both the drive and the line, this is a door-to-door
 * comparison rather than a raw-wait one. Comparing raw waits would recommend a
 * bridge with a shorter line an extra half-hour up the valley.
 *
 * WHAT IT REFUSES TO DO.
 *  - It will not recommend a switch off a non-live reading, on either side. A
 *    stale figure is exactly the case where a "faster" verdict is most likely
 *    to be wrong and most expensive to act on.
 *  - It will not fire on a departure that has already passed, or one where the
 *    alternative's own departure has passed — there is nothing to switch to.
 *  - It will not fire below FASTER_THRESHOLD, which sits outside CBP's own
 *    reporting accuracy.
 *
 * DEDUPE. The id keys on the trip and the alternative, not on the size of the
 * gap, so one saved trip produces one notification per crossing that overtakes
 * it — not a new row every time the margin moves a minute.
 *
 * Pure, and takes already-solved options rather than raw ports, so the rule and
 * the Plan screen can never disagree about what "faster" means.
 */
export function evaluateFasterRule(
  saved: { readonly leaveMinutes: number; readonly freshness: Freshness; readonly portId: string },
  alternatives: readonly {
    readonly portId: string;
    readonly name: string;
    readonly leaveMinutes: number;
    readonly freshness: Freshness;
  }[],
  nowMinutes: number,
  viaName: string,
  at: string,
  tripKey: string,
): AlertEvent | null {
  if (saved.freshness !== 'live') return null;
  // Already past your own departure: the question is no longer "which bridge",
  // it is whether the trip still works at all — which the leave rule owns.
  if (saved.leaveMinutes < nowMinutes) return null;

  const better = alternatives
    .filter(
      (a) =>
        a.portId !== saved.portId &&
        a.freshness === 'live' &&
        a.leaveMinutes >= nowMinutes &&
        a.leaveMinutes - saved.leaveMinutes >= FASTER_THRESHOLD,
    )
    .sort((a, b) => b.leaveMinutes - a.leaveMinutes)[0];
  if (!better) return null;

  const gain = better.leaveMinutes - saved.leaveMinutes;
  return {
    id: `trip-faster-${tripKey}-${better.portId}`,
    ruleId: 'faster',
    portId: better.portId,
    title: `${better.name} is now ${gain} min faster`,
    body: `For your saved trip via ${viaName} — you could leave ${gain} min later and still make it. Drive times are approximate.`,
    at,
    tone: 'good',
  };
}
