import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * Whether the device currently has a network link, as React Query sees it.
 *
 * `app/_layout.tsx` feeds `onlineManager` from expo-network on native (its
 * default is `window` online/offline events, which a phone does not have), so
 * this is the same answer the queries pause on. It drives the OFFLINE
 * freshness state: when the link is down the app keeps showing the last
 * number it has and says so — "Last known · 42 min ago" — rather than a
 * spinner or an error over a perfectly good cached figure.
 */
const subscribe = (onChange: () => void): (() => void) => onlineManager.subscribe(onChange);
const read = (): boolean => onlineManager.isOnline();
// Server snapshot: there is no server, but the hook contract wants one.
const readServer = (): boolean => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, read, readServer);
}
