import { useQuery } from '@tanstack/react-query';
import { PILOT_PORTS, type PortsResponse } from '@otrolado/shared';
import { fetchPorts, fetchTypical, fetchWaits } from './api';

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

/**
 * CBP's previous-year hourly averages for one crossing and month. Changes only
 * when the importer re-runs server-side, so a long staleTime is honest — the
 * age that matters (last year) is in the data's own attribution, not in how
 * recently we fetched it.
 */
export function useTypical(portId: string | undefined, month: number) {
  return useQuery({
    queryKey: ['typical', portId, month],
    queryFn: () => fetchTypical(portId!, month),
    enabled: !!portId,
    staleTime: 60 * 60 * 1000,
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
