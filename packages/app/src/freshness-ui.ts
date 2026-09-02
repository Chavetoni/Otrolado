import type { Freshness } from '@otrolado/shared';
import { status } from './theme';

/**
 * How stale data is presented.
 *
 * Every number in this app carries one of these. The rule from the handoff is
 * that a stale number is never shown as though it were live — so 'estimated'
 * and 'stale' both change the presentation, they don't just add a tooltip.
 */
export function freshnessBadge(f: Freshness): { label: string; bg: string; fg: string } | null {
  switch (f) {
    case 'live':
      return null;
    case 'estimated':
      return { label: 'ESTIMATED', bg: status.moderate.tint, fg: status.moderate.ink };
    case 'stale':
      return { label: 'STALE', bg: status.heavy.tint, fg: status.heavy.ink };
  }
}

/** "as of 12 min ago" — shown under every figure. */
export function formatAge(seconds: number | null): string {
  if (seconds === null) return 'age unknown';
  if (seconds < 60) return 'just now';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
}

export function formatClock(iso: string, tz?: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return '—';
  }
}
