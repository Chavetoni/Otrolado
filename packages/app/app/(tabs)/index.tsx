import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PILOT_REGION, type Direction } from '@otrolado/shared';
import CrossingsMap from '../../src/components/CrossingsMap';
import { Badge, Chip, SegmentedControl } from '../../src/components/ui';
import { openDirections } from '../../src/directions';
import { PeakAdvisoryCard } from '../../src/components/PeakAdvisoryCard';
import { formatAge, freshnessBadge } from '../../src/freshness-ui';
import {
  laneStatusLabel,
  rankPorts,
  readySavings,
  savingsText,
  READY_HIGHLIGHT_MIN,
  type RankedPort,
} from '../../src/ranking';
import {
  DEFAULT_TRAVEL_MODE,
  TRAVEL_MODES,
  travelModeLabel,
  type UiTravelMode,
} from '../../src/modes';
import { usePorts, useWaits } from '../../src/queries';
import { useAgedWaits } from '../../src/useFreshness';
import { useOrigin } from '../../src/useOrigin';
import { color, font, radius, space, tabular, totalColor } from '../../src/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<UiTravelMode>(DEFAULT_TRAVEL_MODE);
  const [direction, setDirection] = useState<Direction>('northbound');

  const origin = useOrigin();
  const ports = usePorts();
  const waits = useWaits();
  // Verdicts and ages re-judged against the clock NOW, not at fetch time —
  // cached data must degrade on screen, not stay "2 min ago" forever.
  const aged = useAgedWaits(waits);

  const ranked = useMemo(
    () => rankPorts(ports.data?.ports ?? [], aged.data, origin, mode, direction),
    [ports.data, aged.data, origin, mode, direction],
  );

  const best = ranked.find((r) => r.totalMinutes !== null);
  const savings = savingsText(ranked);
  const ingestAge = aged.data?.ingestAgeSeconds ?? null;
  const refreshing = waits.isFetching && !waits.isLoading;

  /**
   * A failed fetch and a genuinely empty result are different sentences.
   * `rankPorts` joins waits onto ports, so a dead /v1/ports empties the entire
   * list even when waits succeeded — which previously rendered as "No crossings
   * report this mode right now", blaming the mode filter for a network fault.
   */
  const loadError = ports.error ?? waits.error;
  const hasWaits = waits.data !== undefined;
  /**
   * The first genuine load: no waits response at all — nothing fetched, and
   * nothing restored from the persisted cache — with the answer still on its
   * way. Without this gate the bundled port directory (placeholderData) puts
   * 11 rows up immediately and `rankPorts` fills their missing lanes with
   * "no lane" plus a fabricated STALE verdict, which flashed on every cold
   * start for the length of the first round trip. STALE means "we have a
   * number and it is old"; a load in flight is a different sentence — say
   * "loading". `fetchStatus === 'paused'` (offline with no cache) deliberately
   * falls through to the rows: the bundled directory with no numbers IS the
   * designed no-network first launch.
   */
  const waitsLoading =
    aged.data === undefined && waits.isPending && waits.fetchStatus !== 'paused';
  const showingCached = Boolean(loadError) && ranked.length > 0;
  const retry = (): void => {
    void ports.refetch();
    void waits.refetch();
  };

  return (
    <ScrollView
      style={{ backgroundColor: color.appBg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + space.tabBarClearance }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void waits.refetch()} tintColor={color.navy} />
      }
    >
      <View style={styles.header}>
        <View style={{ gap: 2 }}>
          <View style={styles.locationRow}>
            <View style={styles.gpsDot} />
            <Text style={styles.locationText}>
              {origin.isFallback
                ? `Approximate location · ${PILOT_REGION.shortName}`
                : `Near ${PILOT_REGION.shortName}`}
            </Text>
          </View>
          <Text style={styles.title}>Crossings</Text>
        </View>
      </View>

      <DirectionCard direction={direction} onFlip={() => setDirection((d) => (d === 'northbound' ? 'southbound' : 'northbound'))} />

      <View style={{ paddingHorizontal: space.gutter, marginTop: 12 }}>
        <SegmentedControl options={TRAVEL_MODES} value={mode} onChange={setMode} />
      </View>

      {direction === 'southbound' ? (
        <SouthboundNotice />
      ) : waitsLoading ? (
        <View style={styles.list}>
          <Text style={styles.emptyText}>Loading crossings…</Text>
        </View>
      ) : (
        <>
          {best && <HeroCard best={best} savings={savings} />}
          {best && (
            <PeakAdvisoryCard
              portName={best.port.displayName}
              // Live readings only: "good window NOW" anchored to a stale
              // current wait would compare the future against the past.
              currentWait={
                best.freshness === 'live' ? (best.primary?.waitMinutes ?? null) : null
              }
              // The forecast series this reads is /v1/forecast P50, which does
              // not exist yet — predictions need ~6 weeks of archive still
              // being collected. Null keeps the card hidden (its designed
              // no-signal state) rather than fed from mock data; wire the real
              // series through this prop when the endpoint ships.
              forecast={null}
            />
          )}
          {/*
            The prototype's inline map card, between the hero and the list.
            Fed the same `ranked` array the list renders, so a pin and a row
            can never disagree about a crossing.
          */}
          <CrossingsMap
            rows={ranked}
            origin={origin}
            modeLabel={travelModeLabel(mode)}
            // Carries the mode across so the full map opens on what's shown here.
            onExpand={() => router.push({ pathname: '/map', params: { mode } })}
          />
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>RANKED BY TOTAL TIME</Text>
            <Text style={styles.listHeaderNote}>drive + wait at arrival</Text>
          </View>
          <View style={styles.list}>
            {ranked.map((row) => (
              <PortRow key={row.port.id} row={row} mode={mode} />
            ))}
            {ranked.length === 0 &&
              (ports.isLoading || waits.isLoading ? (
                <Text style={styles.emptyText}>Loading crossings…</Text>
              ) : loadError ? (
                <UnreachableNotice onRetry={retry} />
              ) : (
                <Text style={styles.emptyText}>No crossings report this mode right now.</Text>
              ))}
          </View>
        </>
      )}

      <SourceNote
        ingestAge={ingestAge}
        hasWaits={hasWaits}
        showingCached={showingCached}
        originIsFallback={origin.isFallback}
      />
    </ScrollView>
  );
}

function DirectionCard({ direction, onFlip }: { direction: Direction; onFlip: () => void }) {
  return (
    <View style={styles.dirCard}>
      <View style={styles.dirIcon}>
        <Text style={{ color: color.navy, fontFamily: font.bold, fontSize: 13 }}>
          {direction === 'northbound' ? '↑' : '↓'}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.dirTitle}>
          {direction === 'northbound' ? 'Heading to the USA' : 'Heading to Mexico'}
        </Text>
        <Text style={styles.dirNote}>
          {direction === 'northbound' ? 'Live CBP wait times' : 'No official feed southbound'}
        </Text>
      </View>
      <Pressable onPress={onFlip} style={styles.flipButton} accessibilityRole="button">
        <Text style={styles.flipText}>Flip</Text>
      </Pressable>
    </View>
  );
}

/**
 * Southbound has no government feed. Rather than render a modelled guess in
 * the same visual language as fed data, the app says so plainly — the
 * prototype's 0.35x southbound multiplier was mock data, not a prediction.
 */
function SouthboundNotice() {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>No official data heading south</Text>
      <Text style={styles.noticeBody}>
        Mexico publishes no federal wait-time feed. We would rather show nothing than show a
        number we can’t stand behind.
      </Text>
    </View>
  );
}

function HeroCard({ best, savings }: { best: RankedPort; savings: string | null }) {
  // rankPorts only ranks ports with coordinates, but the types don't know that.
  const { lat, lng } = best.port;
  // The biggest number in the app carries the same verdict the list rows do.
  // The prototype's hero has no estimated state to copy, so the row badge is
  // reused verbatim rather than inventing a hero-specific treatment.
  const badge = freshnessBadge(best.freshness);
  return (
    <Pressable
      style={styles.hero}
      onPress={() => router.push(`/port/${best.port.id}`)}
      accessibilityRole="button"
    >
      <Text style={styles.heroLabel}>FASTEST DOOR-TO-DOOR</Text>
      <View style={styles.heroRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroName}>{best.port.displayName}</Text>
          {savings && <Text style={styles.heroSub}>{savings}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={styles.heroTotal}>
            <Text style={[styles.heroTotalNum, tabular]}>{best.totalMinutes}</Text>
            <Text style={styles.heroTotalUnit}>min</Text>
          </View>
          {badge && <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />}
        </View>
      </View>
      <View style={styles.heroFooter}>
        <Text style={[styles.heroApprox, { flex: 1 }]}>
          {best.drive.minutes} min drive (approx) + {best.primary?.waitMinutes} min wait
        </Text>
        {/*
          A nested Pressable claims its own touches, so the card's
          tap-to-detail behaviour is untouched everywhere else. Kept quiet on
          purpose — the hero's job is the ranking, not navigation handoff.
        */}
        {lat !== null && lng !== null && (
          <Pressable
            hitSlop={8}
            onPress={() => openDirections({ lat, lng })}
            accessibilityRole="link"
            accessibilityLabel={`Directions to ${best.port.displayName}`}
          >
            <Text style={styles.heroDirections}>Directions ↗</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function PortRow({ row, mode }: { row: RankedPort; mode: UiTravelMode }) {
  const badge = freshnessBadge(row.freshness);
  const closed = row.primary?.status === 'closed';
  // Pedestrian lanes have no trusted-traveller equivalent in the feed.
  const showTrusted = mode === 'passenger';
  /**
   * Ready Lane chip (v4): most vehicle travellers qualify (RFID documents),
   * so "Ready or standard?" is the decision this list can actually settle.
   * Shown only when the crossing HAS a ready lane — no lane, no chip, rather
   * than a "no lane" placeholder on most rows. Green only when it beats
   * standard by enough to clear reporting noise; an open-but-equal ready lane
   * stays neutral, unlike SEN, because this chip's job is the recommendation,
   * not the status. Ranking stays on the standard lane regardless.
   */
  // Also hidden when the ready reading itself went stale while the standard
  // lane stayed live — the row badge is the standard lane's verdict, so an
  // individually aged ready number would render with no marker that it's old.
  // No chip beats an old number presented as current.
  const showReady =
    mode === 'passenger' &&
    row.ready !== null &&
    row.ready.status !== 'not_available' &&
    row.ready.freshness !== 'stale';
  const savings = readySavings(row);
  const readyBeneficial = savings !== null && savings >= READY_HIGHLIGHT_MIN;

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/port/${row.port.id}`)}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.rank,
          { backgroundColor: row.rank === 1 && row.totalMinutes !== null ? color.green : color.trackBg },
        ]}
      >
        <Text
          style={[
            styles.rankText,
            { color: row.rank === 1 && row.totalMinutes !== null ? color.card : color.secondary },
          ]}
        >
          {row.rank}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.port.displayName}
        </Text>
        <Text style={styles.rowSub}>
          {row.drive.minutes} min drive · approx
        </Text>
        <View style={styles.chipRow}>
          <Chip
            label={`STD ${laneStatusLabel(row.primary)}`}
            tone={closed ? 'bad' : row.primary?.status === 'open' ? 'good' : 'neutral'}
          />
          {showReady && (
            <Chip
              label={`READY ${laneStatusLabel(row.ready)}`}
              tone={readyBeneficial ? 'good' : 'neutral'}
            />
          )}
          {showTrusted && (
            <Chip
              label={`SEN ${laneStatusLabel(row.trusted)}`}
              tone={row.trusted?.status === 'open' ? 'good' : 'neutral'}
            />
          )}
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {row.totalMinutes !== null ? (
          <Text style={[styles.rowTotal, { color: totalColor(row.totalMinutes) }, tabular]}>
            {row.totalMinutes}
          </Text>
        ) : (
          <Text style={[styles.rowTotal, { color: color.tertiary }]}>—</Text>
        )}
        {badge && <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />}
      </View>
    </Pressable>
  );
}

/**
 * The list slot, not the footer. A hard failure used to surface only as an
 * 11.5px line below an empty list, which reads as "nothing to show" rather than
 * "this is broken" — the reason a CORS fault went undiagnosed.
 */
function UnreachableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorCard}>
      <Text style={styles.errorCardTitle}>Can’t reach the server</Text>
      <Text style={styles.errorCardBody}>
        No wait times loaded, and there’s no saved copy from an earlier visit to fall
        back on. Check that the API is running, then try again.
      </Text>
      <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

/**
 * Both lines here are assertions about data that is on screen, so both are
 * gated on that data existing. "Live from CBP · updated 3 min ago" over an empty
 * list is a freshness stamp attached to nothing — `ingestAge` comes from the
 * waits query, which can succeed while ports fails. And we only claim a saved
 * copy when one was actually restored; on a first load there is none.
 */
function SourceNote({
  ingestAge,
  hasWaits,
  showingCached,
  originIsFallback,
}: {
  ingestAge: number | null;
  hasWaits: boolean;
  showingCached: boolean;
  originIsFallback: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: space.gutter, marginTop: 16, gap: 4 }}>
      {showingCached ? (
        <Text style={styles.errorText}>
          Can’t reach the server — showing the last data we saved.
        </Text>
      ) : null}
      {hasWaits ? (
        <Text style={styles.sourceText}>
          Live from CBP · updated {formatAge(ingestAge)}
        </Text>
      ) : null}
      <Text style={styles.sourceText}>
        Drive times are straight-line approximations, not routed ETAs
        {originIsFallback ? ', from an approximate starting point' : ''}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.gutter, flexDirection: 'row', justifyContent: 'space-between' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1.5, borderColor: color.green,
  },
  locationText: { fontSize: 12, fontFamily: font.semibold, color: color.secondary },
  title: { fontSize: 28, fontFamily: font.extrabold, color: color.ink, letterSpacing: -0.5 },

  dirCard: {
    marginHorizontal: space.gutter, marginTop: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 10,
  },
  dirIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: color.navyTint, alignItems: 'center', justifyContent: 'center',
  },
  dirTitle: { fontSize: 13, fontFamily: font.bold, color: color.ink },
  dirNote: { fontSize: 10.5, color: color.tertiary, fontFamily: font.regular },
  flipButton: {
    backgroundColor: color.chipBg, borderRadius: radius.segmentInner,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  flipText: { fontSize: 11, fontFamily: font.bold, color: color.navy },

  hero: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.navy, borderRadius: radius.card,
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  heroLabel: {
    fontSize: 10.5, fontFamily: font.bold, letterSpacing: 1,
    color: color.navySubtle,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroName: { fontSize: 17, fontFamily: font.bold, color: color.card },
  heroSub: { fontSize: 12, fontFamily: font.regular, color: color.navySubtle },
  heroTotal: {
    backgroundColor: color.green, borderRadius: radius.segmentInner,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center',
  },
  heroTotalNum: { fontSize: 22, fontFamily: font.extrabold, color: color.card, lineHeight: 26 },
  heroTotalUnit: { fontSize: 9.5, fontFamily: font.bold, color: color.card, letterSpacing: 0.5 },
  heroApprox: { fontSize: 10.5, fontFamily: font.regular, color: color.navySubtle },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDirections: { fontSize: 10.5, fontFamily: font.bold, color: color.navySubtle },

  listHeader: {
    marginTop: space.sectionGap,
    paddingHorizontal: space.gutter,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  listHeaderTitle: {
    fontSize: 11, fontFamily: font.bold, letterSpacing: 0.8, color: color.secondary,
  },
  listHeaderNote: { fontSize: 11, fontFamily: font.regular, color: color.tertiary },

  list: { marginTop: 8, paddingHorizontal: space.gutter, gap: space.stackGap },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.card, padding: space.cardPad,
  },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontFamily: font.bold },
  rowName: { fontSize: 14.5, fontFamily: font.bold, color: color.ink },
  rowSub: { fontSize: 11.5, fontFamily: font.regular, color: color.secondary },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  rowTotal: { fontSize: 20, fontFamily: font.extrabold },

  notice: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.card, padding: 16, gap: 6,
  },
  noticeTitle: { fontSize: 14, fontFamily: font.bold, color: color.ink },
  noticeBody: { fontSize: 12.5, fontFamily: font.regular, color: color.bodyMuted, lineHeight: 18 },

  emptyText: { fontSize: 13, color: color.secondary, fontFamily: font.regular, paddingVertical: 20, textAlign: 'center' },
  sourceText: { fontSize: 10.5, fontFamily: font.regular, color: color.tertiary },
  errorText: { fontSize: 11.5, fontFamily: font.semibold, color: color.redOnTint },

  errorCard: {
    backgroundColor: color.redTint, borderWidth: 1, borderColor: color.redBorder,
    borderRadius: radius.card, padding: 16, gap: 6,
  },
  errorCardTitle: { fontSize: 14, fontFamily: font.bold, color: color.redOnTint },
  errorCardBody: {
    fontSize: 12.5, fontFamily: font.regular, color: color.redOnTint, lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start', marginTop: 4, backgroundColor: color.navy,
    borderRadius: radius.button, paddingVertical: 8, paddingHorizontal: 14,
  },
  retryText: { fontSize: 12.5, fontFamily: font.bold, color: color.card },
});
