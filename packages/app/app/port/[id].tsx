import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Direction, LaneType, Port } from '@otrolado/shared';
import {
  Button,
  FreshnessBadge,
  IconButton,
  Notice,
  Pill,
  SectionLabel,
  SegmentedControl,
  SeverityTag,
  Skeleton,
} from '../../src/components/ui';
import { GroundTruthCard } from '../../src/components/GroundTruthCard';
import { TypicalCard } from '../../src/components/TypicalCard';
import {
  ArrowLeftGlyph,
  ArrowUpRightGlyph,
  BellGlyph,
  ClockGlyph,
  LockGlyph,
  PinGlyph,
  StarGlyph,
  WarningGlyph,
} from '../../src/components/glyphs';
import { compareToTypical } from '../../src/typical';
import { useTypicalNow } from '../../src/useTypicalNow';
import { SPIKE_THRESHOLD } from '../../src/alerts';
import { openDirections } from '../../src/directions';
import { DIRECTIONS } from '../../src/modes';
import { prefs, usePrefs } from '../../src/prefs';
import { formatAge, formatClock, numberInk, spokenFreshness } from '../../src/freshness-ui';
import { usePorts, useWaits } from '../../src/queries';
import { reportedAgeSeconds, useAgedWaits } from '../../src/useFreshness';
import { color, DISPLAY_MAX_FONT_SCALE, font, radius, space, status, tabular } from '../../src/theme';
import { caption, type } from '../../src/typography';

const LANES: readonly { value: LaneType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ready', label: 'Ready Lane' },
  { value: 'nexus_sentri', label: 'SENTRI' },
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

/** A lane's availability, as the lane picker shows it before a tap. */
type LaneAvailability = 'open' | 'closed' | 'unknown' | 'none';

export default function PortDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lane, setLane] = useState<LaneType>('standard');
  // Northbound first and default — see DIRECTIONS in modes.ts. CBP publishes
  // northbound only; southbound shows the no-data notice.
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
   * Availability on the lane picker, so "which lanes can I even use" is
   * answered before a tap, not after. Usability, not severity — open is a
   * green dot however long the wait; the number below says how bad. Closed
   * is the lock glyph (v2 §07), not a red dot: availability must not be
   * carried by colour alone. A lane the crossing does not have is dimmed but
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
        const availability: LaneAvailability =
          r?.status === 'not_available'
            ? 'none'
            : r?.status === 'open'
              ? 'open'
              : r?.status === 'closed'
                ? 'closed'
                : 'unknown';
        return { ...l, availability };
      }),
    [lanes, direction],
  );
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
  /** First open with nothing fetched or restored yet: skeleton, not "No data". */
  const waitsLoading =
    aged.data === undefined && waits.isPending && waits.fetchStatus !== 'paused';
  const live = reading?.freshness === 'live';
  /**
   * The current reading, for the chart's one cobalt bar — only while it is
   * LIVE and open. The same gate as the comparison banner: an aged figure
   * drawn as "right now" would be a verdict on a number nobody stands behind.
   */
  const liveMinutes = reading?.status === 'open' && live ? reading.waitMinutes : null;

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
          <Notice
            tone="error"
            title={loadError ? 'Can’t reach the server' : 'Crossing not found'}
            action={
              loadError ? (
                <Button
                  label="Try again"
                  size="sm"
                  onPress={() => void ports.refetch()}
                  style={styles.retry}
                />
              ) : undefined
            }
          >
            {loadError
              ? 'This crossing’s details could not be loaded. Check that the API is running, then try again.'
              : 'No crossing matches this link. It may no longer be in the CBP feed.'}
          </Notice>
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
            // Pinning is an action ON this crossing, which is what a title-bar
            // action is for. Pinned is the star in white on a lit tile;
            // unpinned is the star in the header's secondary ink — never a
            // filled star, per the icon family.
            <IconButton
              onDark
              selected={isPinned}
              onPress={() => prefs.togglePin(port.id)}
              accessibilityLabel={
                isPinned ? `Unpin ${port.displayName}` : `Pin ${port.displayName}`
              }
            >
              <StarGlyph size={24} color={isPinned ? color.surface : color.mutedOnDark} />
            </IconButton>
          ) : null
        }
      >
        <View style={styles.dirWrap}>
          <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} />
        </View>
        {port?.hours.text ? (
          <View style={styles.subRow}>
            <Pill
              label={port.hours.open24h ? 'Open 24h' : port.hours.text}
              bg={status.clear.tint}
              fg={status.clear.ink}
            />
          </View>
        ) : null}
        <LaneChips options={laneOptions} value={lane} onChange={setLane} />
      </DetailHeader>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: space.sectionGap, paddingBottom: 24 }}
    >
      {port && <EntranceRow port={port} dest={dest} />}

      {direction === 'southbound' ? (
        <Notice title="No official data heading south" style={styles.block}>
          CBP publishes northbound waits only, and Mexico has no federal feed. There is
          nothing to show for this direction that we did not make up.
        </Notice>
      ) : (
        <>
          <View style={styles.card}>
            <SectionLabel>Wait right now</SectionLabel>
            {waitsLoading ? (
              <View
                style={{ gap: 12, marginTop: 4 }}
                accessible
                role="progressbar"
                aria-label="Loading the wait"
              >
                <Skeleton width={120} height={40} round={radius.sm} />
                <Skeleton width={190} height={12} round={radius.sm} />
              </View>
            ) : reading?.status === 'open' && reading.waitMinutes !== null ? (
              <>
                {/*
                  The number is set in ink, not in its severity colour, and
                  the severity rides beside it as a dot AND a word — colour is
                  never the only channel (v2 §02). Not live → the `~` every
                  non-live number wears, the number steps down to `muted`, the
                  clock badge says why, and the severity word is WITHHELD: a
                  green "Clear" on an hour-old reading is a verdict on a number
                  nobody stands behind (the map pins drop their scale colour
                  for the same reason).
                */}
                <View
                  style={styles.numberRow}
                  accessible
                  aria-label={`${live ? '' : 'about '}${reading.waitMinutes} minutes, ${spokenFreshness(reading.freshness)}`}
                >
                  <Text
                    style={[styles.number, { color: numberInk(reading.freshness) }, tabular]}
                    maxFontSizeMultiplier={DISPLAY_MAX_FONT_SCALE}
                  >
                    {live ? '' : '~'}
                    {reading.waitMinutes}
                  </Text>
                  <Text style={styles.numberUnit}>min</Text>
                  <View style={styles.numberTags}>
                    {live && <SeverityTag minutes={reading.waitMinutes} />}
                    <FreshnessBadge freshness={reading.freshness} />
                  </View>
                </View>

                {/*
                  How today compares with this hour's own history. Gated on a
                  LIVE reading: "unusually busy" set against a figure that has
                  aged out would be a verdict on a number nobody stands behind,
                  and the comparison is the whole point of the sentence.
                */}
                {live && typical.nowTypical !== null && (
                  <UnusualBanner
                    liveMinutes={reading.waitMinutes}
                    typicalMinutes={typical.nowTypical}
                    dayName={typical.dayName}
                    hourLabel={typical.hourLabel}
                  />
                )}

                {reading.lanesOpen !== null && reading.maxLanes ? (
                  <BoothMeter open={reading.lanesOpen} max={reading.maxLanes} />
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
            inside the card, with the live reading drawn beside this hour's
            typical bar (see TypicalCard for why it never borrows the live
            numbers' severity colours).
          */}
          {port && <TypicalCard port={port} lane={lane} liveMinutes={liveMinutes} />}

          {port && <GroundTruthCard port={port} />}
        </>
      )}

      {/* Provenance for the numbers above — so it is hidden southbound, where
          there are no numbers for it to describe. */}
      {direction === 'northbound' && (
        <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap, gap: 4 }}>
          {reading ? (
            <Text style={[styles.source, tabular]}>
              Snapshot {formatClock(reading.observedAt, port?.feedTz)}
            </Text>
          ) : null}
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
    <View style={[styles.headerBlock, { paddingTop: topInset + 4 }]}>
      <View style={styles.headerTitleRow}>
        <IconButton onDark onPress={backToCrossings} accessibilityLabel="Back to crossings" style={styles.back}>
          <ArrowLeftGlyph size={24} color={color.cobaltLight} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1} role="heading">
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
        style={({ pressed }) => [styles.entranceButton, pressed && styles.entranceButtonPressed]}
        role="button"
        aria-label={
          lineStart
            ? `Directions to where the line starts: ${port.lineStartLabel}`
            : `Directions to ${port.displayName}. The pin is hand-placed, not surveyed`
        }
      >
        <View style={styles.entranceIcon}>
          <PinGlyph size={20} color={color.cobalt} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
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
        <ArrowUpRightGlyph size={16} color={color.muted} />
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
    <View style={[styles.unusual, { backgroundColor: tone.tint }]} accessible>
      {busy ? (
        <WarningGlyph size={18} color={tone.ink} />
      ) : (
        <ClockGlyph size={18} color={tone.ink} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.eyebrow, { color: tone.ink }]}>
          {busy ? 'Unusually busy' : 'Unusually quiet'}
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

/**
 * Lane picker as chips on navy: active is a cobalt fill, inactive an outline.
 * Availability rides before the label — a dot for open/unknown, a lock for
 * closed — and a lane the crossing does not have takes the duller ink (never
 * opacity) but stays tappable, so UnavailableState can say why. Scrolls
 * horizontally rather than shrinking, so labels never truncate.
 *
 * TOUCH TARGETS. The chips are 34pt tall; iOS only honours `hitSlop` inside
 * the parent's bounds, and a horizontal ScrollView clips at its own edge. So
 * the scroll content is padded to hold the full 44pt target and the
 * ScrollView pulled back by the same amount — the chips look 34 and hit 44.
 */
function LaneChips({
  options,
  value,
  onChange,
}: {
  options: readonly { value: LaneType; label: string; availability: LaneAvailability }[];
  value: LaneType;
  onChange: (v: LaneType) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.laneScroll}
      contentContainerStyle={styles.laneRow}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value;
        const ink = active ? color.surface : o.availability === 'none' ? color.muted : color.mutedOnDark;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            role="tab"
            aria-selected={active}
            aria-label={`${o.label}, ${
              { open: 'open', closed: 'closed', unknown: 'no report', none: 'not at this crossing' }[o.availability]
            }`}
            hitSlop={{ top: HIT_PAD, bottom: HIT_PAD }}
            style={({ pressed }) => [
              styles.laneChip,
              active ? styles.laneChipOn : styles.laneChipOff,
              pressed && (active ? styles.laneChipOnPressed : styles.laneChipOffPressed),
            ]}
          >
            {o.availability === 'closed' ? (
              <LockGlyph size={12} strokeWidth={2.4} color={ink} />
            ) : o.availability === 'open' ? (
              <View style={[styles.laneDot, { backgroundColor: status.clear.dot }]} />
            ) : o.availability === 'unknown' ? (
              <View style={[styles.laneDot, { backgroundColor: color.lineStrong }]} />
            ) : null}
            <Text style={[styles.laneChipText, { color: ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Extra touch height above and below the 34pt lane chips — see LaneChips. */
const HIT_PAD = 5;

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
      {/* On = navy, the "set" treatment every toggled button shares. */}
      <Button
        label={watching ? 'Watching · tap to stop' : 'Watch for changes'}
        selected={watching}
        icon={(tint) => <BellGlyph size={17} color={tint} />}
        onPress={() => prefs.toggleWatch(portId)}
      />
      <Text style={[styles.alertNote, tabular]}>
        {rulesOff
          ? 'Spike and closure rules are switched off on the Alerts tab.'
          : `Spikes of ${SPIKE_THRESHOLD}+ min and lane closures, on the Alerts tab while the app is open.`}
      </Text>
    </View>
  );
}

/**
 * The booth meter (v2 §08): one 8px pill per booth, cobalt for open, `line`
 * for closed, and the count in words. Never a percentage bar — the count is
 * the honest unit; drivers can see it themselves at the gate.
 *
 * Both figures are CBP's own (lanes_open / max_lanes per reading) and are
 * printed EXACTLY as given — if CBP ever reports more open than its maximum,
 * the sentence says so rather than quietly "correcting" CBP. The pills are
 * drawn for `max` and fill up to it.
 *
 * It does not editorialise. It used to append "line drains slowly" / "line
 * moves steadily" from a staffing ratio — a claim about how a queue BEHAVES,
 * and nothing here has ever measured throughput per booth — and to colour the
 * count amber under half staffing, when status colours are for wait severity
 * and a staffing fraction is not one.
 */
function BoothMeter({ open, max }: { open: number; max: number }) {
  return (
    <View style={{ gap: 8 }} accessible aria-label={`${open} of ${max} booths open`}>
      <View style={styles.boothRow}>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[styles.boothPill, { backgroundColor: i < open ? color.cobalt : color.line }]}
          />
        ))}
      </View>
      <Text style={[styles.meta, tabular]}>
        {open} of {max} booths open
      </Text>
    </View>
  );
}

/**
 * Never renders a number. The three non-open states each say what they mean,
 * and each carries its own glyph: a lock for closed, a clock for a figure CBP
 * has not posted, an em dash for a lane that is not here.
 */
function UnavailableState({ status: laneStatus }: { status: string | undefined }) {
  const copy: Record<string, { title: string; body: string; glyph: ReactNode }> = {
    closed: {
      title: 'Lanes closed',
      body: 'CBP reports this lane is not currently open. Try another lane or crossing.',
      glyph: <LockGlyph size={22} color={color.navy} />,
    },
    update_pending: {
      title: 'No current figure',
      body: 'CBP has not posted an updated wait for this lane. We won’t guess one.',
      glyph: <ClockGlyph size={22} color={color.navy} />,
    },
    not_available: {
      title: 'No lane here',
      body: 'This crossing does not have this lane type.',
      glyph: <Text style={styles.unavailableDash}>—</Text>,
    },
  };
  const c = copy[laneStatus ?? ''] ?? {
    title: 'No data',
    body: 'Nothing reported for this lane right now.',
    glyph: <Text style={styles.unavailableDash}>—</Text>,
  };
  return (
    <View style={styles.unavailable} accessible>
      <View style={styles.unavailableIcon}>{c.glyph}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.unavailableTitle}>{c.title}</Text>
        <Text style={styles.unavailableBody}>{c.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.mist },
  // Navy, edge to edge, under the status bar; the mist body starts below it.
  headerBlock: {
    backgroundColor: color.navy,
    paddingHorizontal: space.gutter,
    paddingBottom: space.cardPad,
    gap: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // The 44pt back button's glyph should sit on the gutter line, not 10pt in.
  back: { marginLeft: -10 },
  // Screen title on navy: 24/29/700, -0.02em, white.
  title: { flex: 1, ...type.screenTitle, color: color.surface },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirWrap: { marginTop: 0 },
  block: { marginHorizontal: space.gutter, marginTop: space.sectionGap },
  retry: { alignSelf: 'flex-start', marginTop: 4 },

  // See LaneChips on touch targets: the padding holds the 44pt hit area, the
  // negative margin gives the layout its 34pt back.
  laneScroll: { marginHorizontal: -space.gutter, marginVertical: -HIT_PAD },
  laneRow: { paddingHorizontal: space.gutter, paddingVertical: HIT_PAD, gap: 8 },
  // Chips on navy: active cobalt fill, inactive transparent with a 1px
  // lineOnDark outline. Both carry the 1px border (the active one in its own
  // fill colour) so both measure the same on the 4pt grid: 8 + 16 + 8 + 2.
  laneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  laneChipOn: { backgroundColor: color.cobalt, borderColor: color.cobalt },
  laneChipOff: { backgroundColor: 'transparent', borderColor: color.lineOnDark },
  laneChipOnPressed: { backgroundColor: color.cobaltPress, borderColor: color.cobaltPress },
  // The outline chip has no fill of its own; pressed, it takes the navy-fill
  // hover so it lifts off the header without borrowing the active cobalt.
  laneChipOffPressed: { backgroundColor: color.navyTint },
  laneChipText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold },
  laneDot: { width: 7, height: 7, borderRadius: 3.5 },

  // Entrance row: a full-width card, because "where do I actually drive to"
  // is the question, not a tertiary chip beside a pin button.
  entranceWrap: { paddingHorizontal: space.gutter },
  entranceButton: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: space.cardPad,
  },
  entranceButtonPressed: { backgroundColor: color.mist },
  entranceIcon: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: color.infoTint,
    alignItems: 'center', justifyContent: 'center',
  },
  entranceTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.navy },
  entranceSub: { ...caption, color: color.muted },

  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, padding: space.cardPad, gap: 12,
  },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  // Wait hero (§3): 48/48/700, −0.04em. See tightLineHeightFor for why iOS
  // gets a taller box with a negative margin.
  number: { ...type.waitHero },
  // The unit, one step down: 16/500 in muted, on the number's baseline — the
  // same unit treatment as the hero's.
  numberUnit: { fontSize: 16, lineHeight: 20, fontFamily: font.medium, color: color.muted, paddingBottom: 4 },
  numberTags: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6, marginLeft: 4 },
  meta: { ...type.metadata, color: color.muted },
  cardDivider: { height: 1, backgroundColor: color.line },
  typicalLine: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, color: color.navy },
  typicalStrong: { fontFamily: font.bold },
  typicalSource: { fontSize: 12, fontFamily: font.regular, color: color.muted },

  // The comparison banner. Takes the STATUS palette, not a brand colour: it is
  // a verdict about severity, which is what those colours are reserved for.
  unusual: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radius.banner, paddingVertical: 12, paddingHorizontal: space.cardPad,
  },
  unusualBody: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },
  unusualStrong: { fontFamily: font.bold },

  boothRow: { flexDirection: 'row', gap: 4 },
  boothPill: { flex: 1, height: 8, borderRadius: radius.pill },

  unavailable: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  unavailableIcon: {
    width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.mist,
    alignItems: 'center', justifyContent: 'center',
  },
  unavailableDash: { fontSize: 22, lineHeight: 26, fontFamily: font.bold, color: color.inkMuted },
  unavailableTitle: { ...type.cardTitle, color: color.navy },
  unavailableBody: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, color: color.muted },
  source: { ...caption, color: color.muted },

  // Sticky CTA: white bar, hairline top, full-width cobalt button, 48 tall.
  alertBar: {
    backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line,
    paddingHorizontal: space.gutter, paddingTop: 12, gap: 8,
  },
  alertNote: { ...caption, color: color.muted, textAlign: 'center' },
});
