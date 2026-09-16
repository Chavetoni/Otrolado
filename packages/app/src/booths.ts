import type { WaitsLane } from '@otrolado/shared';

/**
 * How a crossing's booths are staffed right now, split by whether they serve
 * the lane a row is ranked on.
 *
 * The split exists because CBP's `maximum_lanes` is published ONCE PER GROUP —
 * the whole passenger plaza — while `lanes_open` is per lane. Hidalgo reports
 * `maximum_lanes: 12` with standard 2, SENTRI 2 and Ready 3 open: 7 of its 12
 * booths are staffed, 2 of them on standard. So pairing a per-lane `lanesOpen`
 * with a per-group `maxLanes` and calling the result "2 of 12 booths open" is
 * simply false — it undercounts the plaza by every booth on another lane, and
 * paints ten idle booths where five are.
 *
 * `onLane` + `onOther` + `closed` therefore always sum to `max`, and a caller
 * can render all three without doing arithmetic that reintroduces the error.
 */
export interface BoothBreakdown {
  /** CBP's `maximum_lanes` — booths in the whole group, all lane types. */
  readonly max: number;
  /** Open booths serving the lane this row is ranked on. */
  readonly onLane: number;
  /** Open booths serving the group's OTHER lanes (SENTRI, Ready). */
  readonly onOther: number;
  /** The remainder: booths CBP reports as staffed by nobody. */
  readonly closed: number;
}

/**
 * A lane's open booths, or null when CBP has not said.
 *
 * The distinction is the whole ballgame. `lanes_open` is an empty string in
 * two completely different situations: the lane is CLOSED, where zero booths
 * is a reported fact, and the lane is "Update Pending", where CBP is telling
 * us it has no current figure. Collapsing both to 0 makes the app assert an
 * empty plaza every night — at 00:00 local CBP flips every pilot port to
 * Update Pending, and a strip reading "0/12" there is not a stale number, it
 * is an invented one, and the most alarming one available.
 *
 * `not_available` is a third, genuine zero: the lane does not exist, so no
 * booth in the group is serving it.
 */
function openCount(lane: WaitsLane | null): number | null {
  if (lane === null) return 0;
  if (lane.lanesOpen !== null) return Math.max(0, lane.lanesOpen);
  return lane.status === 'closed' || lane.status === 'not_available' ? 0 : null;
}

/**
 * Split a group's booths around `primary`.
 *
 * `lanes` must already be narrowed to ONE mode and direction — that is the
 * group `maxLanes` describes. Returns null, meaning "draw nothing", whenever
 * the plaza cannot be described honestly:
 *
 *  - CBP publishes no `maximum_lanes` for the group. Not rare: it is the
 *    literal string "N/A" for the pedestrian group at 5 of the 11 pilot
 *    crossings.
 *  - ANY lane in the group has an unknown count. A missing sibling count
 *    would land in the remainder and be drawn as a closed booth, so a strip
 *    that looks like a complete plaza would be asserting closures CBP never
 *    reported. All lanes in a document share one `update_time` and move
 *    together anyway, so this is close to all-or-nothing in practice.
 */
export function boothBreakdown(
  lanes: readonly WaitsLane[],
  primary: WaitsLane | null,
): BoothBreakdown | null {
  const max = primary?.maxLanes ?? lanes.find((l) => l.maxLanes !== null)?.maxLanes ?? null;
  if (max === null || max <= 0) return null;

  const onLane = openCount(primary);
  if (onLane === null) return null;

  // Reference identity, not lane type: `primary` is picked out of this same
  // array, and it keeps the split correct even if a group ever repeats a type.
  let other = 0;
  for (const lane of lanes) {
    if (lane === primary) continue;
    const n = openCount(lane);
    if (n === null) return null;
    other += n;
  }

  // CBP has never been seen to report more open booths than the group's max,
  // but the two fields are independent, so clamp rather than render a strip
  // with more pills than it has booths.
  const capped = Math.min(onLane, max);
  const onOther = Math.min(other, max - capped);

  return { max, onLane: capped, onOther, closed: max - capped - onOther };
}
