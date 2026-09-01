import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { LaneType } from '@otrolado/shared';
import { Badge, SegmentedControl } from '../../src/components/ui';
import { GroundTruthCard } from '../../src/components/GroundTruthCard';
import { openDirections } from '../../src/directions';
import { formatAge, formatClock, freshnessBadge } from '../../src/freshness-ui';
import { usePorts, useWaits } from '../../src/queries';
import { reportedAgeSeconds, useAgedWaits } from '../../src/useFreshness';
import { color, font, radius, space, tabular, waitColor } from '../../src/theme';

const LANES: readonly { value: LaneType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'nexus_sentri', label: 'SENTRI' },
  { value: 'ready', label: 'Ready Lane' },
];

/**
 * Back, with a fallback.
 *
 * `router.back()` only pops the navigation stack, so it does nothing when this
 * screen is the first entry — a shared link, a browser refresh, or a push
 * notification opening the crossing directly. The button sits there looking
 * perfectly normal and strands the user, worst of all on the not-found state
 * below, which is exactly where a stale link lands and the one screen where an
 * exit matters most.
 *
 * `replace` rather than `push`, so leaving does not stack another history entry
 * on the way out.
 */
function backToCrossings(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function PortDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lane, setLane] = useState<LaneType>('standard');

  const ports = usePorts();
  const waits = useWaits();
  // Badge and ages re-judged against the clock now, not frozen at fetch time.
  const aged = useAgedWaits(waits);

  const port = ports.data?.ports.find((p) => p.id === id);
  const lanes = useMemo(
    () => aged.data?.ports.find((p) => p.portId === id)?.lanes ?? [],
    [aged.data, id],
  );
  const reading = lanes.find(
    (l) => l.mode === 'passenger' && l.lane === lane && l.direction === 'northbound',
  );
  const badge = reading ? freshnessBadge(reading.freshness) : null;
  // Non-pilot ports carry no coordinates; no coordinates, no button.
  const dest = port && port.lat !== null && port.lng !== null
    ? { lat: port.lat, lng: port.lng }
    : null;
  const loadError = ports.error ?? waits.error;

  /**
   * Without this the screen renders a titled-but-anonymous shell: the fallback
   * 'Crossing', no hours, and UnavailableState's generic "No data" — which
   * describes a lane that reported nothing, not a failed fetch. Distinguish the
   * two, and never present a network fault as an absence of data.
   */
  if (!port && !ports.isLoading) {
    return (
      <ScrollView
        style={{ backgroundColor: color.appBg }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
          <Pressable onPress={backToCrossings} style={styles.back} accessibilityRole="button">
            <Text style={styles.backText}>‹  Crossings</Text>
          </Pressable>
          <View style={styles.errorCard}>
            <Text style={styles.errorCardTitle}>
              {loadError ? 'Can’t reach the server' : 'Crossing not found'}
            </Text>
            <Text style={styles.errorCardBody}>
              {loadError
                ? 'This crossing’s details could not be loaded. Check that the API is running, then try again.'
                : 'No crossing matches this link. It may no longer be in the CBP feed.'}
            </Text>
            {loadError ? (
              <Pressable
                onPress={() => void ports.refetch()}
                style={styles.retryButton}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: color.appBg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
    >
      <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
        <Pressable onPress={backToCrossings} style={styles.back} accessibilityRole="button">
          <Text style={styles.backText}>‹  Crossings</Text>
        </Pressable>

        <View style={{ gap: 4 }}>
          <Text style={styles.title}>{port?.displayName ?? 'Crossing'}</Text>
          <View style={styles.subRow}>
            {port?.hours.text ? (
              <View style={styles.hoursBadge}>
                <Text style={styles.hoursText}>
                  {port.hours.open24h ? 'OPEN 24H' : port.hours.text.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {port?.coordsApproximate && !dest && (
              <Text style={styles.approxNote}>coordinates approximate</Text>
            )}
          </View>
        </View>

        {dest && (
          <View style={styles.directionsRow}>
            <Pressable
              onPress={() => openDirections(dest)}
              style={styles.directionsButton}
              accessibilityRole="button"
            >
              <Text style={styles.directionsText}>Directions ↗</Text>
            </Pressable>
            {port?.coordsApproximate && (
              <Text style={[styles.approxNote, { flexShrink: 1 }]}>
                coordinates approximate — destination pin is hand-placed
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap }}>
        <SegmentedControl options={LANES} value={lane} onChange={setLane} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>WAIT RIGHT NOW</Text>
        {reading?.status === 'open' && reading.waitMinutes !== null ? (
          <>
            <View style={styles.numberRow}>
              <Text style={[styles.number, { color: waitColor(reading.waitMinutes) }, tabular]}>
                {reading.waitMinutes}
              </Text>
              <Text style={styles.numberUnit}>min</Text>
              {badge && <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />}
            </View>
            {/*
              Booths-open context (v4): whether a 40-min line is about to
              drain or grow. Needs both numbers to say anything about the
              ratio; with only a count, the plain fragment stays in the meta
              line below rather than a note the data can't support.
            */}
            {reading.lanesOpen !== null && reading.maxLanes ? (
              <BoothsLine open={reading.lanesOpen} max={reading.maxLanes} />
            ) : null}
            <Text style={styles.meta}>
              {reading.lanesOpen !== null && !reading.maxLanes
                ? `${reading.lanesOpen} lanes open · `
                : ''}
              {/*
                Anchored to reportedAt → now, not the frozen feedAgeSeconds
                (that was the gap at OBSERVATION time — wrong by up to a poll
                interval when healthy, unboundedly wrong on cached data). CBP's
                stamp is hour-granular, so formatAge's coarse rounding is the
                honest precision; a stamp ahead of the clock clamps to "just
                now" rather than going negative.
              */}
              CBP reported {formatAge(reportedAgeSeconds(reading, aged.nowMs))}
            </Text>
          </>
        ) : (
          <UnavailableState status={reading?.status} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>FORECAST</Text>
        <Text style={styles.forecastNote}>
          Not available yet. Hourly predictions need about six weeks of collected history
          before they mean anything — showing a curve now would be an invention, not a forecast.
        </Text>
      </View>

      {port && <GroundTruthCard port={port} />}

      <View style={{ paddingHorizontal: space.gutter, marginTop: 14, gap: 4 }}>
        <Text style={styles.source}>
          {reading ? `Snapshot ${formatClock(reading.observedAt, port?.feedTz)}` : ''}
        </Text>
        <Text style={styles.source}>
          Waits are officer-reported and accurate to roughly ±10 min.
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * "{open} of {max} booths open · {note}" with a three-bar glyph (v4).
 *
 * The 0.45 threshold and both notes are the handoff's: under 45% of booths
 * staffed, the line drains slower than it looks. Amber, not red — it is
 * context on the number above, not an alarm. Both figures are CBP's own
 * (lanes_open / max_lanes per reading), never inferred.
 */
function BoothsLine({ open, max }: { open: number; max: number }) {
  const slow = open / max < 0.45;
  const tint = slow ? color.amber : color.green;
  return (
    <View style={styles.boothRow}>
      <View style={styles.boothBars}>
        <View style={[styles.boothBar, { backgroundColor: tint }]} />
        <View style={[styles.boothBar, { backgroundColor: tint, opacity: 0.45 }]} />
        <View style={[styles.boothBar, { backgroundColor: tint, opacity: 0.45 }]} />
      </View>
      <Text style={[styles.boothText, { color: tint }, tabular]}>
        {open} of {max} booths open · {slow ? 'line drains slowly' : 'line moves steadily'}
      </Text>
    </View>
  );
}

/** Never renders a number. The three non-open states each say what they mean. */
function UnavailableState({ status }: { status: string | undefined }) {
  const copy: Record<string, { title: string; body: string }> = {
    closed: {
      title: 'Lanes closed',
      body: 'CBP reports this lane is not currently open. Try another lane or crossing.',
    },
    update_pending: {
      title: 'No current figure',
      body: 'CBP has not posted an updated wait for this lane. We won’t guess one.',
    },
    not_available: {
      title: 'No lane here',
      body: 'This crossing does not have this lane type.',
    },
  };
  const c = copy[status ?? ''] ?? {
    title: 'No data',
    body: 'Nothing reported for this lane right now.',
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.unavailableTitle}>{c.title}</Text>
      <Text style={styles.unavailableBody}>{c.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8 },
  backText: { fontSize: 14, fontFamily: font.semibold, color: color.navy },
  title: { fontSize: 19, fontFamily: font.extrabold, color: color.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursBadge: {
    backgroundColor: color.greenTint, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  hoursText: { fontSize: 9.5, fontFamily: font.bold, color: color.green, letterSpacing: 0.5 },
  approxNote: { fontSize: 10.5, fontFamily: font.regular, color: color.tertiary },
  directionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  directionsButton: {
    backgroundColor: color.navy, borderRadius: radius.button,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  directionsText: { fontSize: 12.5, fontFamily: font.bold, color: color.card },

  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.cardLg, padding: 16, gap: 8,
  },
  cardLabel: {
    fontSize: 11, fontFamily: font.bold, letterSpacing: 0.8,
    color: color.tertiary,
  },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  number: { fontSize: 38, fontFamily: font.extrabold, lineHeight: 42 },
  numberUnit: { fontSize: 14, fontFamily: font.bold, color: color.secondary, paddingBottom: 5 },
  meta: { fontSize: 12, fontFamily: font.regular, color: color.secondary },
  boothRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  boothBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  boothBar: { width: 3, height: 12, borderRadius: 1.5 },
  boothText: { fontSize: 12, fontFamily: font.semibold },

  unavailableTitle: { fontSize: 17, fontFamily: font.bold, color: color.ink },
  unavailableBody: { fontSize: 12.5, fontFamily: font.regular, color: color.bodyMuted, lineHeight: 18 },
  forecastNote: { fontSize: 12.5, fontFamily: font.regular, color: color.bodyMuted, lineHeight: 18 },
  source: { fontSize: 10.5, fontFamily: font.regular, color: color.tertiary },

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
