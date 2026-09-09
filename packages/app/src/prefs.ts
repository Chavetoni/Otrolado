import { useSyncExternalStore } from 'react';
import type { AlertEvent, AlertRuleId } from './alerts';
import { DEFAULT_TRIP_LANE, isTripLane, tripIsForToday, type TripLane } from './trip';
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
  /** Minutes past local midnight. */
  readonly targetMinutes: number;
  /** The lane every row was solved on when this was picked. */
  readonly lane: TripLane;
  /** The crossing the user tapped, so the trip can name itself. */
  readonly viaPortId: string;
  readonly viaName: string;
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
  rules: { faster: true, time_to_leave: true, closure: true, spike: true },
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
 *
 * THE UPDATERS MUST CARRY INTENT, NOT A FLIP. Pre-hydration state is
 * `DEFAULTS`, so a crossing that storage already holds as pinned renders
 * unpinned for those first ~100 ms. If the user taps pin on it, the in-memory
 * state shows pinned — and a replayed "toggle" would then run over the stored
 * `pinned: [x]` and REMOVE it, inverting what they just saw happen. So the
 * toggles below resolve to a set-to-value ("pinned: true") against the state
 * at tap time, and that value is what replays. Replaying onto storage then
 * reproduces the screen the user acted on.
 */
type Updater = (prev: Prefs) => Prefs;
let pending: Updater[] = [];

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  void storage.setItem(KEY, JSON.stringify(state));
}

const MINUTES_IN_DAY = 24 * 60;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Rebuild a stored trip field by field, or reject it.
 *
 * Constructed explicitly rather than spread: a blob from an older build may
 * carry fields this shape no longer has (`mode`, `leaveMinutes`, `planMode`,
 * `fromCurrentLocation`), and spreading would carry them through into every
 * later write. Anything that fails validation drops the whole trip — a trip
 * with a NaN target or a blank crossing cannot be solved, and half a trip on
 * the Trips tab is worse than none.
 *
 * A trip saved on an earlier day is dropped here too. Trips are today-only
 * (`tripIsForToday`); if one survived a relaunch the Alerts tab would show the
 * time-to-leave rule ON with nothing behind it.
 */
function parseStoredTrip(raw: unknown): SavedTrip | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;

  const targetMinutes = t.targetMinutes;
  if (
    typeof targetMinutes !== 'number' ||
    !Number.isInteger(targetMinutes) ||
    targetMinutes < 0 ||
    targetMinutes >= MINUTES_IN_DAY
  ) {
    return null;
  }
  if (!isNonEmptyString(t.viaPortId) || !isNonEmptyString(t.viaName)) return null;
  if (!isNonEmptyString(t.savedAt) || !Number.isFinite(Date.parse(t.savedAt))) return null;
  if (!tripIsForToday(t.savedAt)) return null;

  return {
    targetMinutes,
    // Trips stored before lanes existed were all on the general lane.
    lane: isTripLane(t.lane) ? t.lane : DEFAULT_TRIP_LANE,
    viaPortId: t.viaPortId,
    viaName: t.viaName,
    savedAt: t.savedAt,
  };
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
      const parsed = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
      loaded = {
        trip: parseStoredTrip(parsed.trip),
        rules: pickRules(parsed.rules),
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

/**
 * Only KNOWN rule ids survive hydration.
 *
 * Storage can hold ids from an older build — `reroute` was retired when
 * "another crossing is faster" replaced it — and spreading the stored object
 * wholesale carried those forward forever as dead keys on a typed record. It
 * also replaces an earlier `reroute: false` override that existed to keep an
 * unavailable rule switched off; every rule now runs, so the override became a
 * line pinning a value nobody could set.
 *
 * Non-boolean values are ignored rather than coerced: a corrupted entry falls
 * back to the default for that rule, not to whatever `Boolean(x)` makes of it.
 */
function pickRules(stored: unknown): Prefs['rules'] {
  const from =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const out = { ...DEFAULTS.rules };
  for (const id of Object.keys(DEFAULTS.rules) as AlertRuleId[]) {
    if (typeof from[id] === 'boolean') out[id] = from[id];
  }
  return out;
}

/** A list with `id` present or absent, as asked — idempotent, unlike a toggle. */
function withMember(list: readonly string[], id: string, present: boolean): readonly string[] {
  if (present) return list.includes(id) ? list : [...list, id];
  return list.filter((p) => p !== id);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = (): Prefs => state;

/** The current value for readers outside React — tests, one-off scripts. */
export const peekPrefs = snapshot;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The three `toggle*` methods read the current in-memory state AT CALL TIME to
 * decide what the user meant (on or off, in or out), then queue an updater
 * that sets exactly that. See the note on `pending` for why a flip would
 * invert the tap when replayed over storage.
 */
export const prefs = {
  saveTrip(trip: SavedTrip): void {
    update((s) => ({ ...s, trip }));
  },
  clearTrip(): void {
    update((s) => ({ ...s, trip: null }));
  },
  toggleRule(id: AlertRuleId): void {
    const on = !state.rules[id];
    update((s) => ({ ...s, rules: { ...s.rules, [id]: on } }));
  },
  toggleWatch(portId: string): void {
    const watched = !state.watchlist.includes(portId);
    update((s) => ({ ...s, watchlist: withMember(s.watchlist, portId, watched) }));
  },
  togglePin(portId: string): void {
    const pinnedNow = !state.pinned.includes(portId);
    update((s) => ({ ...s, pinned: withMember(s.pinned, portId, pinnedNow) }));
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
