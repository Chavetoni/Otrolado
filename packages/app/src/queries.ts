import { useQuery } from '@tanstack/react-query';
import { PILOT_PORTS, type PortsResponse } from '@otrolado/shared';
import { fetchPorts, fetchWaits } from './api';

/**
 * The bundled pilot directory, shaped like the wire response, so first launch
 * renders the eleven crossings with no network at all. Declared once so the
 * placeholder is referentially stable across renders.
 */
const BUNDLED_PORTS: PortsResponse = { ports: PILOT_PORTS };

/**
 * The port directory is effectively static; waits are not.
 *
 * `/waits` is CDN-cached for 30 s server-side, so polling faster than that
 * gains nothing but battery. Refetching on reconnect matters more than
 * interval here — border zones drop signal constantly.
 */
export function usePorts() {
  return useQuery({
    queryKey: ['ports'],
    queryFn: fetchPorts,
    // placeholderData, not initialData: it is never written to the cache or
    // persisted, `isPlaceholderData` stays true until /v1/ports actually
    // answers, and the query still fetches immediately — so the bundle can
    // never masquerade as a server response.
    placeholderData: BUNDLED_PORTS,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
  });
}

export function useWaits() {
  return useQuery({
    queryKey: ['waits'],
    queryFn: fetchWaits,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnReconnect: true,
    gcTime: Infinity,
  });
}
