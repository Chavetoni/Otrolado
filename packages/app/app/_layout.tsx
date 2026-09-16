import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LaunchSplash } from '../src/components/LaunchSplash';
import { WAITS_QUERY_KEY } from '../src/queries';
import { PERSIST_MAX_AGE_MS, persister, queryClient } from '../src/queryClient';
import { makeStyles, useTheme } from '../src/useTheme';
import { allowLocationPrompt } from '../src/useOrigin';
import { reduceMotionReady } from '../src/useReduceMotion';

/**
 * Hold the native splash (the gate-down frame) until the app has decided what
 * to show over it — see LaunchSplash for the handoff. Module scope, as the
 * docs insist: from inside a component it can arrive after the splash has
 * already gone. Resolves false on web, where there is no splash.
 *
 * The QueryClient and its native focus/online wiring live in
 * src/queryClient.ts, not here — see that file for why.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * WARM START SKIPS THE LAUNCH SEQUENCE (v2 §09).
 *
 * The gate animation is a reward, not loading theatre. If the persisted waits
 * response is under ten minutes old the user was just here, and the app goes
 * straight to Crossings — the native splash fades out over the screen that is
 * already drawn. Ten minutes is a latency threshold about the USER's session,
 * not a trust threshold about the data: the numbers still carry their own
 * ages and verdicts (`useFreshness`) whichever way the app opened.
 *
 * The decision waits for the persisted cache to restore (`onSuccess`), which
 * is also when React Query has the data to render — so the reveal never shows
 * a skeleton that a warm start should have skipped. On native the held splash
 * covers that wait; on web a cobalt veil the colour of the splash does.
 */
const WARM_START_MAX_AGE_MS = 10 * 60 * 1000;
/** If the restore never reports back, launch anyway rather than hang on cobalt. */
const DECISION_TIMEOUT_MS = 800;

type LaunchPhase = 'pending' | 'animate' | 'done';

function isWarmStart(client: QueryClient): boolean {
  const state = client.getQueryState(WAITS_QUERY_KEY);
  return state?.data !== undefined && Date.now() - state.dataUpdatedAt < WARM_START_MAX_AGE_MS;
}

export default function RootLayout() {
  /*
   * Poppins with tabular-figure alternates added (`scripts/build-tabular-fonts.py`).
   * Stock Poppins has no `tnum` feature, so `fontVariant: ['tabular-nums']`
   * did nothing on any platform and every wait and time number changed width
   * as it updated. Loaded INSTEAD of @expo-google-fonts/poppins, never beside
   * it: the PostScript names are identical, and iOS resolves a duplicate name
   * to whichever file registered first.
   *
   * A load ERROR still launches. `useFonts` never reports loaded after an
   * error, and gating on `loaded` alone held the native splash up forever —
   * on web, a font that timed out after 12 s left a permanent cobalt screen.
   * The system font standing in is a worse-looking app, not a broken one.
   */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular: require('../assets/fonts/Poppins_400Regular.ttf'),
    Poppins_500Medium: require('../assets/fonts/Poppins_500Medium.ttf'),
    Poppins_600SemiBold: require('../assets/fonts/Poppins_600SemiBold.ttf'),
    Poppins_700Bold: require('../assets/fonts/Poppins_700Bold.ttf'),
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
  const fontsReady = fontsLoaded || fontError != null;

  const [phase, setPhase] = useState<LaunchPhase>('pending');
  const [reduceMotion, setReduceMotion] = useState(false);
  const decided = useRef(false);
  const theme = useTheme();
  const styles = useStyles();

  const finishLaunch = useCallback((): void => {
    setPhase('done');
    // The location prompt waits for the splash — see useOrigin.
    allowLocationPrompt();
  }, []);

  /** Runs once, on restore, restore failure, or the timeout — whichever is first. */
  const decide = useCallback((): void => {
    if (decided.current) return;
    decided.current = true;
    void reduceMotionReady.then((reduce) => {
      setReduceMotion(reduce);
      if (isWarmStart(queryClient)) finishLaunch();
      else setPhase('animate');
    });
  }, [finishLaunch]);

  useEffect(() => {
    if (!fontsReady) return;
    const id = setTimeout(decide, DECISION_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [fontsReady, decide]);

  /*
   * Once the app is what's on screen, drop the native splash. After the
   * animated launch this is a no-op (LaunchSplash already hid it under its
   * own first frame); on a warm start it is THE reveal — a 200ms fade from the
   * gate-down frame to a Crossings screen that is already rendered. Deferred a
   * tick so the commit that set `done` has painted first.
   */
  useEffect(() => {
    if (phase !== 'done') return;
    try {
      SplashScreen.setOptions({ fade: true, duration: 200 });
    } catch {
      // Older runtimes / web: hide without the fade.
    }
    const id = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 0);
    return () => clearTimeout(id);
  }, [phase]);

  // Cobalt, not a spinner: on native this sits unseen behind the held splash,
  // and on web it is the splash's field until fonts arrive and the overlay
  // mounts. A mist screen with a spinner here would flash between the two.
  if (!fontsReady) {
    return <View style={styles.field} />;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE_MS }}
      onSuccess={decide}
      onError={decide}
    >
      <SafeAreaProvider>
        {/* Dark text on the light page, light text on the dark one. Screens
            with a navy header (port detail, origin) set "light" themselves. */}
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.page } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="port/[id]" options={{ presentation: 'card' }} />
          {/* Pushed from the Crossings map card, not a tab — see app/map.tsx. */}
          <Stack.Screen name="map" options={{ presentation: 'card' }} />
        </Stack>
        {/*
          Over the Stack, so the Crossings screen mounts and starts fetching
          beneath it during the hold — the dissolve reveals a screen that is
          already there, not one that starts loading when the splash ends.
          While the warm-start decision is pending, a plain cobalt field the
          colour of the splash stands in (invisible under the native splash).
        */}
        {phase === 'pending' && (
          <View style={styles.veil}>
            <StatusBar style="light" />
          </View>
        )}
        {phase === 'animate' && (
          <LaunchSplash reduceMotion={reduceMotion} onDone={finishLaunch} />
        )}
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}

// Cobalt is the brand fill and the native splash's own colour (identical in
// both palettes), read through the theme like every other colour so no
// stylesheet in the app names a palette directly.
const useStyles = makeStyles(({ color }) => ({
  field: { flex: 1, backgroundColor: color.cobalt },
  veil: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: color.cobalt, zIndex: 100,
  },
}));
