import type { Freshness } from '@otrolado/shared';
import { color, status } from './theme';

/**
 * How stale data is presented.
 *
 * Every number in this app carries one of these. The rule from the handoff is
 * that a stale number is never shown as though it were live — so 'estimated'
 * and 'stale' both change the presentation, they don't just add a tooltip.
 *
 * The design system's freshness states (v2 §07) map onto the shared policy
 * like so. The thresholds are the SERVER's, shipped in the response and
 * re-judged on the device (`useFreshness`); v2's illustrative 10/45 minute
 * cut-offs are not adopted because our gate is ingest age, not CBP's
 * hour-granular stamp — see packages/shared/src/freshness.ts.
 *
 *   live      → no badge; number in full ink.
 *   estimated → v2 "Stale": amber pill with a clock, `~` before the number,
 *               which steps down to `muted` — readable, visibly not current.
 *   stale     → same, but the pill is RED. v2 has one amber stale state; we
 *               keep two on purpose. Past `staleAfterS` the figure is frozen
 *               and not one to plan on, and a stale figure must never read as
 *               merely approximate — the verdicts differ, so the pills do.
 *
 * OFFLINE is a connection state, not a data state, and is shown once at the
 * top of a screen (`useOnline`) rather than on every row: the rows' verdicts
 * keep ageing on their own.
 */
export function freshnessBadge(
  f: Freshness,
): { label: string; bg: string; fg: string } | null {
  switch (f) {
    case 'live':
      return null;
    case 'estimated':
      return { label: 'ESTIMATED', bg: status.moderate.tint, fg: status.moderate.ink };
    case 'stale':
      return { label: 'STALE', bg: status.heavy.tint, fg: status.heavy.ink };
  }
}

/**
 * The ink a wait or total is set in on a LIGHT surface (white card, mist):
 * full ink while live, `muted` once the reading is no longer current (v2:
 * "number steps down to ink-secondary").
 */
export function numberInk(f: Freshness): string {
  return f === 'live' ? color.navy : color.muted;
}

/**
 * The same step-down ON COBALT (the hero): white while live, `cobaltLight`
 * once not. `muted` must never be used there — it is 1.5:1 on cobalt.
 */
export function numberInkOnCobalt(f: Freshness): string {
  return f === 'live' ? color.surface : color.cobaltLight;
}

/**
 * The verdict as a screen reader should hear it. A Pressable's label replaces
 * its children, so the badge and the `~` a sighted user sees are never read
 * unless the label says them — and "about 45 minutes" for a figure that is an
 * hour old is exactly the silent drift the badges exist to prevent.
 */
export function spokenFreshness(f: Freshness): string {
  switch (f) {
    case 'live':
      return 'live';
    case 'estimated':
      return 'estimated, not live';
    case 'stale':
      return 'stale, not live';
  }
}

/**
 * "as of 12 min ago" — shown under every figure. One implementation, in
 * @otrolado/shared, where it is tested.
 */
export { formatAge } from '@otrolado/shared';

/** "3:04 PM", in the crossing's zone when given. An unparseable stamp is "—". */
export function formatClock(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    // An unknown zone string.
    return '—';
  }
}
