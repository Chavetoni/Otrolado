import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Direction, LaneType, Port } from '@otrolado/shared';
import { Badge, SegmentedControl } from '../../src/components/ui';
import { GroundTruthCard } from '../../src/components/GroundTruthCard';
import { TypicalCard } from '../../src/components/TypicalCard';
import {
  ArrowLeftGlyph,
  ArrowUpRightGlyph,
  BellGlyph,
  ClockGlyph,
  PinGlyph,
  StarGlyph,
  WarningGlyph,
} from '../../src/components/glyphs';
import { compareToTypical } from '../../src/typical';
import { useTypicalNow } from '../../src/useTypicalNow';
import { SPIKE_THRESHOLD } from '../../src/alerts';
import { openDirections } from '../../src/directions';
import { prefs, usePrefs } from '../../src/prefs';
import { formatAge, formatClock, freshnessBadge } from '../../src/freshness-ui';
import { usePorts, useWaits } from '../../src/queries';
import { reportedAgeSeconds, useAgedWaits } from '../../src/useFreshness';
import { color, font, radius, space, status, tabular, waitColor } from '../../src/theme';

const LANES: readonly { value: LaneType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ready', label: 'Ready Lane' },
  { value: 'nexus_sentri', label: 'SENTRI' },
];

/**
 * Direction, northbound first and default — the same reasoning as every other
 * screen. CBP publishes northbound only; a southbound tab showing a wait would
 * be a number we invented, so it shows the no-data state instead.
 */
const DIRECTIONS = [
  { value: 'northbound', label: 'To U.S.' },
  { value: 'southbound', label: 'To Mexico' },
] as const satisfies readonly { value: Direction; label: string }[];

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
  const [direction, setDirection] = useState<Direction>('northbound');

  const ports = usePorts();
  const waits = useWaits();
  // Badge and ages re-judged against the clock now, not frozen at fetch time.
  const aged = useAgedWaits(waits);

  const port = ports.data?.ports.find((p) => p.id === id);
  const { pinned, watchlist, rules } = usePrefs();
  const isPinned = pinned.includes(id ?? '');
  const watching = watchlist.includes(id ?? '');
  /**
   * Only crossings the Alerts tab can list are offered here, so a switch
   * flipped on this screen is always visible (and reversible) on that one.
   * Same filter as its "Crossings you watch" chips.
   */
  const watchable = Boolean(port && port.routable && port.lat !== null);
  const lanes = useMemo(
    () => aged.data?.ports.find((p) => p.portId === id)?.lanes ?? [],
    [aged.data, id],
  );
  const reading = lanes.find(
    (l) => l.mode === 'passenger' && l.lane === lane && l.direction === direction,
  );
  /**
   * CBP's previous-year average for this crossing, lane, weekday and hour.
   * Shared with the card below via `useTypicalNow` so the "unusually busy"
   * verdict and the chart can never quote different figures for the same hour.
   */
  const typical = useTypicalNow(port, lane);

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
          (x) => x.mode === 'passenger' && x.lane === l.value && x.direction === direction,
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
    [lanes, direction],
  );
  const badge = reading ? freshnessBadge(reading.freshness) : null;
  // Non-pilot ports carry no coordinates; no coordinates, no button.
  const dest = port && port.lat !== null && port.lng !== null
    ? { lat: port.lat, lng: port.lng }
    : null;
  const loadError = ports.error ?? waits.error;
  /**
   * `usePorts` sets `placeholderData`, which forces React Query's status to
   * 'success' — `ports.isLoading` is never true, so gating on it flashed
   * "Crossing not found" on every deep link for the length of the first round
   * trip. "Still loading" is the bundle standing in while the fetch is in
   * flight; a failed fetch keeps the placeholder and falls to the error copy.
   */
  const portsLoading = ports.isPlaceholderData && ports.fetchStatus === 'fetching';

  /**
   * Without this the screen renders a titled-but-anonymous shell: the fallback
   * 'Crossing', no hours, and UnavailableState's generic "No data" — which
   * describes a lane that reported nothing, not a failed fetch. Distinguish the
   * two, and never present a network fault as an absence of data.
   */
  if (!port && !portsLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <DetailHeader title="Crossing" topInset={insets.top} />
        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sectionGap }}>
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
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/*
        Dark header, light status bar. expo-status-bar merges StatusBar
        components in mount order, so this wins while the screen is up and
        the root's `dark` returns when it pops.
      */}
      <StatusBar style="light" />
      <DetailHeader
        title={port?.displayName ?? 'Crossing'}
        topInset={insets.top}
        action={
          port ? (
            <Pressable
              onPress={() => prefs.togglePin(port.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ selected: isPinned }}
              accessibilityLabel={
                isPinned ? `Unpin ${port.displayName}` : `Pin ${port.displayName}`
              }
            >
              {/* Pinning moved into the header as a star: it is an action ON
                  this crossing, which is what a title-bar action is for, and
                  it frees the body row below for the one thing that actually
                  needs explaining — where to drive to. */}
              <StarGlyph size={22} color={color.surface} filled={isPinned} />
            </Pressable>
          ) : null
        }
      >
        <View style={styles.dirWrap}>
          <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} />
        </View>
        <View style={styles.subRow}>
          {port?.hours.text ? (
            <View style={styles.hoursBadge}>
              <Text style={[styles.hoursText, tabular]}>
                {port.hours.open24h ? 'OPEN 24H' : port.hours.text.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <LaneChips options={laneOptions} value={lane} onChange={setLane} />
      </DetailHeader>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: space.sectionGap, paddingBottom: 24 }}
    >
      {port && <EntranceRow port={port} dest={dest} />}

      {direction === 'southbound' ? (
        <SouthboundNotice />
      ) : (
        <>
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
                  How today compares with this hour's own history. Gated on a
                  LIVE reading: "unusually busy" set against a figure that has
                  aged out would be a verdict on a number nobody stands behind,
                  and the comparison is the whole point of the sentence.
                */}
                {reading.freshness === 'live' && typical.nowTypical !== null && (
                  <UnusualBanner
                    liveMinutes={reading.waitMinutes}
                    typicalMinutes={typical.nowTypical}
                    dayName={typical.dayName}
                    hourLabel={typical.hourLabel}
                  />
                )}

                {reading.lanesOpen !== null && reading.maxLanes ? (
                  <BoothsLine open={reading.lanesOpen} max={reading.maxLanes} />
                ) : null}
                <Text style={[styles.meta, tabular]}>
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

                {/*
                  This hour's baseline, right under the live number it is the
                  baseline FOR. Attributed inline — a bare "Typical Tuesday at
                  3 pm: 18 min" reads as our own figure, and it is CBP's.
                */}
                {typical.nowTypical !== null && (
                  <>
                    <View style={styles.cardDivider} />
                    <Text style={[styles.typicalLine, tabular]}>
                      Typical {typical.dayName} at {typical.hourLabel}:{' '}
                      <Text style={styles.typicalStrong}>{typical.nowTypical} min</Text>
                      <Text style={styles.typicalSource}> · CBP average, previous year</Text>
                    </Text>
                  </>
                )}
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
        </>
      )}

      {/* Provenance for the numbers above — so it is hidden southbound, where
          there are no numbers for it to describe. */}
      {direction === 'northbound' && (
        <View style={{ paddingHorizontal: space.gutter, marginTop: 14, gap: 4 }}>
          <Text style={[styles.source, tabular]}>
            {reading ? `Snapshot ${formatClock(reading.observedAt, port?.feedTz)}` : ''}
          </Text>
          <Text style={styles.source}>
            Waits are officer-reported and accurate to roughly ±10 min.
          </Text>
        </View>
      )}
    </ScrollView>

      {port && watchable && (
        <AlertBar
          portId={port.id}
          watching={watching}
          rulesOff={!rules.spike && !rules.closure}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

/**
 * The navy header block: back, title, then whatever the screen puts under it
 * (hours, the lane picker). Extends under the status bar so the dark surface
 * runs edge to edge; the mist body starts below it. This is what makes the
 * detail screen read as a different place from the list.
 */
function DetailHeader({
  title,
  topInset,
  action,
  children,
}: {
  title: string;
  topInset: number;
  /** Title-bar action on this crossing — the pin star. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.headerBlock, { paddingTop: topInset + 6 }]}>
      <View style={styles.headerTitleRow}>
        <Pressable
          onPress={backToCrossings}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back to crossings"
        >
          <ArrowLeftGlyph size={22} color={color.cobaltLight} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * Where to actually drive to, and how sure we are of it.
 *
 * The reference layout puts a green "Verified approach point" badge here. Not
 * yet: all eleven pilot coordinates are OSM named-bridge-way centroids flagged
 * `coordsApproximate`, and the survey that would earn the word "verified"
 * hasn't happened. A green tick on unsurveyed data is a straight claim that
 * something was checked when it was not — worse than the honest note it would
 * replace, because it stops the user checking too.
 *
 * What the app CAN say is which point it is sending you to. A crossing with a
 * curated line-start (the Mexican approach where the queue actually begins —
 * see the port directory) routes there and names it; everything else routes to
 * the bridge pin and says the pin is hand-placed. Two different confidences,
 * two different sentences, neither of them a badge.
 */
function EntranceRow({
  port,
  dest,
}: {
  port: Port;
  dest: { lat: number; lng: number } | null;
}) {
  const lineStart =
    port.lineStartLat != null && port.lineStartLng != null
      ? { lat: port.lineStartLat, lng: port.lineStartLng }
      : null;
  const target = lineStart ?? dest;
  if (!target) return null;

  return (
    <View style={styles.entranceWrap}>
      <Pressable
        onPress={() => openDirections(target)}
        style={styles.entranceButton}
        accessibilityRole="button"
        accessibilityLabel={
          lineStart
            ? `Directions to where the line starts: ${port.lineStartLabel}`
            : `Directions to ${port.displayName}`
        }
      >
        <PinGlyph size={16} color={color.cobalt} />
        <View style={{ flex: 1 }}>
          <Text style={styles.entranceTitle}>
            {lineStart ? 'Directions to the line start' : 'Directions to the bridge'}
          </Text>
          <Text style={styles.entranceSub} numberOfLines={2}>
            {lineStart
              ? port.lineStartLabel
              : port.coordsApproximate
                ? 'Pin is hand-placed on the bridge, not surveyed'
                : 'Bridge crossing point'}
          </Text>
        </View>
        <ArrowUpRightGlyph size={15} color={color.navy} />
      </Pressable>
    </View>
  );
}

/**
 * "Unusually busy · 42 min longer than typical."
 *
 * The most useful sentence on this screen, and one the app can already say:
 * `typical_waits` holds CBP's own previous-year hour-by-weekday averages, so
 * this is a live number set against its own history rather than against
 * nothing. A 60-minute wait means very different things at 6 am and at 5 pm,
 * and the raw figure alone cannot tell you which you are looking at.
 *
 * Both directions are shown. An unusually SHORT line is exactly as actionable
 * as a long one — arguably more so, since it is the case where someone should
 * leave now — and reporting only the bad half would make the feature a warning
 * light rather than a comparison.
 *
 * `normal` renders nothing. A banner reading "about as busy as usual" on most
 * visits is a row of furniture, and the typical figure is stated below
 * regardless.
 */
function UnusualBanner({
  liveMinutes,
  typicalMinutes,
  dayName,
  hourLabel,
}: {
  liveMinutes: number;
  typicalMinutes: number;
  dayName: string;
  hourLabel: string;
}) {
  const { verdict, deltaMinutes } = compareToTypical(liveMinutes, typicalMinutes);
  if (verdict === 'normal') return null;
  const busy = verdict === 'busy';
  const tone = busy ? status.heavy : status.clear;
  return (
    <View style={[styles.unusual, { backgroundColor: tone.tint }]}>
      {busy ? (
        <WarningGlyph size={17} color={tone.ink} />
      ) : (
        <ClockGlyph size={17} color={tone.ink} />
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.unusualTitle, { color: tone.ink }]}>
          {busy ? 'UNUSUALLY BUSY' : 'UNUSUALLY QUIET'}
        </Text>
        <Text style={[styles.unusualBody, { color: tone.ink }, tabular]}>
          <Text style={styles.unusualStrong}>
            {deltaMinutes} min {busy ? 'longer' : 'shorter'}
          </Text>{' '}
          than a typical {dayName} at {hourLabel}
        </Text>
      </View>
    </View>
  );
}

/** No southbound feed exists — the same sentence the other screens give. */
function SouthboundNotice() {
  return (
    <View style={styles.southbound}>
      <View style={styles.southboundDot} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.southboundTitle}>No official data heading south</Text>
        <Text style={styles.southboundBody}>
          CBP publishes northbound waits only, and Mexico has no federal feed. There is
          nothing to show for this direction that we did not make up.
        </Text>
      </View>
    </View>
  );
}

/**
 * Lane picker as chips on navy: active is a cobalt fill, inactive an outline.
 * Same availability semantics as the segmented control it replaces — a dot
 * for open/closed/unknown, a dimmed chip for a lane the crossing does not
 * have (still tappable, so UnavailableState can say why). Scrolls
 * horizontally rather than shrinking, so labels never truncate.
 */
function LaneChips({
  options,
  value,
  onChange,
}: {
  options: readonly { value: LaneType; label: string; dot?: string; dimmed?: boolean }[];
  value: LaneType;
  onChange: (v: LaneType) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.gutter }}
      contentContainerStyle={styles.laneRow}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.laneChip,
              active ? styles.laneChipOn : styles.laneChipOff,
              !active && o.dimmed && { opacity: 0.45 },
            ]}
          >
            {o.dot != null && <View style={[styles.laneDot, { backgroundColor: o.dot }]} />}
            <Text
              style={[
                styles.laneChipText,
                { color: active ? color.surface : color.mutedOnDark },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The sticky "Alert me" bar. It toggles this crossing on the watchlist — the
 * only alert mechanism that exists today — and the caption says exactly what
 * that buys: spike and closure hits on the Alerts tab, while the app is open.
 * No threshold picker, because no threshold rule exists; a button that named
 * one would be promising a rule that never runs.
 */
function AlertBar({
  portId,
  watching,
  rulesOff,
  bottomInset,
}: {
  portId: string;
  watching: boolean;
  rulesOff: boolean;
  bottomInset: number;
}) {
  return (
    <View style={[styles.alertBar, { paddingBottom: Math.max(bottomInset, 12) + 4 }]}>
      <Pressable
        onPress={() => prefs.toggleWatch(portId)}
        style={[styles.alertButton, watching && styles.alertButtonOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: watching }}
      >
        <BellGlyph size={17} color={color.surface} />
        <Text style={styles.alertButtonText}>
          {watching ? 'Watching · tap to stop' : 'Watch for changes'}
        </Text>
      </Pressable>
      <Text style={[styles.alertNote, tabular]}>
        {rulesOff
          ? 'Spike and closure rules are switched off on the Alerts tab.'
          : `Spikes of ${SPIKE_THRESHOLD}+ min and lane closures, on the Alerts tab while the app is open.`}
      </Text>
    </View>
  );
}

/**
 * "{open} of {max} booths open" with a three-bar glyph.
 *
 * Both figures are CBP's own (lanes_open / max_lanes per reading), never
 * inferred — which is exactly why the line no longer editorialises about them.
 * It used to append "line drains slowly" / "line moves steadily" from a 0.45
 * staffing ratio; that is a claim about how a queue BEHAVES, and nothing in
 * this system has ever measured throughput per booth. The staffing fraction is
 * a real, sourced fact and is worth showing; the prediction attached to it was
 * ours, unsourced, and read as operational knowledge we do not have.
 *
 * The colour still tracks the ratio — under half the booths staffed is worth
 * noticing — but it now qualifies the number rather than forecasting the line.
 */
const HALF_STAFFED = 0.5;

function BoothsLine({ open, max }: { open: number; max: number }) {
  const thin = open / max < HALF_STAFFED;
  const tint = thin ? status.moderate.dot : status.clear.dot;
  return (
    <View style={styles.boothRow}>
      <View style={styles.boothBars}>
        <View style={[styles.boothBar, { backgroundColor: tint }]} />
        <View style={[styles.boothBar, { backgroundColor: tint, opacity: 0.45 }]} />
        <View style={[styles.boothBar, { backgroundColor: tint, opacity: 0.45 }]} />
      </View>
      <Text style={[styles.boothText, { color: tint }, tabular]}>
        {open} of {max} booths open
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
  screen: { flex: 1, backgroundColor: color.mist },
  // Navy, edge to edge, under the status bar; the mist body starts below it.
  headerBlock: {
    backgroundColor: color.navy,
    paddingHorizontal: space.gutter,
    paddingBottom: 16,
    gap: 10,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { paddingVertical: 4 },
  // Screen title on navy: 24/700, -0.02em, white.
  title: {
    flex: 1, fontSize: 24, fontFamily: font.bold, color: color.surface, letterSpacing: -0.48,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirWrap: { marginTop: 2 },
  approxNoteOnDark: { fontSize: 11, fontFamily: font.regular, color: color.mutedOnDark },
  laneRow: { paddingHorizontal: space.gutter, gap: 8, marginTop: 2 },
  // Chips on navy (§5): active cobalt fill, 8/14, no border; inactive
  // transparent, 1px lineOnDark, 7/13 — the border makes up the 1px so both
  // states measure the same. Text 12/600.
  laneChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill },
  laneChipOn: { backgroundColor: color.cobalt, paddingHorizontal: 14, paddingVertical: 8 },
  laneChipOff: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: color.lineOnDark,
    paddingHorizontal: 13, paddingVertical: 7,
  },
  laneChipText: { fontSize: 12, fontFamily: font.semibold },
  laneDot: { width: 6, height: 6, borderRadius: 3 },
  hoursBadge: {
    backgroundColor: status.clear.tint, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  hoursText: { fontSize: 10, fontFamily: font.semibold, color: status.clear.ink, letterSpacing: 1.1 },
  approxNote: { fontSize: 11, fontFamily: font.regular, color: color.muted },

  // Entrance row: a full-width card, because "where do I actually drive to"
  // is the question, not a tertiary chip beside a pin button.
  entranceWrap: { paddingHorizontal: space.gutter },
  entranceButton: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 15,
  },
  entranceTitle: { fontSize: 14, fontFamily: font.semibold, color: color.navy },
  entranceSub: { fontSize: 11, fontFamily: font.regular, color: color.muted, lineHeight: 15 },

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
  // Detail number (§3): 52/700, -0.045em, line-height 0.85 → 44. Safe from
  // clipping for the same reason as the hero number: lining digits (~0.7em,
  // no descenders) inside a centred line box leave ~4px clear on Android.
  number: { fontSize: 52, fontFamily: font.bold, letterSpacing: -2.34, lineHeight: 44 },
  numberUnit: { fontSize: 14, fontFamily: font.medium, color: color.muted, paddingBottom: 7 },
  meta: { fontSize: 12, fontFamily: font.regular, color: color.muted },
  cardDivider: { height: 1, backgroundColor: color.line, marginTop: 4 },
  typicalLine: { fontSize: 13, fontFamily: font.regular, color: color.navy, lineHeight: 19 },
  typicalStrong: { fontFamily: font.bold },
  typicalSource: { fontSize: 11, fontFamily: font.regular, color: color.muted },

  // The comparison banner. Takes the STATUS palette, not a brand colour: it is
  // a verdict about severity, which is what those colours are reserved for.
  unusual: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radius.banner, paddingVertical: 11, paddingHorizontal: 13,
  },
  unusualTitle: { fontSize: 10.5, fontFamily: font.bold, letterSpacing: 1.1 },
  unusualBody: { fontSize: 12.5, fontFamily: font.regular, lineHeight: 17 },
  unusualStrong: { fontFamily: font.bold },

  southbound: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    flexDirection: 'row', gap: 10,
    backgroundColor: color.infoTint, borderRadius: radius.banner,
    paddingVertical: 13, paddingHorizontal: 15,
  },
  southboundDot: {
    width: 7, height: 7, borderRadius: 3.5, marginTop: 6, backgroundColor: color.cobalt,
  },
  southboundTitle: { fontSize: 13, fontFamily: font.semibold, color: color.infoInk },
  southboundBody: { fontSize: 13, fontFamily: font.regular, color: color.infoInk, lineHeight: 19 },
  boothRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  boothBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  boothBar: { width: 3, height: 12, borderRadius: 1.5 },
  boothText: { fontSize: 12, fontFamily: font.semibold },

  unavailableTitle: { fontSize: 16, fontFamily: font.semibold, color: color.navy },
  unavailableBody: { fontSize: 13, fontFamily: font.regular, color: color.muted, lineHeight: 19 },
  source: { fontSize: 11, fontFamily: font.regular, color: color.muted },

  // Sticky CTA: white bar, hairline top, full-width cobalt button, 48 tall.
  alertBar: {
    backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line,
    paddingHorizontal: space.gutter, paddingTop: 12, gap: 8,
  },
  alertButton: {
    height: 48, borderRadius: radius.button, backgroundColor: color.cobalt,
    flexDirection: 'row', gap: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  // On = navy, the same "set" treatment as the pinned Pin button.
  alertButtonOn: { backgroundColor: color.navy },
  alertButtonText: { fontSize: 15, fontFamily: font.bold, color: color.surface },
  alertNote: {
    fontSize: 11, fontFamily: font.regular, color: color.muted,
    textAlign: 'center', lineHeight: 16,
  },

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
