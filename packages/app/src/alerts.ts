import type { TravelMode, WaitsResponse } from '@otrolado/shared';

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

export type AlertRuleId = 'spike' | 'time_to_leave' | 'closure' | 'reroute';

export interface AlertRule {
  readonly id: AlertRuleId;
  readonly name: string;
  readonly desc: string;
  /** False when the inputs to evaluate this rule do not exist yet. */
  readonly available: boolean;
  /** Why it cannot run. Rendered verbatim; null when available. */
  readonly blockedReason: string | null;
}

/** Wording from the prototype's rule list; the reasons are ours. */
export const ALERT_RULES: readonly AlertRule[] = [
  {
    id: 'spike',
    name: 'Wait spikes at favorites',
    desc: `When a watched crossing jumps ${15}+ min`,
    available: true,
    blockedReason: null,
  },
  {
    id: 'time_to_leave',
    name: 'Time-to-leave for trips',
    desc: 'A nudge when your planned window opens',
    available: true,
    blockedReason: null,
  },
  {
    id: 'closure',
    name: 'Closures & port status',
    desc: 'Standard lane closing or going quiet',
    available: true,
    blockedReason: null,
  },
  {
    id: 'reroute',
    name: 'Better crossing on route',
    desc: 'Mid-drive switch suggestions',
    available: false,
    blockedReason:
      'Needs turn-by-turn routing to know where you are on the road. Drive times here are straight-line estimates.',
  },
];

/** Jump, in minutes, that counts as a spike. From the prototype's copy. */
export const SPIKE_THRESHOLD = 15;

/** How long before the planned departure the time-to-leave nudge fires. */
export const LEAVE_LEAD_MINUTES = 15;

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
 */
export function evaluateLeaveRule(
  leaveMinutes: number,
  nowMinutes: number,
  viaName: string,
  at: string,
): AlertEvent | null {
  const until = leaveMinutes - nowMinutes;
  if (until > LEAVE_LEAD_MINUTES || until < 0) return null;
  return {
    // Day-scoped so the nudge dedupes within one departure but can fire again
    // for the same saved trip tomorrow.
    id: `trip-leave-${at.slice(0, 10)}-${leaveMinutes}`,
    ruleId: 'time_to_leave',
    portId: null,
    title: until <= 0 ? 'Time to leave' : `Leave in ${until} min`,
    body: `Your saved trip goes via ${viaName}.`,
    at,
    tone: 'warn',
  };
}
