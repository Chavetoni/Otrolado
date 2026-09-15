import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';
import { storage } from './storage';

/**
 * The app's one QueryClient, its persister, and the native focus/online
 * wiring React Query needs.
 *
 * In its own module, not in app/_layout.tsx, because Fast Refresh re-executes
 * a component module whenever an edit bubbles up to it (an edit to theme.ts
 * does). Re-executing _layout built a NEW client: the persister's restore is
 * one-shot, so the new cache started empty and was then persisted over the
 * real one; and on iOS re-registering the network listener cancelled the path
 * monitor until a full reload. Nothing here imports a screen or the theme, so
 * edits to those no longer reach it. (Dev-only; production never reloads.)
 */

/**
 * Tell React Query when the app is in the foreground.
 *
 * Its default focus detection is `document.visibilitychange`, which does not
 * exist on native — so without this, `isFocused()` is always true: the 60 s
 * waits interval keeps polling with the app backgrounded (against the
 * no-background-polling invariant, and pointless — nothing is looking) and
 * nothing refetches when the user comes back, so they see the snapshot from
 * whenever they left until the next tick. Mapping AppState `active` onto
 * focus fixes both: `refetchIntervalInBackground` is false on the waits
 * query, so the interval pauses while unfocused, and `refetchOnWindowFocus`
 * (default on) refreshes anything stale the moment the app returns. Web keeps
 * the built-in listener.
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });

  /*
   * Same gap for connectivity: React Query's default online detection is
   * `window` online/offline events, which native does not have, so on a phone
   * it believed it was always online. `refetchOnReconnect` never fired, and
   * the designed offline states (a paused fetch with nothing cached, the
   * OFFLINE pill) never rendered — a user in a dead zone got "check that the
   * API is running" instead. expo-network reports the real link state.
   *
   * The explicit first read matters on Android: its listener only fires on a
   * CHANGE (network available / lost / capabilities), so a phone that
   * launches with no network never hears an event and would stay "online"
   * forever. iOS's path monitor reports the current path on start, so the
   * read is redundant there but harmless.
   */
  onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync()
      .then((state) => setOnline(Boolean(state.isConnected)))
      .catch(() => {});
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(Boolean(state.isConnected));
    });
    return () => subscription.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      // Border zones have terrible coverage. Showing the last known snapshot
      // with its age attached beats showing a spinner or an error — the age
      // label is what keeps that honest.
      networkMode: 'offlineFirst',
    },
  },
});

// Storage backend is platform-resolved — see src/storage.ts.
export const persister = createAsyncStoragePersister({
  storage,
  key: 'otrolado-query-cache',
});

/** A persisted cache older than this is discarded on restore. */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
