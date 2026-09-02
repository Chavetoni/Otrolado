import { useSyncExternalStore } from 'react';
import type { TravelMode } from '@otrolado/shared';
import type { AlertEvent, AlertRuleId } from './alerts';
import type { PlanMode } from './trip';
import { storage } from './storage';

/**
 * Everything the user has chosen that must outlive a reload: their saved trip,
 * which alert rules are on, which crossings they watch, and what has fired.
 *
 * WHY NOT REACT QUERY / CONTEXT
 *
 * This is client-owned state, not server cache, so it does not belong in the
 * query cache. And it is read from two tabs plus the tab layout (which runs the
 * alert evaluation on every poll regardless of which tab is showing), so it
 * cannot live in a screen's `useState`. A module-level store with
 * `useSyncExternalStore` gives every reader the same value with no provider to
 * thread through, which matters because `_layout.tsx` sits above the screens.
 *
 * Persistence is fire-and-forget on top of the platform-resolved `storage`
 * module (AsyncStorage on native, localStorage on web). A failed write loses a
 * preference, which is survivable; blocking the UI on it is not.
 */

export interface SavedTrip {
  readonly planMode: PlanMode;
  /** Minutes past local midnight. */
  readonly targetMinutes: number;
  readonly mode: TravelMode;
  readonly fromCurrentLocation: boolean;
  /** Recommended crossing at save time, so the trip can name itself. */
  readonly viaPortId: string;
  readonly viaName: string;
  /** Recommended departure at save time. Frozen — see the note in trips.tsx. */
  readonly leaveMinutes: number;
  readonly savedAt: string;
}

export interface Prefs {
  readonly trip: SavedTrip | null;
  readonly rules: Readonly<Record<AlertRuleId, boolean>>;
  readonly watchlist: readonly string[];
  /**
   * Crossings pinned to the top of the Crossings list. Distinct from
   * `watchlist` on purpose: watching gates which crossings alert, pinning is
   * pure list placement — conflating them would make "see it first" silently
   * opt someone into spike alerts.
   */
  readonly pinned: readonly string[];
  /** Newest first, capped. Persisted so the tab is not blank after a reload. */
  readonly activity: readonly AlertEvent[];
}

const ACTIVITY_CAP = 30;

/**
 * `reroute` defaults off and stays off — it is `available: false`. The other
 * three default on: a user who opens the Alerts tab and flips nothing should
 * still get the alerts the app can actually produce.
 */
const DEFAULTS: Prefs = {
  trip: null,
  rules: { spike: true, time_to_leave: true, closure: true, reroute: false },
  watchlist: [],
  pinned: [],
  activity: [],
};

const KEY = 'otrolado-prefs-v1';

let state: Prefs = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Mutations that arrived before the stored blob was read. Each is a pure
 * updater so it can be replayed on top of whatever storage actually held.
 * Without this, a tap in the first ~100 ms (pinning a crossing is the first
 * control on the first screen) would persist `{...DEFAULTS, pinned:[x]}` over
 * the saved trip and watchlist, and then hydration would overwrite the
 * in-memory state and drop the pin as well — both halves of the race lose.
 */
type Updater = (prev: Prefs) => Prefs;
let pending: Updater[] = [];

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  void storage.setItem(KEY, JSON.stringify(state));
}

/**
 * Read once at module load. Shape is validated field by field rather than
 * trusted: this JSON survives app upgrades, and a stored blob from an older
 * build must not be able to crash the tab bar by producing an undefined rule.
 */
void (async () => {
  let loaded: Prefs = DEFAULTS;
  try {
    const raw = await storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      loaded = {
        trip: parsed.trip ?? null,
        rules: { ...DEFAULTS.rules, ...(parsed.rules ?? {}), reroute: false },
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
        pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
        activity: Array.isArray(parsed.activity) ? parsed.activity.slice(0, ACTIVITY_CAP) : [],
      };
    }
  } catch {
    // Corrupt or absent — defaults are a fine place to start.
  } finally {
    // Replay anything the user did while we were reading, on top of what was
    // actually stored, then write the merged result exactly once.
    const replay = pending;
    pending = [];
    for (const fn of replay) loaded = fn(loaded);
    state = loaded;
    hydrated = true;
    if (replay.length > 0) persist();
    emit();
  }
})();

/**
 * Apply an updater. Before hydration the change is visible immediately (the
 * UI must respond to the tap) but not written — it is queued and persisted
 * once the stored blob is known, so it can never clobber it.
 */
function update(fn: Updater): void {
  state = fn(state);
  if (hydrated) persist();
  else pending.push(fn);
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = (): Prefs => state;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** True once the stored blob has been read. Guards "you have no trip" copy. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => hydrated,
  );
}

export const prefs = {
  saveTrip(trip: SavedTrip): void {
    update((s) => ({ ...s, trip }));
  },
  clearTrip(): void {
    update((s) => ({ ...s, trip: null }));
  },
  toggleRule(id: AlertRuleId): void {
    update((s) => ({ ...s, rules: { ...s.rules, [id]: !s.rules[id] } }));
  },
  toggleWatch(portId: string): void {
    update((s) => ({
      ...s,
      watchlist: s.watchlist.includes(portId)
        ? s.watchlist.filter((p) => p !== portId)
        : [...s.watchlist, portId],
    }));
  },
  togglePin(portId: string): void {
    update((s) => ({
      ...s,
      pinned: s.pinned.includes(portId)
        ? s.pinned.filter((p) => p !== portId)
        : [...s.pinned, portId],
    }));
  },
  /**
   * Append fired alerts, newest first, dropping ids already present.
   *
   * The dedupe is load-bearing: `evaluateLeaveRule` returns the same event id
   * on every poll inside the lead window, so without it a single trip would
   * paper the activity list with identical rows.
   */
  pushEvents(events: readonly AlertEvent[]): void {
    if (events.length === 0) return;
    update((s) => {
      const seen = new Set(s.activity.map((e) => e.id));
      const fresh = events.filter((e) => !seen.has(e.id));
      if (fresh.length === 0) return s;
      return { ...s, activity: [...fresh, ...s.activity].slice(0, ACTIVITY_CAP) };
    });
  },
  clearActivity(): void {
    update((s) => ({ ...s, activity: [] }));
  },
};
