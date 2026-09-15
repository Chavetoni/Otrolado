import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system's Reduce Motion setting (iOS Accessibility, Android "Remove
 * animations", `prefers-reduced-motion` on web).
 *
 * Under it nothing in the app rotates or scales: the launch arm holds open
 * and the splash cross-fades, skeletons hold still, pressed controls change
 * colour without shrinking. Motion here is a reward, not information, so
 * removing it loses nothing a user needs.
 *
 * ONE store for the whole app (the same pattern as `useOnline`, `useOrigin`
 * and `prefs`): a single native read at import and a single change listener,
 * rather than one per component. Per-instance reads each started `false`, so
 * a skeleton pulsed for a frame or two for exactly the users who asked it not
 * to, on exactly the screen (first open) where skeletons appear.
 */
let reduceMotion = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  if (value === reduceMotion) return;
  reduceMotion = value;
  for (const l of listeners) l();
}

/** Resolves once the first native read has landed. The launch waits on it. */
export const reduceMotionReady: Promise<boolean> = AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    set(v);
    return v;
  })
  .catch(() => false);

AccessibilityInfo.addEventListener('reduceMotionChanged', set);

/** The current value, for code that is not a component (a Pressable style fn). */
export function isReduceMotion(): boolean {
  return reduceMotion;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const read = (): boolean => reduceMotion;

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
