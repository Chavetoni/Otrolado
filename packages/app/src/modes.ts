import type { TravelMode } from '@otrolado/shared';

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
