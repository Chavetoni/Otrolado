/**
 * Web storage adapter.
 *
 * @react-native-async-storage/async-storage throws during module evaluation in
 * this web build, so web never imports it — this file replaces the module
 * wholesale via Metro's platform resolution. localStorage is the natural
 * equivalent and is already synchronous, so the async wrapper is a formality.
 *
 * Guarded because localStorage is absent during static rendering and can throw
 * outright in private-browsing modes; losing the cache is survivable, a crash
 * on boot is not.
 */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* quota or private mode — cache is best-effort */
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
