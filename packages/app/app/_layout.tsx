import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_800ExtraBold,
} from '@expo-google-fonts/schibsted-grotesk';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { color } from '../src/theme';
import { storage } from '../src/storage';

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
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: color.appBg, justifyContent: 'center' }}>
        <ActivityIndicator color={color.navy} />
      </View>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.appBg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="port/[id]" options={{ presentation: 'card' }} />
          {/* Pushed from the Crossings map card, not a tab — see app/map.tsx. */}
          <Stack.Screen name="map" options={{ presentation: 'card' }} />
        </Stack>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
