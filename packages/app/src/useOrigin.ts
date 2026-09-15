import { useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import * as Location from 'expo-location';
import { DEFAULT_ORIGIN } from './drive';
import { findPlace, nearestPlace, type Place } from './places';
import { PILOT_REGION } from '@otrolado/shared';
import { storage } from './storage';

/**
 * A cached last-known fix older than this is not "current location" — it can
 * be from hours ago and a city away. Past it we fall through to a fresh GPS
 * reading, and if that fails, to the stated fallback (`isFallback: true`)
 * rather than presenting a stale point as the device's position.
 *
 * The same age also bounds how often the store re-reads: a screen mounting
 * within this window of the last attempt reuses the fix it already has.
 */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * `getCurrentPositionAsync` has no timeout of its own and can hang on iOS
 * with no fix. An unresolved read would pin `inflight` and block every later
 * refresh for the session, so it races a timer.
 */
const FIX_TIMEOUT_MS = 15_000;

/** Where a chosen starting point is remembered between launches. */
const STORAGE_KEY = 'otrolado-origin-place';

/**
 * Where the coordinates came from. Three sources, three different sentences —
 * and only one of them is an admission.
 *
 * - `gps`: the device's own fix.
 * - `chosen`: a place the user picked. As trustworthy as GPS for our purposes
 *   (see `places.ts`), so it is NOT flagged approximate — the user told us.
 * - `fallback`: nobody told us anything. Permission is off or unanswered and
 *   no place is chosen, so a point central to the valley stands in and every
 *   number derived from it must say so.
 */
export type OriginSource = 'gps' | 'chosen' | 'fallback';

export interface Origin {
  readonly lat: number;
  readonly lng: number;
  /** True only for `fallback` — a starting point nobody supplied. */
  readonly isFallback: boolean;
  readonly source: OriginSource;
  /**
   * "McAllen, TX" for a chosen place or a fix near one; the region for the
   * fallback; "Your location" for a fix no town is near (see `near`).
   */
  readonly label: string;
  /** The chosen place, when there is one. Null for gps and fallback. */
  readonly place: Place | null;
  /**
   * gps only: the town the fix is within `NEAR_MAX_MILES` of. Null means the
   * label names no place, so a sentence built on it must not say "near".
   */
  readonly near: Place | null;
}

/**
 * ONE origin for the whole app.
 *
 * Home, Plan, the map and `useSavedTrip` (in the tab layout) all read the
 * origin. When each held its own `useState` they each requested permission
 * and read GPS separately, and two could resolve at different moments — so the
 * Plan row and the time-to-leave nudge were briefly solved from different
 * starting points. A module store (same pattern as `prefs.ts`) gives every
 * reader the same value at the same instant, with one permission request and
 * one fix per refresh.
 *
 * Nothing runs at import: the first `useOrigin()` subscriber starts the read,
 * and not before the launch splash has finished (`allowLocationPrompt`), so
 * the permission prompt cannot appear before there is UI behind it. Tab
 * screens stay mounted for the session, so mounts alone would read GPS once
 * per launch; the store also refreshes when the app returns to the foreground
 * (throttled by LAST_KNOWN_MAX_AGE_MS), which is when a user who granted
 * location in Settings, or drove across the valley, comes back.
 *
 * A CHOSEN PLACE OUTRANKS GPS, and suppresses it entirely: `refresh` returns
 * early, so someone who has stated where they are is never asked for location
 * permission on top of it. Clearing the choice re-arms the read.
 */
const FALLBACK: Origin = {
  ...DEFAULT_ORIGIN,
  isFallback: true,
  source: 'fallback',
  label: PILOT_REGION.shortName,
  place: null,
  near: null,
};

let fix: { lat: number; lng: number } | null = null;
let chosen: Place | null = null;
let origin: Origin = FALLBACK;
/** Epoch ms of the last read attempt, granted or not. 0 = never tried. */
let attemptedAt = 0;
let inflight: Promise<void> | null = null;
let hydrated = false;
/**
 * Closed until the launch splash has finished (`allowLocationPrompt`). Home
 * mounts, and subscribes, UNDER the 1.2 s splash so it can fetch during the
 * hold — without this gate the system permission dialog landed on top of the
 * splash animation, before the user had seen a single thing the app does. A
 * warm start skips the splash and opens the gate at once.
 */
let promptAllowed = false;
const listeners = new Set<() => void>();

/**
 * Rebuild the public value from whichever inputs exist, newest-authority
 * first. Kept in one place so "what is the origin right now" has exactly one
 * answer and the label can never disagree with the coordinates beside it.
 */
function recompute(): void {
  if (chosen) {
    origin = {
      lat: chosen.lat,
      lng: chosen.lng,
      isFallback: false,
      source: 'chosen',
      label: chosen.label,
      place: chosen,
      near: null,
    };
  } else if (fix) {
    const near = nearestPlace(fix);
    origin = {
      ...fix,
      isFallback: false,
      source: 'gps',
      // The label is decoration on a real fix; the coordinates stay the
      // device's own (see nearestPlace). With no town near, it used to fall
      // back to the region, so a phone in Cupertino read "Starting near Rio
      // Grande Valley, TX". The fix is real, so "Your location" is the one
      // label that is true everywhere.
      label: near ? near.label : 'Your location',
      place: null,
      near,
    };
  } else {
    origin = FALLBACK;
  }
}

function emit(): void {
  for (const l of listeners) l();
}

async function locate(): Promise<void> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
      ]));
    if (!pos) return;
    fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    recompute();
    emit();
  } catch {
    // Keep whatever we have. Location is a nicety here, not a requirement.
  }
}

/**
 * Start a read unless one is running, a place is already chosen, or the last
 * attempt is still fresh. Denial is throttled by the same clock — on both
 * platforms a denied permission does not re-prompt, so retrying only costs a
 * call, and a user who grants it in Settings is picked up on the next
 * foreground past the window.
 */
function refresh(): void {
  if (!promptAllowed || inflight || chosen !== null) return;
  if (Date.now() - attemptedAt < LAST_KNOWN_MAX_AGE_MS) return;
  attemptedAt = Date.now();
  inflight = locate().finally(() => {
    inflight = null;
  });
}

/**
 * Read the remembered choice before touching GPS, so a returning user who
 * picked a place is never re-prompted for permission during the gap.
 */
async function hydrate(): Promise<void> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    const place = findPlace(raw);
    if (place) {
      chosen = place;
      recompute();
      emit();
    }
  } catch {
    // No stored choice, or storage unavailable: GPS/fallback is the answer.
  } finally {
    hydrated = true;
    refresh();
  }
}

/**
 * Set (or clear, with null) the starting point.
 *
 * Clearing does not restore a previous GPS fix from memory — it re-arms the
 * read by resetting the throttle, so the position that comes back is current
 * rather than whenever the app last looked.
 */
export function setOriginPlace(id: string | null): void {
  chosen = findPlace(id);
  recompute();
  emit();
  void storage
    .setItem(STORAGE_KEY, chosen?.id ?? '')
    .catch(() => {});
  if (chosen === null) {
    attemptedAt = 0;
    refresh();
  }
}

/**
 * Open the gate: called once the launch splash has dissolved. Waits for the
 * stored choice to hydrate if it hasn't yet (hydrate's own `refresh` then
 * runs), so a returning user with a chosen place is still never prompted.
 */
export function allowLocationPrompt(): void {
  promptAllowed = true;
  if (hydrated && listeners.size > 0) refresh();
}

let appState: NativeEventSubscription | null = null;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Lazy start on first subscribe; later mounts and foregrounds refresh only
  // once the fix has aged past LAST_KNOWN_MAX_AGE_MS, so the value stays
  // "current" as defined above without re-reading GPS on every tab change.
  if (!hydrated) void hydrate();
  else refresh();
  appState ??= AppState.addEventListener('change', (s) => {
    if (s === 'active') refresh();
  });
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      appState?.remove();
      appState = null;
    }
  };
}

const snapshot = (): Origin => origin;

/**
 * The user's position, a place they named, or a stated fallback.
 *
 * Location is requested but never required: denying it degrades to an
 * approximate origin rather than blocking the screen, and the user can name
 * their town instead. `isFallback` is surfaced in the UI so a drive time
 * derived from a guessed starting point is never presented as though someone
 * had supplied it.
 */
export function useOrigin(): Origin {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
