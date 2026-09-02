import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { PortsResponse, TypicalResponse, WaitsResponse } from '@otrolado/shared';

/**
 * Where the API lives.
 *
 * On a physical phone, `localhost` is the phone itself — so the dev-server
 * host is derived from Expo's own `hostUri` (the LAN address Metro is already
 * serving from) rather than hardcoded. EXPO_PUBLIC_API_URL overrides it.
 *
 * Web needs its own branch: `hostUri` is undefined there. expo-constants on web
 * reads a manifest that babel-preset-expo inlines at build time, and that
 * manifest carries no `hostUri` — so the native path silently falls through to
 * the `localhost` literal. That is correct only when the browser happens to be
 * on the dev machine; opening the web build from a phone would fetch the
 * phone's own localhost and fail. Following `location.hostname` mirrors on web
 * what `hostUri` does on native.
 *
 * Note this does not make web same-origin: the page is served from Metro on
 * :8081 and the API is on :3000, so browser requests are cross-origin either
 * way and the API's CORS headers are load-bearing.
 */
function resolveBaseUrl(): string {
  const override = process.env['EXPO_PUBLIC_API_URL'];
  if (override) return override.replace(/\/$/, '');
  if (Platform.OS === 'web') {
    const webHost = globalThis.location?.hostname;
    return webHost ? `http://${webHost}:3000` : 'http://localhost:3000';
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const API_BASE_URL = resolveBaseUrl();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchPorts = () => getJson<PortsResponse>('/v1/ports');
export const fetchWaits = () => getJson<WaitsResponse>('/v1/waits');
export const fetchTypical = (portId: string, month: number) =>
  getJson<TypicalResponse>(`/v1/typical/${encodeURIComponent(portId)}?month=${month}`);
