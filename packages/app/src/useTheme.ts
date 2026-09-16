import { useSyncExternalStore } from 'react';
import { Appearance, AppState, Platform, StyleSheet } from 'react-native';
import { storage } from './storage';
import { themes, type Scheme, type Theme } from './theme';

/**
 * Which palette the app is drawing with, and the one way to read it.
 *
 * Two answers only: light or dark. Until the user has chosen, the app draws
 * in the SYSTEM appearance (iOS Settings → Display, Android's dark theme,
 * `prefers-color-scheme` on web) — that is a starting value, not a third
 * option. The appearance button in the tab headers (`ThemeToggle`) switches
 * between the two, and the first tap stores a choice that the phone's
 * setting never overrides again. It is a device preference, persisted like
 * `prefs`. (An earlier build offered Auto as a third choice; a stored
 * 'system' from it reads as "not chosen yet".)
 *
 * ONE store for the whole app (the same pattern as `useReduceMotion`,
 * `useOnline`, `useOrigin` and `prefs`): a single native read at import and
 * a single change listener, rather than React Native's per-component
 * `useColorScheme` — which also could not express the override.
 *
 * iOS reports the OPPOSITE scheme for a moment when the app is backgrounded:
 * the system renders app-switcher snapshots in both appearances and
 * `Appearance` fires a change for each. Accepting those would flip the whole
 * app on the way to the background and back on the way in, and
 * `useColorScheme` does. The guard below ignores changes while the app is not
 * active and re-reads once it is.
 *
 * The override is also pushed to NATIVE (`Appearance.setColorScheme`), so the
 * keyboard, alerts, the date picker and Apple Maps match the app rather than
 * the phone. That call does not exist on web, where only the app's own
 * palette changes.
 *
 * `Appearance.getColorScheme()` only reports the real setting once the native
 * side allows it: `userInterfaceStyle` is "automatic" in app.json for that
 * reason (a "light" value there pins the app to light at the OS level). That
 * is an Info.plist key, so it takes a native rebuild, not a Metro reload.
 */

const KEY = 'otrolado-appearance-v1';

function isScheme(v: unknown): v is Scheme {
  return v === 'light' || v === 'dark';
}

function readSystem(): Scheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

let system: Scheme = readSystem();
/** The stored choice; null until the user has picked one. */
let preference: Scheme | null = null;
let scheme: Scheme = system;
/** True once the user has chosen in this session, so a slow read cannot overwrite it. */
let chosen = false;
const listeners = new Set<() => void>();

function recompute(): void {
  const next = preference ?? system;
  if (next === scheme) return;
  scheme = next;
  for (const l of listeners) l();
}

/** Tell native what to draw its own UI in. */
function applyNative(pref: Scheme): void {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  try {
    Appearance.setColorScheme(pref);
  } catch {
    // Older OS versions: the app's own palette still follows the choice.
  }
}

Appearance.addChangeListener(({ colorScheme }) => {
  // The iOS snapshot trap — see above. Web has no background state.
  if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
  // While an override is pushed to native, these events echo the override,
  // not the phone — and once chosen, the phone no longer decides anyway.
  if (preference !== null) return;
  system = colorScheme === 'dark' ? 'dark' : 'light';
  recompute();
});

if (Platform.OS !== 'web') {
  // A change made while backgrounded (Control Centre, a scheduled switch at
  // sunset) arrives as an event the guard above dropped; catch it on return.
  AppState.addEventListener('change', (state) => {
    if (state !== 'active' || preference !== null) return;
    system = readSystem();
    recompute();
  });
}

/*
 * Hydrate the stored choice. Asynchronous, so the first frames draw in the
 * system scheme; on native the held splash covers them, and on web the page
 * background already matches the system. A tap that lands before the read
 * wins over what storage held.
 */
void storage
  .getItem(KEY)
  .then((raw) => {
    if (chosen || !isScheme(raw)) return;
    preference = raw;
    applyNative(raw);
    recompute();
  })
  .catch(() => {});

/** Choose the appearance: light or dark, stored for the next launch. */
export function setScheme(next: Scheme): void {
  chosen = true;
  if (next === preference) return;
  preference = next;
  applyNative(next);
  recompute();
  void storage.setItem(KEY, next).catch(() => {});
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const readScheme = (): Scheme => scheme;
/**
 * The theme a component draws with. The object is stable per scheme, so it
 * is safe in `useMemo` / `useCallback` dependency lists.
 */
export function useTheme(): Theme {
  return themes[useSyncExternalStore(subscribe, readScheme, readScheme)];
}

/**
 * A themed `StyleSheet.create`.
 *
 * Module-scope stylesheets cannot read the theme (they are built once, at
 * import), so every component with a colour in its styles declares them as a
 * factory and reads the result with a hook:
 *
 *   const useStyles = makeStyles((t) => ({
 *     card: { backgroundColor: t.color.surface, borderColor: t.color.line },
 *   }));
 *   function Card() {
 *     const styles = useStyles();
 *     ...
 *   }
 *
 * Built once per scheme and cached, so a re-render costs a map lookup, not a
 * `StyleSheet.create`; a scheme change builds the other sheet once. Layout,
 * type and radius tokens are still fine to reference statically inside the
 * factory — only colour differs between schemes.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  build: (t: Theme) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const cache: Partial<Record<Scheme, T>> = {};
  return function useStyles(): T {
    const t = useTheme();
    return (cache[t.scheme] ??= StyleSheet.create(build(t)));
  };
}
