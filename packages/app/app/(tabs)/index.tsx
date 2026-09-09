import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { freshnessOf, type Direction, type Freshness } from '@otrolado/shared';
import { SPIKE_THRESHOLD } from '../../src/alerts';
import { Badge, Chip, SegmentedControl } from '../../src/components/ui';
import { OriginChip } from '../../src/components/OriginChip';
import {
  BellGlyph,
  CarGlyph,
  ClockGlyph,
  NavigateGlyph,
  PushpinGlyph,
} from '../../src/components/glyphs';
import { openDirections } from '../../src/directions';
import { prefs, usePrefs } from '../../src/prefs';
import CrossingsMap from '../../src/components/CrossingsMap';
import { PeakAdvisoryCard } from '../../src/components/PeakAdvisoryCard';
import { CardCarousel } from '../../src/components/CardCarousel';
import { TimeBar } from '../../src/components/TimeBar';
import { formatAge, freshnessBadge } from '../../src/freshness-ui';
import {
  fasterThanText,
  laneStatusLabel,
  minutesBehindBest,
  noTotalReason,
  noTotalTone,
  rankPorts,
  readySavings,
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
import { color, font, radius, space, status, tabular, waitColor } from '../../src/theme';

/**
 * Cards shown in the ranking window before it starts scrolling in place.
 * Three of eleven keeps the whole screen — hero, map card, ranking — within
 * about one viewport, which was the point: the list should be reachable, not
 * discovered at the bottom of a long page. It was four while the map was a
 * ~50px row; the 260px card costs a row back.
 */
const VISIBLE_CROSSINGS = 3;

/**
 * Direction, as a full-width sliding pill under the wordmark.
 *
 * NORTHBOUND IS FIRST AND IS THE DEFAULT, deliberately. The layout this screen
 * is built to showed "To Mexico" selected with a populated ranking, which
 * cannot be honest: Mexico publishes no federal wait-time feed, so a
 * southbound default would make the app's very first screen a page of invented
 * numbers. Southbound is offered — travellers ask the question — and answered
 * with the no-data notice below.
 *
 * Labels name the destination, because that is how travellers say it; compass
 * words are the feed's vocabulary, not theirs.
 */
const DIRECTIONS = [
  { value: 'northbound', label: 'To U.S.' },
  { value: 'southbound', label: 'To Mexico' },
] as const satisfies readonly { value: Direction; label: string }[];

// The primary mark (gate lifting), white; on mist it sits in a cobalt tile
// per the brand sheet — never white-on-white.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MARK = require('../../assets/mark.png');

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

  /**
   * Pinned crossings surface in their own group above the ranking; both groups
   * keep `rankPorts`' order (fastest total first). A display-level partition,
   * not a re-rank — the hero still reads the full `ranked` array, so "best
   * crossing" stays the true best even when it isn't pinned.
   */
  const { pinned } = usePrefs();
  const pinnedRows = useMemo(
    () => ranked.filter((r) => pinned.includes(r.port.id)),
    [ranked, pinned],
  );
  const unpinnedRows = useMemo(
    () => ranked.filter((r) => !pinned.includes(r.port.id)),
    [ranked, pinned],
  );

  const best = ranked.find((r) => r.totalMinutes !== null);
  const advantage = fasterThanText(ranked);
  const ingestAge = aged.data?.ingestAgeSeconds ?? null;
  const refreshing = waits.isFetching && !waits.isLoading;
  /**
   * "Live from CBP" in the footer is a claim, so it is judged by the same
   * policy as the row badges — `freshnessOf` against the thresholds the
   * response shipped — on its ingest-age term alone. The footer describes the
   * poll, not one reading, so the reading-age input mirrors the ingest age
   * rather than picking a lane. Past `estimatedAfterS` the word goes.
   */
  const feedLive =
    aged.data !== undefined &&
    freshnessOf(
      {
        status: 'open',
        ingestAgeSeconds: ingestAge,
        readingAgeSeconds: ingestAge,
        feedAgeSeconds: null,
      },
      aged.data.thresholds,
    ) === 'live';
  /**
   * `usePorts` sets `placeholderData`, which forces React Query's status to
   * 'success' — `ports.isLoading` is therefore never true. "Still loading the
   * directory" is the bundle standing in while the real fetch is in flight; a
   * failed fetch keeps the placeholder but falls through to the error copy.
   */
  const portsLoading = ports.isPlaceholderData && ports.fetchStatus === 'fetching';

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
      style={{ backgroundColor: color.mist }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: space.tabBarClearance }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void waits.refetch()} tintColor={color.cobalt} />
      }
    >
      {/*
        Wordmark lockup and the origin, side by side. The origin is up here,
        beside the brand, because it is the input every number below is
        measured from — see OriginChip.
      */}
      <View style={styles.header}>
        <View style={styles.lockup}>
          <View style={styles.logoTile} accessible accessibilityLabel="Otrolado">
            <Image source={MARK} style={styles.logoMark} resizeMode="contain" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.wordmark}>otrolado</Text>
            <Text style={styles.tagline}>A faster way across</Text>
          </View>
        </View>
        <OriginChip origin={origin} />
      </View>

      <View style={styles.controls}>
        <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} />
        {/*
          Mode stays on this screen even though the reference layout drops it:
          it decides which crossings are RANKABLE AT ALL (`rankPorts` filters on
          `port.modes.includes(mode)`), so a pedestrian-only bridge appearing in
          a vehicle list — or a walker never seeing one — is a correctness
          problem, not a preference hidden one screen deeper.
        */}
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </View>

      {direction === 'southbound' ? (
        <SouthboundNotice />
      ) : waitsLoading ? (
        <View style={styles.list}>
          <Text style={styles.emptyText}>Loading crossings…</Text>
        </View>
      ) : (
        <>
          {best && (
            <HeroCard
              best={best}
              advantage={advantage}
              ingestAge={ingestAge}
              feedLive={feedLive}
            />
          )}
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
            The inline map card, between the hero and the list. Fed the same
            `ranked` array the list renders, so a pin and a row can never
            disagree about a crossing. A tap on the basemap opens the
            full-screen route (`app/map.tsx`), which is where panning actually
            works; mode travels with it so the map opens on what this screen
            is showing.
          */}
          <CrossingsMap
            rows={ranked}
            origin={origin}
            modeLabel={travelModeLabel(mode)}
            onExpand={() => router.push({ pathname: '/map', params: { mode } })}
          />

          {pinnedRows.length > 0 && (
            <>
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderTitle}>PINNED</Text>
                <Text style={styles.listHeaderNote}>fastest first</Text>
              </View>
              <View style={styles.list}>
                {pinnedRows.map((row) => (
                  <PortRow key={row.port.id} row={row} ranked={ranked} mode={mode} isPinned />
                ))}
              </View>
            </>
          )}
          {unpinnedRows.length > 0 && (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderTitle}>ALL CROSSINGS</Text>
              {/* Names the sort key. The loud number on each row IS this
                  number, so the header and the column agree. */}
              <Text style={styles.listHeaderNote}>sorted by total time</Text>
            </View>
          )}
          {/*
            Past VISIBLE_CROSSINGS the ranking scrolls within its own window
            rather than stretching the page. Below it, a plain stack — a
            scroller that cannot scroll would draw a rail that never moves.
            gap matches styles.list's, so a row is the same height either way.
          */}
          {unpinnedRows.length > VISIBLE_CROSSINGS ? (
            <CardCarousel visibleCount={VISIBLE_CROSSINGS} gap={12}>
              {unpinnedRows.map((row) => (
                <PortRow key={row.port.id} row={row} ranked={ranked} mode={mode} isPinned={false} />
              ))}
            </CardCarousel>
          ) : (
            <View style={styles.list}>
              {unpinnedRows.map((row) => (
                <PortRow key={row.port.id} row={row} ranked={ranked} mode={mode} isPinned={false} />
              ))}
            </View>
          )}
          {ranked.length === 0 && (
            <View style={styles.list}>
              {portsLoading || waits.isLoading ? (
                <Text style={styles.emptyText}>Loading crossings…</Text>
              ) : loadError ? (
                <UnreachableNotice onRetry={retry} />
              ) : (
                <Text style={styles.emptyText}>No crossings report this mode right now.</Text>
              )}
            </View>
          )}
        </>
      )}

      <SourceNote
        ingestAge={ingestAge}
        feedLive={feedLive}
        hasWaits={hasWaits}
        showingCached={showingCached}
        originIsFallback={origin.isFallback}
      />
    </ScrollView>
  );
}

/** Travel modes with their glyphs, as the reference layout draws them. */
const MODE_OPTIONS = TRAVEL_MODES.map((m) => ({
  ...m,
  label: m.value === 'pedestrian' ? 'Walking' : m.label,
})) as readonly { value: UiTravelMode; label: string }[];

/**
 * Southbound has no government feed. Rather than render a modelled guess in
 * the same visual language as fed data, the app says so plainly — the
 * prototype's 0.35x southbound multiplier was mock data, not a prediction.
 */
function SouthboundNotice() {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeDot} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.noticeTitle}>No official data heading south</Text>
        <Text style={styles.noticeBody}>
          Mexico publishes no federal wait-time feed. We would rather show nothing than show a
          number we can’t stand behind.
        </Text>
      </View>
    </View>
  );
}

/**
 * The hero's freshness pill: one verdict, one age, in one object.
 *
 * The reference layout puts a green "High confidence" shield here. There is no
 * such thing to compute — nothing in this system estimates how LIKELY a number
 * is to be right, only how OLD it is and whether CBP flagged it — so a
 * confidence badge would be a claim with no source behind it. This pill is the
 * honest version of the same reassurance: the freshness verdict the whole app
 * runs on, with the age that produced it.
 */
function HeroStatusPill({
  freshness,
  ingestAge,
  feedLive,
}: {
  freshness: Freshness;
  ingestAge: number | null;
  feedLive: boolean;
}) {
  const badge = freshnessBadge(freshness);
  const tone = badge
    ? { bg: badge.bg, fg: badge.fg, label: badge.label }
    : {
        bg: status.clear.tint,
        fg: status.clear.ink,
        // "LIVE" describes the reading; the poll can still have gone quiet
        // under it, which is what feedLive tracks.
        label: feedLive ? 'LIVE' : 'REPORTED',
      };
  return (
    <View style={[styles.heroPill, { backgroundColor: tone.bg }]}>
      <View style={[styles.heroPillDot, { backgroundColor: tone.fg }]} />
      {/* "Updated" is dropped from the reference copy on purpose: at 402pt the
          longer string pushed the label onto two lines, and the age next to a
          freshness verdict can only be the age OF that reading. */}
      <Text style={[styles.heroPillText, { color: tone.fg }, tabular]} numberOfLines={1}>
        {tone.label} · {formatAge(ingestAge)}
      </Text>
    </View>
  );
}

function HeroCard({
  best,
  advantage,
  ingestAge,
  feedLive,
}: {
  best: RankedPort;
  advantage: string | null;
  ingestAge: number | null;
  feedLive: boolean;
}) {
  // rankPorts only ranks ports with coordinates, but the types don't know that.
  const { lat, lng } = best.port;
  // `best` only ever comes from `ranked.find(r => r.totalMinutes !== null)`,
  // so the standard lane's wait is guaranteed numeric here.
  const waitMinutes = best.primary!.waitMinutes!;
  /**
   * "Watch" puts the crossing on the watchlist — the same switch as the
   * Alerts tab's chips, so spike and closure rules start evaluating it on the
   * next feed change. Nothing new is invented for the button: it is wired to
   * the one alert mechanism that actually runs, and says so once it is on.
   */
  const watching = usePrefs().watchlist.includes(best.port.id);
  // The card is a View with the tap-to-detail area and the buttons as
  // siblings — nested Pressables render as nested <button>s on web, which is
  // invalid HTML (see PortRow).
  return (
    <View style={styles.hero}>
      <Pressable
        style={{ gap: 10 }}
        onPress={() => router.push(`/port/${best.port.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${best.port.displayName}, about ${best.totalMinutes} minutes total. Open details`}
      >
        <View style={styles.heroTopRow}>
          {/*
            "BEST CROSSING FROM YOU", not "fastest route": there is no
            destination in this calculation and no routing under it. The
            journey it measures ends at the bridge, from the origin named in
            the header — so that is what the label says.
          */}
          <Text style={styles.heroLabel} numberOfLines={1}>
            BEST CROSSING FROM YOU
          </Text>
          <HeroStatusPill
            freshness={best.freshness}
            ingestAge={ingestAge}
            feedLive={feedLive}
          />
        </View>

        <Text style={styles.heroName}>{best.port.displayName}</Text>

        {/*
          "About" is load-bearing, not politeness. Half of this total is a
          straight-line drive estimate (drive.ts), so the sum is accurate to
          about as much as that is — and a bare "59 min total" claims a
          precision the inputs do not have.
        */}
        <View style={styles.heroTotalRow}>
          <Text style={styles.heroAbout}>About</Text>
          <Text style={[styles.heroTotalNum, tabular]}>{best.totalMinutes}</Text>
          <Text style={styles.heroTotalUnit}>min total</Text>
        </View>

        {advantage && (
          <View style={styles.heroAdvantage}>
            <Text style={[styles.heroAdvantageText, tabular]}>{advantage}</Text>
          </View>
        )}

        <TimeBar
          driveMinutes={best.drive.minutes}
          waitMinutes={waitMinutes}
          driveColor={color.cobaltOutline}
          waitColor={color.surface}
          height={8}
        />

        <View style={styles.heroSplit}>
          <View style={styles.heroSplitItem}>
            <CarGlyph size={16} color={color.cobaltLight} />
            <Text style={[styles.heroSplitText, tabular]}>
              <Text style={styles.heroSplitNum}>{best.drive.minutes} min</Text> drive · approx
            </Text>
          </View>
          <View style={styles.heroSplitDivider} />
          <View style={styles.heroSplitItem}>
            <ClockGlyph size={16} color={color.cobaltLight} />
            <Text style={[styles.heroSplitText, tabular]}>
              <Text style={styles.heroSplitNum}>{waitMinutes} min</Text> border wait
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.heroActions}>
        {/*
          Navigate hands off to the platform maps app (see directions.ts) —
          the primary action on cobalt is a white fill, not a second cobalt.
        */}
        {lat !== null && lng !== null && (
          <Pressable
            style={styles.heroPrimary}
            onPress={() => openDirections({ lat, lng })}
            accessibilityRole="button"
            accessibilityLabel={`Navigate to ${best.port.displayName}`}
          >
            <NavigateGlyph size={16} color={color.cobalt} />
            <Text style={styles.heroPrimaryText}>Navigate</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.heroSecondary, watching && styles.heroSecondaryOn]}
          onPress={() => prefs.toggleWatch(best.port.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: watching }}
          accessibilityLabel={
            watching
              ? `Stop watching ${best.port.displayName}`
              : `Watch ${best.port.displayName}`
          }
        >
          <BellGlyph size={16} color={color.surface} />
          <Text style={styles.heroSecondaryText}>{watching ? 'Watching' : 'Watch'}</Text>
        </Pressable>
      </View>
      {watching && (
        <Text style={styles.heroApprox}>
          Spikes of {SPIKE_THRESHOLD}+ min and closures here show on the Alerts tab while the app
          is open.
        </Text>
      )}
    </View>
  );
}

function PortRow({
  row,
  ranked,
  mode,
  isPinned,
}: {
  row: RankedPort;
  /** The whole field, for the "+N min behind" comparison. */
  ranked: readonly RankedPort[];
  mode: UiTravelMode;
  isPinned: boolean;
}) {
  const badge = freshnessBadge(row.freshness);
  const closed = row.primary?.status === 'closed';
  // No standard-lane number at all — closed, an overdue report, or a lane
  // this crossing doesn't have.
  const noTotal = row.totalMinutes === null;
  const behind = minutesBehindBest(row, ranked);
  const isBest = !noTotal && behind === null;
  /**
   * Ready Lane chip: most vehicle travellers qualify (RFID documents), so
   * "Ready or standard?" is the decision this list can actually settle. Kept
   * from the previous row design — but only in its GREEN state, when Ready
   * beats standard by enough to clear reporting noise. A neutral "READY 12m"
   * chip on every row was information without a decision attached, and the
   * compact row has no space for chips that change nothing.
   */
  const readyBeats =
    mode === 'passenger' && (readySavings(row) ?? 0) >= READY_HIGHLIGHT_MIN;

  // The pin sits BESIDE the tap-to-detail Pressable, not inside it: on web
  // both render as real <button> elements and nested buttons are invalid
  // HTML (React logs a hydration error). Siblings under one card View keep
  // the visuals identical and the roles legal on every platform.
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowBody}
        onPress={() => router.push(`/port/${row.port.id}`)}
        accessibilityRole="button"
        accessibilityLabel={
          noTotal
            ? `${row.port.displayName}, ${noTotalReason(row.primary).toLowerCase()}`
            : `${row.port.displayName}, about ${row.totalMinutes} minutes total`
        }
      >
        {/*
          The card's 4px status bar carries wait severity, so the total itself
          stays navy — status colour lives in exactly one place per row. Grey
          when the lane is closed-adjacent or reporting nothing numeric.
        */}
        <View
          style={[
            styles.statusBar,
            {
              backgroundColor: closed
                ? status.heavy.dot
                : row.primary?.status === 'open' && row.primary.waitMinutes !== null
                  ? waitColor(row.primary.waitMinutes)
                  : color.lineStrong,
            },
          ]}
        />

        <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.port.displayName}
          </Text>
          {noTotal ? (
            <Text
              style={[
                styles.rowReason,
                { color: noTotalTone(row.primary) === 'bad' ? status.heavy.ink : color.muted },
              ]}
            >
              {noTotalReason(row.primary)}
            </Text>
          ) : (
            <Text style={[styles.rowSplit, tabular]} numberOfLines={1}>
              {row.drive.minutes} drive ·{' '}
              <Text style={{ color: waitColor(row.primary!.waitMinutes!) }}>
                {row.primary!.waitMinutes} border
              </Text>
            </Text>
          )}
          <View style={styles.chipRow}>
            {isBest && <Chip label="BEST" tone="good" />}
            {behind !== null && <Chip label={`+${behind} min`} tone="bad" />}
            {/* Freshness rides in the chip row rather than beside the number:
                the reference layout has no badge at all, and dropping it would
                let an hours-old figure read as live. */}
            {badge && <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />}
            {readyBeats && <Chip label={`READY ${laneStatusLabel(row.ready)}`} tone="good" />}
          </View>
        </View>

        <View style={styles.rowTotalCol}>
          {noTotal ? (
            <Text style={[styles.rowTotalNum, { color: color.muted }]}>—</Text>
          ) : (
            <>
              {/*
                The list is sorted by total, the header says so, and this is
                that number — the sort key is the loud one. A `~` marks a
                total resting on a reading that is not live, the same mark the
                map pins and the Plan table use.
              */}
              <Text style={[styles.rowTotalNum, tabular]} numberOfLines={1}>
                {row.freshness === 'live' ? '' : '~'}
                {row.totalMinutes}
              </Text>
              <Text style={styles.rowTotalUnit}>min total</Text>
            </>
          )}
        </View>
      </Pressable>

      {/* hitSlop lifts the 15px glyph to a usable target. */}
      <Pressable
        hitSlop={12}
        onPress={() => prefs.togglePin(row.port.id)}
        accessibilityRole="button"
        accessibilityLabel={
          isPinned ? `Unpin ${row.port.displayName}` : `Pin ${row.port.displayName}`
        }
        accessibilityState={{ selected: isPinned }}
      >
        <PushpinGlyph
          size={15}
          color={isPinned ? color.navy : color.lineStrong}
          filled={isPinned}
        />
      </Pressable>
    </View>
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
  feedLive,
  hasWaits,
  showingCached,
  originIsFallback,
}: {
  ingestAge: number | null;
  /** Ingest age within the live threshold; otherwise the line drops "Live". */
  feedLive: boolean;
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
        <Text style={[styles.sourceText, tabular]}>
          {feedLive ? 'Live from CBP' : 'From CBP'} · updated {formatAge(ingestAge)}
        </Text>
      ) : null}
      <Text style={styles.sourceText}>
        Drive times are straight-line approximations, not routed ETAs
        {originIsFallback ? ', from a starting point nobody has set — tap it to fix' : ''}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.gutter, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  // Wordmark: the brand sheet's lowercase lockup, set in the app's own type.
  wordmark: { fontSize: 22, fontFamily: font.bold, color: color.navy, letterSpacing: -0.9 },
  tagline: { fontSize: 11.5, fontFamily: font.regular, color: color.muted, marginTop: -1 },
  // Brand sheet's 40px tile: radius 11, mark ~57% of the tile height.
  logoTile: {
    width: 40, height: 40, borderRadius: 11, backgroundColor: color.cobalt,
    alignItems: 'center', justifyContent: 'center',
  },
  logoMark: { height: 23, width: 26 },

  controls: { paddingHorizontal: space.gutter, marginTop: 14, gap: 8 },

  // Hero surface: the one cobalt per viewport.
  hero: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.cobalt, borderRadius: radius.hero,
    paddingHorizontal: 20, paddingVertical: 18, gap: 10,
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
  },
  // Micro label on dark: 10/600, 0.11em.
  heroLabel: {
    fontSize: 10, fontFamily: font.semibold, letterSpacing: 0.9,
    color: color.cobaltLight, flexShrink: 1,
  },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4,
  },
  heroPillDot: { width: 6, height: 6, borderRadius: 3 },
  heroPillText: { fontSize: 10, fontFamily: font.semibold, letterSpacing: 0.2 },
  heroName: { fontSize: 20, fontFamily: font.bold, color: color.surface, letterSpacing: -0.4 },
  heroTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  heroAbout: { fontSize: 19, fontFamily: font.medium, color: color.surface },
  // Hero number (§3): 46/700, -0.045em. Poppins digits are lining figures
  // (~0.7em, no descenders) so the tightened line box leaves clearance.
  heroTotalNum: {
    fontSize: 46, fontFamily: font.bold, color: color.surface,
    letterSpacing: -2.07, lineHeight: 46,
  },
  heroTotalUnit: { fontSize: 17, fontFamily: font.medium, color: color.surface },
  // The advantage chip: light fill on cobalt, so it reads as a callout rather
  // than a second brand surface.
  heroAdvantage: {
    alignSelf: 'flex-start', backgroundColor: status.clear.tint,
    borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5,
  },
  heroAdvantageText: { fontSize: 12.5, fontFamily: font.semibold, color: status.clear.ink },
  heroSplit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroSplitItem: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  heroSplitDivider: { width: 1, height: 16, backgroundColor: color.cobaltOutline },
  heroSplitText: { fontSize: 11.5, fontFamily: font.regular, color: color.cobaltLight },
  heroSplitNum: { fontFamily: font.semibold, color: color.surface },
  heroApprox: { fontSize: 11, fontFamily: font.regular, color: color.cobaltLight },
  // Two equal buttons, 48 tall, button radius, 14/600 (§5). Primary on cobalt
  // is a white fill with COBALT text; secondary is the cobaltOutline border.
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  heroPrimary: {
    flex: 1, height: 48, borderRadius: radius.button, flexDirection: 'row', gap: 8,
    backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center',
  },
  heroPrimaryText: { fontSize: 14.5, fontFamily: font.bold, color: color.cobalt },
  heroSecondary: {
    flex: 1, height: 48, borderRadius: radius.button, flexDirection: 'row', gap: 8,
    borderWidth: 1.5, borderColor: color.cobaltOutline,
    alignItems: 'center', justifyContent: 'center',
  },
  heroSecondaryOn: { backgroundColor: color.surfaceOnCobalt, borderColor: color.surface },
  heroSecondaryText: { fontSize: 14.5, fontFamily: font.semibold, color: color.surface },

  listHeader: {
    marginTop: space.sectionGap,
    paddingHorizontal: space.gutter,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  // All-caps label: 11/600, 0.1em.
  listHeaderTitle: {
    fontSize: 11, fontFamily: font.semibold, letterSpacing: 1.1, color: color.muted,
  },
  listHeaderNote: { fontSize: 11, fontFamily: font.regular, color: color.muted },

  list: { marginTop: 8, paddingHorizontal: space.gutter, gap: 12 },
  // Crossing card: white, 1px line, radius 16.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 15,
  },
  // The card's navigable area; the pin button is its sibling (see PortRow).
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBar: { width: 4, alignSelf: 'stretch', borderRadius: radius.pill },
  rowName: { fontSize: 15, fontFamily: font.semibold, color: color.navy },
  rowSplit: { fontSize: 12, fontFamily: font.regular, color: color.muted },
  rowReason: { fontSize: 12, fontFamily: font.semibold },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  // Right column: the door-to-door total, which is what the list is sorted by.
  rowTotalCol: { alignItems: 'flex-end', gap: 1 },
  rowTotalNum: { fontSize: 27, fontFamily: font.bold, color: color.navy, letterSpacing: -1 },
  rowTotalUnit: { fontSize: 10, fontFamily: font.semibold, color: color.muted, letterSpacing: 0.2 },

  // Notice banner: info tint, radius 14, 7px cobalt dot.
  notice: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    flexDirection: 'row', gap: 10,
    backgroundColor: color.infoTint,
    borderRadius: radius.banner, paddingVertical: 13, paddingHorizontal: 15,
  },
  noticeDot: {
    width: 7, height: 7, borderRadius: 3.5, marginTop: 6,
    backgroundColor: color.cobalt,
  },
  noticeTitle: { fontSize: 13, fontFamily: font.semibold, color: color.infoInk },
  noticeBody: { fontSize: 13, fontFamily: font.regular, color: color.infoInk, lineHeight: 19 },

  emptyText: { fontSize: 13, color: color.muted, fontFamily: font.regular, paddingVertical: 20, textAlign: 'center' },
  sourceText: { fontSize: 11, fontFamily: font.regular, color: color.muted },
  errorText: { fontSize: 11.5, fontFamily: font.semibold, color: status.heavy.ink },

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
