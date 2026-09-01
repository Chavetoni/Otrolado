import { useEffect, useMemo, useState } from 'react';
import { freshnessOf, type WaitsLane, type WaitsResponse } from '@otrolado/shared';

/**
 * Re-ages a waits response so what's on screen is true NOW, not at fetch time.
 *
 * THE BUG THIS EXISTS TO CLOSE
 *
 * The server computes `ingestAgeSeconds` and every lane's `freshness` at
 * response time. With the persisted 24h cache and `networkMode: 'offlineFirst'`
 * that response can sit on the device for hours, and rendering its verdicts
 * verbatim means a user opening the app offline after 3 hours reads "updated
 * 2 min ago" with no ESTIMATED badge — the exact silent-drift the honesty rules
 * forbid. The response deliberately ships `thresholds`, `generatedAt` and
 * per-lane `observedAt` so the client can re-run the judgement itself
 * (see `WaitsLane` in @otrolado/shared: "a client can re-derive the verdict
 * itself as the response sits in cache").
 *
 * The re-derivation uses React Query's `dataUpdatedAt` (our own clock at fetch
 * time) rather than the server's `generatedAt`, so device clock skew cancels
 * out of the ingest-age term: effective age = the server's measured age at
 * response time plus how long the response has sat here. The per-lane reading
 * age has to use `observedAt` (a server stamp) — there is no local anchor for
 * a per-lane time — which is the same trade the server itself makes.
 *
 * Nothing here invents data: verdicts only ever degrade as the clock advances,
 * along live → estimated → stale against the SAME thresholds the server used,
 * shipped in the response.
 */

/** Pure core, testable without a renderer — same reason ranking.ts is pure. */
export function reAgeWaits(
  data: WaitsResponse,
  /** React Query's `dataUpdatedAt`: ms epoch of when WE fetched this response. */
  dataUpdatedAt: number,
  nowMs: number,
): WaitsResponse {
  // Clamped at 0: a fetch "in the future" is clock jitter, not fresher data.
  const sittingSeconds = Math.max(0, (nowMs - dataUpdatedAt) / 1000);
  const ingestAgeSeconds =
    data.ingestAgeSeconds === null ? null : data.ingestAgeSeconds + sittingSeconds;

  return {
    ...data,
    ingestAgeSeconds,
    ports: data.ports.map((p) => ({
      ...p,
      lanes: p.lanes.map((lane) => ({
        ...lane,
        freshness: freshnessOf(
          {
            status: lane.status,
            ingestAgeSeconds,
            readingAgeSeconds: ageSeconds(lane.observedAt, nowMs),
            feedAgeSeconds: lane.feedAgeSeconds,
          },
          data.thresholds,
        ),
      })),
    })),
  };
}

/**
 * "CBP reported X min ago", anchored to now instead of frozen at ingest.
 *
 * The old rendering showed `feedAgeSeconds` — the gap at OBSERVATION time — so
 * it was wrong by up to the poll interval even when healthy, and unboundedly
 * wrong on cached data. Anchoring to `reportedAt` keeps the sentence true as
 * the clock advances. CBP's stamp is hour-granular and occasionally ahead of
 * its own snapshot clock (see CLAUDE.md on `update_time`), so a future stamp
 * clamps to 0 — "just now" — rather than going negative; the coarse rounding
 * in `formatAge` is the honest precision for an hour-granular source.
 */
export function reportedAgeSeconds(
  lane: Pick<WaitsLane, 'reportedAt'>,
  nowMs: number,
): number | null {
  return lane.reportedAt === null ? null : ageSeconds(lane.reportedAt, nowMs);
}

function ageSeconds(iso: string, nowMs: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (nowMs - t) / 1000);
}

/** Coarse on purpose: `formatAge` rounds to minutes, so a finer tick is noise. */
const TICK_MS = 30_000;

export interface AgedWaits {
  /**
   * The response with `ingestAgeSeconds` and every lane's `freshness` re-aged
   * to now. Same type as the wire response, so it drops into `rankPorts`,
   * `solveTrip` and the screens wherever the raw `waits.data` went — prefer it
   * there. Undefined exactly when the query has no data.
   */
  readonly data: WaitsResponse | undefined;
  /** The clock the ages were judged against, for anchoring other stamps. */
  readonly nowMs: number;
}

/**
 * The waits query result, re-aged on a ticking clock.
 *
 * Takes the query result rather than calling `useWaits` itself so there is one
 * query instance per screen and this hook cannot drift from it. Deliberately
 * NOT used by `useAlertWatch` — alert rules diff consecutive polls, they don't
 * present ages.
 */
export function useAgedWaits(query: {
  readonly data: WaitsResponse | undefined;
  readonly dataUpdatedAt: number;
}): AgedWaits {
  const nowMs = useNowMs();
  const { data, dataUpdatedAt } = query;
  return useMemo(
    () => ({
      // `dataUpdatedAt <= 0` means data that was never actually fetched —
      // React Query reports 0 for placeholderData and other never-resolved
      // states. Re-aging such data would anchor "how long has this sat here"
      // to the 1970 epoch and brand every number STALE, which is a false
      // verdict, not an honest one. There is no age to attach, so present it
      // as no data at all; the screens' loading states cover that.
      data:
        data === undefined || dataUpdatedAt <= 0
          ? undefined
          : reAgeWaits(data, dataUpdatedAt, nowMs),
      nowMs,
    }),
    [data, dataUpdatedAt, nowMs],
  );
}

function useNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return nowMs;
}
