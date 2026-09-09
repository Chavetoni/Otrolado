import type { Freshness, Port, TravelMode, WaitsLane } from '@otrolado/shared';
import type { RankedPort } from './ranking';

/**
 * The trip solver. Pure — no React, no I/O — for the same reason `ranking.ts`
 * is: this is the domain core, and it has to be checkable without a renderer.
 *
 * WHAT THIS CAN AND CANNOT ANSWER
 *
 * It answers "when do I leave to be across by X" for *right now*, using the
 * wait CBP is reporting at this moment and holding it constant for the length
 * of the drive. That assumption is the honest limit of the current data — we
 * have no archive, so there is no way to say what the line will be in 40
 * minutes — and the screen says so ("Wait now", "How this works").
 *
 * Arrive-by is the only question: the spec has no leave-at mode and the
 * earlier one was removed rather than kept as unreachable arithmetic.
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
 *
 * THE FORMULA
 *
 * leave-by = target − drive − wait, per the Trips screen spec. No slack is
 * added: the prototype's 10-minute buffer and 2-minute plaza clearance were
 * dropped with the redesign, so "across by 6:00" means the estimate lands you
 * across at 6:00 if drive and line hold. "How this works" says so.
 */

/**
 * The lane a trip is planned on. Every row in a plan uses the SAME lane, which
 * is what keeps the leave-by column comparable — a SENTRI row next to a
 * general row would be two different questions. Walking is the pedestrian
 * standard lane; the other three are passenger-vehicle lanes.
 */
export type TripLane = 'general' | 'ready' | 'sentri' | 'walking';

export const TRIP_LANES: readonly { readonly value: TripLane; readonly label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'ready', label: 'Ready' },
  { value: 'sentri', label: 'SENTRI' },
  { value: 'walking', label: 'Walking' },
];

export const DEFAULT_TRIP_LANE: TripLane = 'general';

/** The chip word for a lane — the one label every screen and alert uses. */
export function tripLaneLabel(lane: TripLane): string {
  return TRIP_LANES.find((l) => l.value === lane)?.label ?? lane;
}

export function isTripLane(v: unknown): v is TripLane {
  return TRIP_LANES.some((l) => l.value === v);
}

/** The travel mode `rankPorts` needs for a lane. */
export function tripLaneMode(lane: TripLane): TravelMode {
  return lane === 'walking' ? 'pedestrian' : 'passenger';
}

/**
 * The feed lane on a ranked row that a trip lane reads from.
 *
 * Checks the lane's own `mode` against the trip lane rather than trusting
 * that `ranked` was built with `tripLaneMode(lane)`: a caller that ranks
 * passenger rows and asks for Walking gets null, not the vehicle lane
 * labelled as a walk.
 */
export function laneOf(r: RankedPort, lane: TripLane): WaitsLane | null {
  const l = (() => {
    switch (lane) {
      case 'general':
      case 'walking':
        return r.primary;
      case 'ready':
        return r.ready;
      case 'sentri':
        return r.trusted;
    }
  })();
  return l && l.mode === tripLaneMode(lane) ? l : null;
}

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
  readonly best: TripOption;
  readonly alternatives: readonly TripOption[];
  /** The time the user asked for, minutes past midnight. */
  readonly targetMinutes: number;
  /** The lane every option was solved on. */
  readonly lane: TripLane;
  /** Worst freshness among the options. The screen decides what to do with it. */
  readonly worstFreshness: Freshness;
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
 * Only crossings where the chosen lane is open with a number are candidates.
 * A closed or silent lane cannot be planned through, and substituting another
 * lane's figure would quietly answer a different question.
 */
export function solveTrip(
  ranked: readonly RankedPort[],
  targetMinutes: number,
  lane: TripLane = DEFAULT_TRIP_LANE,
): TripPlan | null {
  const candidates = ranked.flatMap((r) => {
    const l = laneOf(r, lane);
    return l?.status === 'open' && l.waitMinutes !== null ? [{ r, wait: l.waitMinutes, freshness: l.freshness }] : [];
  });
  if (candidates.length === 0) return null;

  const options: TripOption[] = candidates.map(({ r, wait, freshness }) => {
    // Work backward from the target: leave-by = target − drive − wait.
    const drive = r.drive.minutes;
    const atBridge = targetMinutes - wait;
    return {
      port: r.port,
      driveMinutes: drive,
      waitMinutes: wait,
      leaveMinutes: atBridge - drive,
      atBridgeMinutes: atBridge,
      acrossMinutes: targetMinutes,
      freshness,
    };
  });

  // The best crossing is the one you can leave for LAST. Ties break on the
  // shorter line — less exposure to it changing.
  options.sort((a, b) => b.leaveMinutes - a.leaveMinutes || a.waitMinutes - b.waitMinutes);

  const [best, ...alternatives] = options as [TripOption, ...TripOption[]];

  return {
    best,
    alternatives,
    targetMinutes,
    lane,
    worstFreshness: worstOf(options.map((o) => o.freshness)),
    assumesWaitHolds: true,
  };
}

/**
 * How late leaving RIGHT NOW would put you, in minutes, or null if the
 * departure has not passed yet.
 *
 * "Too late" is a dead end: it tells someone the plan failed without telling
 * them by how much, and 6 minutes late and 90 minutes late are completely
 * different decisions. This is the arithmetic behind the better sentence —
 * the departure has passed by exactly this much, so leaving now lands you
 * across that much after the target, holding the same wait the option was
 * solved on.
 *
 * It inherits every caveat the option carries (a straight-line drive, a wait
 * held constant), so callers render it hedged — "about 13 min late" — never as
 * a promise about arrival.
 */
export function minutesLate(option: TripOption, nowMinutes: number): number | null {
  const late = nowMinutes - option.leaveMinutes;
  return late > 0 ? late : null;
}

/** Every option in a plan, recommended first. */
export function planOptions(plan: TripPlan): readonly TripOption[] {
  return [plan.best, ...plan.alternatives];
}

/**
 * The inputs a saved trip is re-solved from. Structural rather than importing
 * `SavedTrip` so `prefs.ts` can keep depending on this module and not the other
 * way round.
 */
export interface SavedTripInputs {
  readonly targetMinutes: number;
  readonly lane: TripLane;
  readonly viaPortId: string;
}

export interface SavedTripStatus {
  /**
   * The saved crossing, solved against the wait reported now. Null when it
   * cannot be planned through — closed lane, no such lane, or not reporting —
   * in which case the nudge cannot be computed and the user must be told so.
   */
  readonly via: TripOption | null;
  /** The saved crossing's current departure has already passed. */
  readonly departureHasPassed: boolean;
}

/**
 * Re-solve a saved trip against the wait reported now.
 *
 * A saved trip stores the user's *question* (target, lane, chosen crossing);
 * the leave time is an answer, and answers move with the line. Firing the
 * time-to-leave nudge on the figure from save time would present a number
 * nobody stands behind any more. The nudge reads from this instead.
 */
export function resolveSavedTrip(
  saved: SavedTripInputs,
  ranked: readonly RankedPort[],
  nowMinutes: number,
): SavedTripStatus {
  const plan = solveTrip(ranked, saved.targetMinutes, saved.lane);
  const via = plan ? planOptions(plan).find((o) => o.port.id === saved.viaPortId) ?? null : null;
  return { via, departureHasPassed: via !== null && via.leaveMinutes < nowMinutes };
}

/**
 * A saved trip is for the day it was saved. Its target is minutes past *that*
 * midnight, and the wait it was built from belongs to that day's line, so
 * carrying it into tomorrow would nudge someone out the door on yesterday's
 * queue. Compared on the device's local calendar date.
 */
export function tripIsForToday(savedAt: string, now: Date = new Date()): boolean {
  const saved = new Date(savedAt);
  return (
    saved.getFullYear() === now.getFullYear() &&
    saved.getMonth() === now.getMonth() &&
    saved.getDate() === now.getDate()
  );
}

/** Minutes past local midnight, from the device clock. */
export function nowInMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Keep a target inside today. The stepper has no natural stop, and a target
 * past midnight would display as an early-morning time labelled "today" while
 * the solver treated it as tonight — two different trips under one number.
 */
export function clampToDay(minutes: number): number {
  return Math.max(0, Math.min(24 * 60 - 1, minutes));
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
