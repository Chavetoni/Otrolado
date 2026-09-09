import type { LaneType, Port, TypicalCell } from '@otrolado/shared';
import { useTypical } from './queries';
import { DAY_NAMES, MONTH_NAMES, formatHour, portNow } from './typical';

/**
 * Today's typical picture for one crossing and lane, from the API.
 *
 * The thin React layer over `typical.ts`: it owns the query and the
 * provenance sentence, and leaves every judgement (is this busy, what is the
 * usual range) to the pure module so both can be tested without a renderer.
 */

export interface TypicalView {
  /** Port-local weekday name, e.g. "Tuesday". */
  readonly dayName: string;
  /** Port-local hour label, e.g. "3 pm". */
  readonly hourLabel: string;
  readonly hour: number;
  /** This hour's CBP average for the selected lane, or null when unimported. */
  readonly nowTypical: number | null;
  /** Today's weekday cells for the selected lane. Empty when unavailable. */
  readonly cells: readonly TypicalCell[];
  /** Provenance sentence, carrying the import vintage. Never render without it. */
  readonly attribution: string;
  readonly isLoading: boolean;
  /** True when the request failed and there is nothing cached to fall back on. */
  readonly failed: boolean;
  /** True when the importer has never covered this crossing. */
  readonly notImported: boolean;
  /** True when the crossing is imported but this lane has no history. */
  readonly laneMissing: boolean;
}

/**
 * Today's typical picture for one crossing and lane.
 *
 * Three absences, three different owners — never blame CBP for our own import
 * scope: no lanes at all means the importer hasn't covered this crossing (it
 * only runs for routable ports); a missing lane, or a lane with no cells for
 * this month and weekday, is CBP's gap.
 */
export function useTypicalNow(port: Port | undefined, lane: LaneType): TypicalView {
  const now = portNow(port?.feedTz ?? 'America/Chicago');
  const typical = useTypical(port?.id, now.month);

  const dayName = DAY_NAMES[now.dow - 1] ?? '';
  // "Last year" is a decaying claim: our copy is frozen at import time while
  // CBP's window rolls, so the vintage is anchored to the import date the API
  // reports rather than hardcoded. If the importer is forgotten for a year,
  // this line ages visibly instead of quietly becoming false.
  const importedAt = typical.data?.importedAt ? new Date(typical.data.importedAt) : null;
  const vintage = importedAt
    ? `the year before our ${MONTH_NAMES[importedAt.getMonth()]} ${importedAt.getFullYear()} import`
    : 'a previous year';

  const laneEntry = typical.data?.lanes.find((l) => l.mode === 'passenger' && l.lane === lane);
  const cells = laneEntry?.cells.filter((c) => c.dow === now.dow) ?? [];
  const nowTypical = cells.find((c) => c.hour === now.hour)?.avgWaitMinutes ?? null;

  return {
    dayName,
    hour: now.hour,
    hourLabel: formatHour(now.hour),
    nowTypical,
    cells,
    attribution:
      `CBP average for ${MONTH_NAMES[now.month - 1]} ${dayName}s, from ${vintage} — ` +
      'a pattern, not a prediction. Live forecasts arrive once enough history is collected.',
    isLoading: typical.isLoading,
    failed: Boolean(typical.error) && !typical.data,
    notImported: (typical.data?.lanes.length ?? 0) === 0,
    laneMissing: (typical.data?.lanes.length ?? 0) > 0 && !laneEntry,
  };
}
