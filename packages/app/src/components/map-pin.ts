import type { RankedPort } from '../ranking';
import { freshnessBadge } from '../freshness-ui';
import { color, status, waitColor } from '../theme';

/**
 * What a map pin says, in one place.
 *
 * The native map renders these through <Marker> children and the web map bakes
 * them into a Leaflet divIcon, so without a shared module the two drift — which
 * is exactly how the full-screen map ended up colouring pins on the raw-wait
 * scale while the list beside it used the total scale.
 *
 * The pin carries the STANDARD lane's WAIT minutes on `waitColor`'s thresholds —
 * the same number and scale as the list row's loud right-column figure. A
 * crossing far from the driver but with a short wait and one nearby with a long
 * wait should not read as the same colour just because their totals happen to
 * match; the map is a spatial picture of the booth, not the door-to-door pick.
 */

/** Standard lane's wait minutes, or null when there is nothing numeric to show. */
function pinWaitMinutes(row: RankedPort): number | null {
  return row.primary?.status === 'open' ? row.primary.waitMinutes : null;
}

/** A crossing whose standard lane has no usable number has no wait to show. */
export function pinLabel(row: RankedPort): string {
  const wait = pinWaitMinutes(row);
  if (wait === null) return '—';
  // A non-live wait is marked, not printed bare — "41m" with no qualifier
  // reads as a live figure, which is exactly what it isn't.
  return row.freshness === 'live' ? `${wait}m` : `~${wait}m`;
}

/**
 * Neutral grey for "no wait", never a colour from the scale. A closed or
 * unreported crossing rendered green would read as a fast crossing.
 *
 * An estimated or stale wait leaves the live scale entirely and takes the
 * freshness badge's own colours (amber tint for ESTIMATED, red tint for STALE) —
 * the same vocabulary the list-row badges use — so a reading nobody stands
 * behind can't wear the live green.
 */
export function pinColor(row: RankedPort): string {
  const wait = pinWaitMinutes(row);
  if (wait === null) return color.tabInactive;
  const badge = freshnessBadge(row.freshness);
  return badge ? badge.bg : waitColor(wait);
}

/** Bubble text: white on the saturated live scale, badge fg on the pale tints. */
export function pinTextColor(row: RankedPort): string {
  const wait = pinWaitMinutes(row);
  if (wait === null) return color.surface;
  const badge = freshnessBadge(row.freshness);
  return badge ? badge.fg : color.surface;
}

/** Short label under the pin — the prototype drops the ` · …` qualifier. */
export function pinName(row: RankedPort): string {
  return row.port.displayName.split(' · ')[0] ?? row.port.displayName;
}

/**
 * Only the top-ranked crossing carries a name label.
 *
 * The prototype labelled every pin, but it had five of them at hand-picked
 * pixel positions on a drawn map. The Rio Grande Valley has eleven at their
 * real coordinates, and four of Brownsville's sit within about five kilometres
 * — at 260px tall every label overlaps its neighbours into an unreadable pile.
 *
 * No crossing is dropped: all eleven keep a number bubble, and tapping any of
 * them opens its detail. The ranked list directly below names all eleven in
 * order, so the names are never more than a glance away.
 */
export function pinShowsName(row: RankedPort): boolean {
  return row.rank === 1;
}

/**
 * Later-ranked pins draw underneath earlier ones, so where bubbles do collide
 * the faster crossing stays readable rather than whichever happened to render
 * last.
 */
export function pinZIndex(row: RankedPort): number {
  return -row.rank;
}

/**
 * Fixed pin geometry, so anchors are derived rather than magic numbers. Both
 * maps must place the caret tip — not the bubble's centre — on the crossing's
 * coordinate, or every pin reads as offset to the north.
 */
export const PIN = {
  bubbleH: 22,
  caretH: 6,
  caretW: 10,
  nameGap: 2,
  nameH: 15,
} as const;

/** Distance from the top of the pin to the caret tip. */
export const PIN_TIP = PIN.bubbleH + PIN.caretH;
export const PIN_H_NAMED = PIN_TIP + PIN.nameGap + PIN.nameH;

/** Fraction of the pin's height at which the caret tip sits. */
export function pinAnchorY(showName: boolean): number {
  return showName ? PIN_TIP / PIN_H_NAMED : 1;
}

/** Mirrors what the pins can actually render: the live wait scale plus the
 * two non-live badge tints. Keep in lockstep with `pinColor`. */
export const LEGEND: readonly { label: string; color: string }[] = [
  { label: '<20m', color: status.clear.dot },
  { label: '20–60m', color: status.moderate.dot },
  { label: '>60m', color: status.heavy.dot },
  { label: 'est.', color: status.moderate.tint },
  { label: 'stale', color: status.heavy.tint },
];
