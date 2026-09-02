import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { LaneType } from '@otrolado/shared';
import { Badge, SegmentedControl } from '../../src/components/ui';
import { GroundTruthCard } from '../../src/components/GroundTruthCard';
import { TypicalCard } from '../../src/components/TypicalCard';
import { PushpinGlyph } from '../../src/components/glyphs';
import { openDirections } from '../../src/directions';
import { prefs, usePrefs } from '../../src/prefs';
import { formatAge, formatClock, freshnessBadge } from '../../src/freshness-ui';
import { usePorts, useWaits } from '../../src/queries';
import { reportedAgeSeconds, useAgedWaits } from '../../src/useFreshness';
import { color, font, radius, space, status, tabular, waitColor } from '../../src/theme';

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
  const isPinned = usePrefs().pinned.includes(id ?? '');
  const lanes = useMemo(
    () => aged.data?.ports.find((p) => p.portId === id)?.lanes ?? [],
    [aged.data, id],
  );
  const reading = lanes.find(
    (l) => l.mode === 'passenger' && l.lane === lane && l.direction === 'northbound',
  );

  /**
   * Availability dots on the lane picker, so "which lanes can I even use" is
   * answered before a tap, not after. The dot is usability, not severity —
   * open is clear green however long the wait; the number below says how bad.
   * A lane the crossing does not have gets no dot and a dimmed label, but
   * stays tappable so UnavailableState can say why. No reading at all (first
   * load, server down) is unknown-grey, never dimmed — absence of data must
   * not render as absence of the lane.
   */
  const laneOptions = useMemo(
    () =>
      LANES.map((l) => {
        const r = lanes.find(
          (x) => x.mode === 'passenger' && x.lane === l.value && x.direction === 'northbound',
        );
        if (r?.status === 'not_available') return { ...l, dimmed: true };
        return {
          ...l,
          dot:
            r?.status === 'open'
              ? status.clear.dot
              : r?.status === 'closed'
                ? status.heavy.dot
                : color.lineStrong,
        };
      }),
    [lanes],
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
        style={{ backgroundColor: color.mist }}
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
      style={{ backgroundColor: color.mist }}
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

        {port && (
          <View style={styles.directionsRow}>
            {/*
              The pin's other home: the same toggle as the list card, so a
              crossing can be pinned from wherever you're looking at it.
            */}
            <Pressable
              onPress={() => prefs.togglePin(port.id)}
              style={[styles.pinButton, isPinned && styles.pinButtonOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: isPinned }}
              accessibilityLabel={isPinned ? `Unpin ${port.displayName}` : `Pin ${port.displayName}`}
            >
              <PushpinGlyph
                size={13}
                color={isPinned ? color.surface : color.navy}
                filled={isPinned}
              />
              <Text style={[styles.pinText, isPinned && { color: color.surface }]}>
                {isPinned ? 'Pinned' : 'Pin'}
              </Text>
            </Pressable>
            {dest && (
              <Pressable
                onPress={() => openDirections(dest)}
                style={styles.directionsButton}
                accessibilityRole="button"
              >
                <Text style={styles.directionsText}>Directions ↗</Text>
              </Pressable>
            )}
            {dest && port.coordsApproximate && (
              <Text style={[styles.approxNote, { flexShrink: 1 }]}>
                coordinates approximate — destination pin is hand-placed
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap }}>
        <SegmentedControl options={laneOptions} value={lane} onChange={setLane} />
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

      {/*
        Not the forecast — that still needs ~6 weeks of our own history. This
        is CBP's previous-year average for today's weekday, attributed as such
        inside the card (see TypicalCard for why it never borrows the live
        numbers' severity colors).
      */}
      {port && <TypicalCard port={port} lane={lane} />}

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
  const tint = slow ? status.moderate.dot : status.clear.dot;
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
  backText: { fontSize: 14, fontFamily: font.semibold, color: color.cobalt },
  title: { fontSize: 24, fontFamily: font.bold, color: color.navy, letterSpacing: -0.48 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursBadge: {
    backgroundColor: status.clear.tint, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  hoursText: { fontSize: 10, fontFamily: font.semibold, color: status.clear.ink, letterSpacing: 1.1 },
  approxNote: { fontSize: 10.5, fontFamily: font.regular, color: color.muted },
  directionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  // Tertiary treatment unpinned; flips to a navy fill once pinned — navy, not
  // cobalt, so the screen's one cobalt stays the Directions primary.
  pinButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7.5, backgroundColor: color.surface,
  },
  pinButtonOn: { backgroundColor: color.navy, borderColor: color.navy },
  pinText: { fontSize: 12.5, fontFamily: font.semibold, color: color.navy },
  // Primary button: the one cobalt on this screen.
  directionsButton: {
    backgroundColor: color.cobalt, borderRadius: radius.button,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  directionsText: { fontSize: 12.5, fontFamily: font.semibold, color: color.surface },

  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.cardLg, padding: 16, gap: 8,
  },
  cardLabel: {
    fontSize: 11, fontFamily: font.semibold, letterSpacing: 1.1,
    color: color.muted,
  },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  // Detail number: 52/700, -0.045em, tight leading.
  number: { fontSize: 52, fontFamily: font.bold, letterSpacing: -2.34, lineHeight: 50 },
  numberUnit: { fontSize: 14, fontFamily: font.medium, color: color.muted, paddingBottom: 7 },
  meta: { fontSize: 12, fontFamily: font.regular, color: color.muted },
  boothRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  boothBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  boothBar: { width: 3, height: 12, borderRadius: 1.5 },
  boothText: { fontSize: 12, fontFamily: font.semibold },

  unavailableTitle: { fontSize: 16, fontFamily: font.semibold, color: color.navy },
  unavailableBody: { fontSize: 13, fontFamily: font.regular, color: color.muted, lineHeight: 19 },
  source: { fontSize: 11, fontFamily: font.regular, color: color.muted },

  errorCard: {
    backgroundColor: status.heavy.tint,
    borderRadius: radius.banner, paddingVertical: 13, paddingHorizontal: 15, gap: 6,
  },
  errorCardTitle: { fontSize: 14, fontFamily: font.semibold, color: status.heavy.ink },
  errorCardBody: {
    fontSize: 13, fontFamily: font.regular, color: status.heavy.ink, lineHeight: 19,
  },
  retryButton: {
    alignSelf: 'flex-start', marginTop: 4, backgroundColor: color.cobalt,
    borderRadius: radius.button, paddingVertical: 9, paddingHorizontal: 16,
  },
  retryText: { fontSize: 12.5, fontFamily: font.semibold, color: color.surface },
});
