import type { Freshness, Port } from '@otrolado/shared';
import type { RankedPort } from './ranking';

/**
 * The trip solver. Pure — no React, no I/O — for the same reason `ranking.ts`
 * is: this is the domain core, and it has to be checkable without a renderer.
 *
 * WHAT THIS CAN AND CANNOT ANSWER
 *
 * It answers "when do I leave to be across by X" for *right now*, using the
 * wait CBP is reporting at this moment and holding it constant for the length
 * of the drive. That assumption is stated on screen (`assumesWaitHolds`) and it
 * is the honest limit of the current data: we have no archive, so there is no
 * way to say what the line will be in 40 minutes.
 *
 * It cannot answer the same question for a future day. That needs typical
 * day-of-week/hour waits, which needs roughly six weeks of history we have not
 * collected. The prototype fakes this with day factors [1, .9, 1, 1.3, 1.4];
 * those are invented numbers and must not ship. Future days are therefore
 * disabled in the UI with the data gap named — NOT gated behind Plus, because
 * the blocker is missing data, not a missing payment.
 *
 * Drive times come from `drive.ts`, which is straight-line. Every number this
 * module emits inherits that approximation and must render with it disclosed.
 */

export type PlanMode = 'arrive' | 'leave';

/**
 * Slack between "through the plaza" and the target arrival. Matches the
 * prototype's 10-minute buffer.
 */
export const BUFFER_MINUTES = 10;

/**
 * Front of the line → off the bridge. The queue wait CBP reports ends at the
 * booth, not at the far side.
 *
 * The prototype applies this only in leave-at mode and omits it in arrive-by,
 * which makes the two directions disagree by two minutes about the same trip.
 * That is a mock-data slip, not a spec, so it is applied symmetrically here.
 */
export const CLEARANCE_MINUTES = 2;

export interface TripOption {
  readonly port: Port;
  readonly driveMinutes: number;
  readonly waitMinutes: number;
  /** Minutes past local midnight. May be negative or > 1440 near the wrap. */
  readonly leaveMinutes: number;
  readonly atBridgeMinutes: number;
  readonly acrossMinutes: number;
  readonly freshness: Freshness;
}

export interface TripPlan {
  readonly planMode: PlanMode;
  readonly best: TripOption;
  readonly alternatives: readonly TripOption[];
  /** The time the user asked for, minutes past midnight. */
  readonly targetMinutes: number;
  /** Worst freshness among the options shown. Drives the staleness banner. */
  readonly worstFreshness: Freshness;
  /**
   * True when the recommended departure has already passed — the target is
   * unreachable. The UI must say so rather than print a past time as advice.
   */
  readonly departureHasPassed: boolean;
  /** Always true in v1: no forecast, so the current wait is held constant. */
  readonly assumesWaitHolds: true;
}

const FRESHNESS_ORDER: Record<Freshness, number> = { live: 0, estimated: 1, stale: 2 };

function worstOf(values: readonly Freshness[]): Freshness {
  return values.reduce<Freshness>(
    (worst, f) => (FRESHNESS_ORDER[f] > FRESHNESS_ORDER[worst] ? f : worst),
    'live',
  );
}

/**
 * Build a plan from already-ranked crossings.
 *
 * Takes `RankedPort[]` rather than raw ports so the trip screen and the home
 * screen cannot disagree about drive time, lane choice or mode filtering —
 * there is exactly one place that decides what "the wait at this crossing" is.
 *
 * Only crossings with a usable standard-lane number are candidates. A closed or
 * silent crossing cannot be planned through, and substituting its trusted-lane
 * figure would quietly plan a SENTRI trip for someone without SENTRI.
 */
export function solveTrip(
  ranked: readonly RankedPort[],
  planMode: PlanMode,
  targetMinutes: number,
  nowMinutes: number,
): TripPlan | null {
  const candidates = ranked.filter(
    (r): r is RankedPort & { primary: { waitMinutes: number } } =>
      r.totalMinutes !== null && r.primary?.waitMinutes != null,
  );
  if (candidates.length === 0) return null;

  const options: TripOption[] = candidates.map((r) => {
    const drive = r.drive.minutes;
    const wait = r.primary.waitMinutes;

    if (planMode === 'arrive') {
      // Work backward from the target: be across BUFFER minutes early, and
      // clearing the plaza takes CLEARANCE after the queue ends.
      const across = targetMinutes - BUFFER_MINUTES;
      const atBridge = across - CLEARANCE_MINUTES - wait;
      return {
        port: r.port,
        driveMinutes: drive,
        waitMinutes: wait,
        leaveMinutes: atBridge - drive,
        atBridgeMinutes: atBridge,
        acrossMinutes: across,
        freshness: r.freshness,
      };
    }

    // Forward from a fixed departure.
    const atBridge = targetMinutes + drive;
    return {
      port: r.port,
      driveMinutes: drive,
      waitMinutes: wait,
      leaveMinutes: targetMinutes,
      atBridgeMinutes: atBridge,
      acrossMinutes: atBridge + wait + CLEARANCE_MINUTES,
      freshness: r.freshness,
    };
  });

  // Arrive-by: the best crossing is the one you can leave for LAST.
  // Leave-at: departure is fixed, so the best is the one you are across
  // soonest. Ties break on the shorter line — less exposure to it changing.
  options.sort((a, b) =>
    planMode === 'arrive'
      ? b.leaveMinutes - a.leaveMinutes || a.waitMinutes - b.waitMinutes
      : a.acrossMinutes - b.acrossMinutes || a.waitMinutes - b.waitMinutes,
  );

  const [best, ...alternatives] = options as [TripOption, ...TripOption[]];

  return {
    planMode,
    best,
    alternatives,
    targetMinutes,
    worstFreshness: worstOf(options.map((o) => o.freshness)),
    departureHasPassed: planMode === 'arrive' && best.leaveMinutes < nowMinutes,
    assumesWaitHolds: true,
  };
}

/** Minutes past local midnight, from the device clock. */
export function nowInMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Minutes past midnight → "5:02 PM".
 *
 * Wraps rather than clamps: an arrive-by target early enough to push the
 * departure before midnight should read "11:40 PM", not a negative number.
 */
export function formatMinutes(total: number): string {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/** "18 min later" / "4 min earlier" / "same leave time". */
export function deltaText(option: TripOption, best: TripOption, planMode: PlanMode): string {
  const delta =
    planMode === 'arrive'
      ? best.leaveMinutes - option.leaveMinutes
      : option.acrossMinutes - best.acrossMinutes;
  if (delta === 0) return planMode === 'arrive' ? 'same leave time' : 'same arrival';
  return planMode === 'arrive' ? `${delta} min earlier` : `+${delta} min`;
}
