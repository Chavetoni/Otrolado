import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LaunchSplash } from '../src/components/LaunchSplash';
import { color } from '../src/theme';
import { storage } from '../src/storage';

/**
 * Hold the native splash (the gate-down frame) until LaunchSplash has painted
 * the same frame over the app — see that component for the handoff. Module
 * scope, as the docs insist: from inside a component it can arrive after the
 * splash has already gone. Resolves false on web, where there is no splash.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {});

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
}

const queryClient = new QueryClient({
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
const persister = createAsyncStoragePersister({
  storage,
  key: 'otrolado-query-cache',
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [launched, setLaunched] = useState(false);

  // Cobalt, not a spinner: on native this sits unseen behind the held splash,
  // and on web it is the splash's field until fonts arrive and the overlay
  // mounts. A mist screen with a spinner here would flash between the two.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: color.cobalt }} />;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.mist } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="port/[id]" options={{ presentation: 'card' }} />
          {/* Pushed from the Crossings map card, not a tab — see app/map.tsx. */}
          <Stack.Screen name="map" options={{ presentation: 'card' }} />
        </Stack>
        {/*
          Over the Stack, so the Crossings screen mounts and starts fetching
          beneath it during the hold — the dissolve reveals a screen that is
          already there, not one that starts loading when the splash ends.
        */}
        {!launched && <LaunchSplash onDone={() => setLaunched(true)} />}
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
