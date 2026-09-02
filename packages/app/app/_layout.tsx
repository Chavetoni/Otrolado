import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
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
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: color.mist, justifyContent: 'center' }}>
        <ActivityIndicator color={color.cobalt} />
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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.mist } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="port/[id]" options={{ presentation: 'card' }} />
          {/* Pushed from the Crossings map card, not a tab — see app/map.tsx. */}
          <Stack.Screen name="map" options={{ presentation: 'card' }} />
        </Stack>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
