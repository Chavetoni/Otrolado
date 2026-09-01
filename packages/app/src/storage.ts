import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent key-value store for the query cache.
 *
 * Native uses AsyncStorage; `storage.web.ts` overrides this on web, where
 * AsyncStorage's build throws during module init. Metro picks the platform
 * variant automatically, TypeScript resolves this file.
 *
 * The plan calls for MMKV, which is a native module Expo Go cannot load.
 * Swapping it in later means changing this file and nothing else.
 */
export const storage = AsyncStorage;
