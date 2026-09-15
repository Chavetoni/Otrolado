import type { Direction, TravelMode } from '@otrolado/shared';

/**
 * Direction, as every screen with a direction control offers it (Crossings,
 * Plan, port detail) — one list, so the three cannot drift.
 *
 * NORTHBOUND IS FIRST AND IS THE DEFAULT, deliberately. A mockup round drew
 * "To Mexico" selected with a populated ranking, which cannot be honest:
 * Mexico publishes no federal wait-time feed and CBP publishes northbound
 * only, so a southbound default would make the app's first screen a page of
 * invented numbers. Southbound is offered — travellers ask the question — and
 * each screen answers it with its no-official-data notice.
 *
 * Labels name the destination, because that is how travellers say it; compass
 * words are the feed's vocabulary, not theirs.
 */
export const DIRECTIONS = [
  { value: 'northbound', label: 'To U.S.' },
  { value: 'southbound', label: 'To Mexico' },
] as const satisfies readonly { value: Direction; label: string }[];

/**
 * The traveller classes the app offers.
 *
 * Cargo (`commercial`) is deliberately absent. The pilot targets ordinary
 * travellers, and a freight crossing is a different product: brokers, docks,
 * FAST enrolment and a lane whose wait behaves nothing like the passenger one.
 * Shipping a half-built version of it would have been worse than shipping none.
 *
 * This is a PRODUCT scope decision, not a data one. `commercial` remains in the
 * domain vocabulary, the database enum and the archive, and ingest keeps
 * writing commercial lanes on every tick — wait history cannot be backfilled,
 * so switching collection off would permanently destroy the record needed to
 * build the freight product later. It costs nothing to keep: the same single
 * feed call returns it either way.
 *
 * One list, three screens. Home, Trips and the full-screen map all read from
 * here, so a mode can never be offered on one surface and missing on another.
 */
export const TRAVEL_MODES = [
  { value: 'passenger', label: 'Vehicle' },
  { value: 'pedestrian', label: 'Walk' },
] as const satisfies readonly { value: TravelMode; label: string }[];

/** The subset of `TravelMode` the UI actually exposes. */
export type UiTravelMode = (typeof TRAVEL_MODES)[number]['value'];

export const DEFAULT_TRAVEL_MODE: UiTravelMode = 'passenger';

export function isUiTravelMode(value: string | undefined): value is UiTravelMode {
  return TRAVEL_MODES.some((m) => m.value === value);
}

export function travelModeLabel(mode: UiTravelMode): string {
  return TRAVEL_MODES.find((m) => m.value === mode)?.label ?? 'Vehicle';
}
