import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { Direction, Freshness } from '@otrolado/shared';
import { SPIKE_THRESHOLD } from '../../src/alerts';
import type { BoothBreakdown } from '../../src/booths';
import {
  Button,
  Chip,
  FreshnessBadge,
  IconButton,
  Notice,
  Pill,
  SectionLabel,
  Skeleton,
} from '../../src/components/ui';
import { AppIcon } from '../../src/components/AppIcon';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { TripSetupCard } from '../../src/components/TripSetupCard';
import {
  BellGlyph,
  CarGlyph,
  ClockGlyph,
  CrossingGlyph,
  LockGlyph,
  NavigateGlyph,
  OfflineGlyph,
  PushpinGlyph,
} from '../../src/components/glyphs';
import { openDirections } from '../../src/directions';
import { prefs, usePrefs } from '../../src/prefs';
import CrossingsMap from '../../src/components/CrossingsMap';
import { PeakAdvisoryCard } from '../../src/components/PeakAdvisoryCard';
import { CardCarousel } from '../../src/components/CardCarousel';
import { TimeBar } from '../../src/components/TimeBar';
import {
  formatAge,
  freshnessBadge,
  numberInk,
  numberInkOnCobalt,
  spokenFreshness,
} from '../../src/freshness-ui';
import {
  fasterThanText,
  laneStatusLabel,
  minutesBehindBest,
  noTotalReason,
  rankPorts,
  readySavings,
  READY_HIGHLIGHT_MIN,
  type RankedPort,
} from '../../src/ranking';
import {
  DEFAULT_TRAVEL_MODE,
  travelModeLabel,
  type UiTravelMode,
} from '../../src/modes';
import { usePorts, useWaits } from '../../src/queries';
import { feedIsLive, laneAgeSeconds, useAgedWaits } from '../../src/useFreshness';
import { useOnline } from '../../src/useOnline';
import { useOrigin } from '../../src/useOrigin';
import {
  DISPLAY_MAX_FONT_SCALE,
  font,
  radius,
  space,
  tabular,
  themes,
  waitColor,
  waitTextColor,
} from '../../src/theme';
import { caption, type } from '../../src/typography';
import { makeStyles, useTheme } from '../../src/useTheme';

/**
 * Cards shown in the ranking window before it starts scrolling in place.
 * Three of eleven keeps the whole screen — hero, map card, ranking — within
 * about one viewport, which was the point: the list should be reachable, not
 * discovered at the bottom of a long page. It was four while the map was a
 * ~50px row; the 260px card costs a row back.
 */
const VISIBLE_CROSSINGS = 3;

export default function Home() {
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<UiTravelMode>(DEFAULT_TRAVEL_MODE);
  // Northbound first and default — see DIRECTIONS in modes.ts.
  const [direction, setDirection] = useState<Direction>('northbound');

  const origin = useOrigin();
  const ports = usePorts();
  const waits = useWaits();
  // Verdicts and ages re-judged against the clock NOW, not at fetch time —
  // cached data must degrade on screen, not stay "2 min ago" forever.
  const aged = useAgedWaits(waits);
  // The link state, for the OFFLINE freshness state: the numbers keep their
  // own ages; this says why they are not getting newer.
  const online = useOnline();

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
  /**
   * The hero's age: the older of the poll and the hero crossing's own
   * reading, because its verdict is the worse of those two. The poll's age
   * alone could print "STALE · 2 min ago" for a crossing CBP dropped from an
   * otherwise-healthy feed.
   */
  const heroAge = laneAgeSeconds(ingestAge, best?.primary, aged.nowMs);
  /**
   * The spinner shows only for a refresh the user pulled for — never for the
   * 60 s background poll or the refetch on returning to the app. Handing iOS
   * `refreshing={true}` without a pull makes it scroll the page down by the
   * spinner's height, so every poll yanked the list ~60pt wherever the user
   * was reading. (Web's RefreshControl is inert, which is why it never showed.)
   */
  const [pulling, setPulling] = useState(false);
  const onPull = (): void => {
    setPulling(true);
    void waits.refetch().finally(() => setPulling(false));
  };
  /** "Live from CBP" in the footer is a claim about the poll — see feedIsLive. */
  const feedLive = feedIsLive(aged.data);
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
   * "not reporting" plus a fabricated STALE verdict, which flashed on every
   * cold start for the length of the first round trip. STALE means "we have a
   * number and it is old"; a load in flight is a different sentence — say
   * "loading", as skeletons (v2 §07: first open only; once a number has been
   * seen, a refresh never blanks it). `fetchStatus === 'paused'` (offline with
   * no cache) deliberately falls through to the rows: the bundled directory
   * with no numbers IS the designed no-network first launch.
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
      style={{ backgroundColor: color.page }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: space.tabBarClearance }}
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={color.accent} />
      }
    >
      {/* Brand and the one global preference. Trip inputs are grouped below. */}
      <View style={styles.header}>
        <View style={styles.lockup}>
          {/* The official icon — the same artwork as the home screen's. */}
          <AppIcon size={40} />
          <View>
            <Text style={styles.wordmark}>otrolado</Text>
            <Text style={styles.tagline} numberOfLines={1}>
              A faster way across
            </Text>
          </View>
        </View>
        <ThemeToggle />
      </View>

      <TripSetupCard
        origin={origin}
        direction={direction}
        mode={mode}
        onDirectionChange={setDirection}
        onModeChange={setMode}
      />

      {direction === 'southbound' ? (
        /*
          Southbound has no government feed. Rather than render a modelled
          guess in the same visual language as fed data, the app says so
          plainly — the prototype's 0.35x southbound multiplier was mock data,
          not a prediction.
        */
        <Notice title="No official data heading south" style={styles.sectionBlock}>
          Mexico publishes no federal wait-time feed. We would rather show nothing than show a
          number we can’t stand behind.
        </Notice>
      ) : waitsLoading ? (
        <HomeSkeleton />
      ) : (
        <>
          {best && (
            <HeroCard
              best={best}
              advantage={advantage}
              age={heroAge}
              feedLive={feedLive}
              online={online}
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
                <SectionLabel>Pinned</SectionLabel>
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
              <SectionLabel>All crossings</SectionLabel>
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
                <HomeSkeleton inline />
              ) : loadError ? (
                /*
                  The list slot, not the footer. A hard failure used to
                  surface only as an 11.5px line below an empty list, which
                  reads as "nothing to show" rather than "this is broken" —
                  the reason a CORS fault went undiagnosed.
                */
                <Notice
                  tone="error"
                  title="Can’t reach the server"
                  action={
                    <Button label="Try again" size="sm" onPress={retry} style={styles.retry} />
                  }
                >
                  No wait times loaded, and there’s no saved copy from an earlier visit to fall
                  back on. Check that the API is running, then try again.
                </Notice>
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
        online={online}
        originIsFallback={origin.isFallback}
      />
    </ScrollView>
  );
}

/**
 * The first-open loading state: the shapes of the hero and three rows, in
 * `line`, pulsing. Never a full-screen spinner. `inline` drops the hero and
 * the gutter for use inside an existing list slot.
 */
function HomeSkeleton({ inline = false }: { inline?: boolean }) {
  const styles = useStyles();
  return (
    <View
      style={inline ? { gap: 12 } : styles.list}
      accessible
      role="progressbar"
      aria-label="Loading crossings"
    >
      {!inline && <Skeleton width="100%" height={236} round={radius.hero} />}
      <Skeleton width="100%" height={88} round={radius.card} />
      <Skeleton width="100%" height={88} round={radius.card} />
      <Skeleton width="100%" height={88} round={radius.card} />
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
 *
 * Every state carries its own word AND mark, so colour is never the only
 * channel: LIVE (dot); ESTIMATED / STALE (clock — this has aged); OFFLINE
 * (struck signal — no link). Offline never REPLACES a verdict: a non-live
 * reading offline keeps its ESTIMATED/STALE colours and word, with "offline"
 * added — the connection explains why the number is old, it does not excuse
 * saying so.
 *
 * Every pill here sits on the cobalt hero, which is the same colour in both
 * modes — so the pills are mode-independent too, the way `onCobalt` is. The
 * dark status tints are authored against the dark `surface` and are 1.6–1.95:1
 * on cobalt (a near-black capsule whose green/amber/red cannot be told
 * apart); the LIGHT tints are 6.4–6.9:1 there, and their inks keep AA on
 * them. So the verdict pills take the light palette's `{tint, ink}` pairs
 * regardless of scheme. Row and detail badges stay on the current theme —
 * those sit on `surface`, where the dark twins belong.
 */
const STATUS_ON_COBALT = themes.light;

function HeroStatusPill({
  freshness,
  age,
  feedLive,
  online,
}: {
  freshness: Freshness;
  age: number | null;
  feedLive: boolean;
  online: boolean;
}) {
  const { color } = useTheme();
  const ageText = formatAge(age);
  const badge = freshnessBadge(freshness, STATUS_ON_COBALT);
  if (badge) {
    return (
      <Pill
        label={online ? `${badge.label} · ${ageText}` : `${badge.label} · offline · ${ageText}`}
        bg={badge.bg}
        fg={badge.fg}
        icon={
          online ? (
            <ClockGlyph size={12} strokeWidth={2.4} color={badge.fg} />
          ) : (
            <OfflineGlyph compact size={12} strokeWidth={2.4} color={badge.fg} />
          )
        }
      />
    );
  }
  if (!online) {
    return (
      // On the cobalt hero, so the on-cobalt family: `inset` is the well
      // inside a card and in dark it is 1.4:1 against cobalt — the pill
      // vanished. The inverse surface (white with navy) reads in both modes.
      <Pill
        label={`Offline · last known ${ageText}`}
        bg={color.onCobalt}
        fg={color.navy}
        icon={<OfflineGlyph compact size={12} strokeWidth={2.4} color={color.navy} />}
      />
    );
  }
  // "LIVE" describes the reading; the poll can still have gone quiet under
  // it, which is what feedLive tracks. "Updated" is dropped on purpose: the
  // age next to a verdict is the age that verdict was judged on.
  return (
    <Pill
      label={`${feedLive ? 'Live' : 'Reported'} · ${ageText}`}
      bg={STATUS_ON_COBALT.status.clear.tint}
      fg={STATUS_ON_COBALT.status.clear.ink}
      dot
    />
  );
}

function HeroCard({
  best,
  advantage,
  age,
  feedLive,
  online,
}: {
  best: RankedPort;
  advantage: string | null;
  /** The age the hero's verdict was judged on — see `laneAgeSeconds`. */
  age: number | null;
  feedLive: boolean;
  online: boolean;
}) {
  const t = useTheme();
  const { color } = t;
  const styles = useStyles();
  // rankPorts only ranks ports with coordinates, but the types don't know that.
  const { lat, lng } = best.port;
  // `best` only ever comes from `ranked.find(r => r.totalMinutes !== null)`,
  // so the standard lane's wait is guaranteed numeric here.
  const waitMinutes = best.primary!.waitMinutes!;
  const live = best.freshness === 'live';
  /**
   * "Watch" puts the crossing on the watchlist — the same switch as the
   * Alerts tab's chips, so spike and closure rules start evaluating it on the
   * next feed change. Nothing new is invented for the button: it is wired to
   * the one alert mechanism that actually runs, and says so once it is on.
   */
  const watching = usePrefs().watchlist.includes(best.port.id);
  // The tap-to-detail area sits inside the hero's padding, so its pressed
  // state is lifted here to darken the whole surface rather than an inset box.
  const [heroPressed, setHeroPressed] = useState(false);
  // A Pressable's label replaces what it contains, so everything the badge,
  // the `~` and the offline pill say to the eye is said here too.
  const spoken =
    `${best.port.displayName}, about ${best.totalMinutes} minutes total: ` +
    `${best.drive.minutes} minutes driving, approximate, and ${waitMinutes} at the border. ` +
    `${spokenFreshness(best.freshness)}${online ? '' : ', offline'}, ${formatAge(age)}. Open details`;
  // The card is a View with the tap-to-detail area and the buttons as
  // siblings — nested Pressables render as nested <button>s on web, which is
  // invalid HTML (see PortRow).
  return (
    <View style={[styles.hero, heroPressed && styles.heroPressed]}>
      <Pressable
        style={{ gap: 12 }}
        onPressIn={() => setHeroPressed(true)}
        onPressOut={() => setHeroPressed(false)}
        onPress={() => router.push(`/port/${best.port.id}`)}
        role="button"
        aria-label={spoken}
      >
        <View style={styles.heroTopRow}>
          {/*
            "BEST CROSSING FROM YOU", not "fastest route": there is no
            destination in this calculation and no routing under it. The
            journey it measures ends at the bridge, from the origin named in
            the header — so that is what the label says.
          */}
          <SectionLabel tone="cobalt">
            Best crossing from you
          </SectionLabel>
          <HeroStatusPill freshness={best.freshness} age={age} feedLive={feedLive} online={online} />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={styles.heroName}>{best.port.displayName}</Text>

          {/*
            "About" is load-bearing, not politeness. Half of this total is a
            straight-line drive estimate (drive.ts), so the sum is accurate to
            about as much as that is — and a bare "59 min total" claims a
            precision the inputs do not have. A total resting on a reading that
            is not live gets the `~` every other non-live number wears and
            steps down to cobalt-light — never `muted`, which is 1.5:1 here.
          */}
          <View style={styles.heroTotalRow}>
            <Text style={styles.heroUnit}>About</Text>
            <Text
              style={[styles.heroTotalNum, { color: numberInkOnCobalt(best.freshness, t) }, tabular]}
              maxFontSizeMultiplier={DISPLAY_MAX_FONT_SCALE}
            >
              {live ? '' : '~'}
              {best.totalMinutes}
            </Text>
            <Text style={styles.heroUnit}>min total</Text>
          </View>
        </View>

        {advantage && (
          <View style={styles.heroAdvantage}>
            <Text style={[styles.heroAdvantageText, tabular]}>{advantage}</Text>
          </View>
        )}

        {/*
          The proportion bar (v2 §10): cobalt-light for the drive, white for
          the border, so it reads at a glance which half is the problem. The
          split beneath it says the same in numbers — two numbers, never three.
          It wraps rather than truncating: "· approx" is the disclosure, and
          it was the first thing a one-line clamp cut at 375pt.
        */}
        <View style={{ gap: 8 }}>
          <TimeBar
            driveMinutes={best.drive.minutes}
            waitMinutes={waitMinutes}
            driveColor={color.cobaltLight}
            waitColor={color.onCobalt}
          />
          <View style={styles.heroSplit}>
            <View style={styles.heroSplitItem}>
              <CarGlyph size={15} color={color.cobaltLight} strokeWidth={2.2} />
              <Text style={[styles.heroSplitText, tabular]}>
                {best.drive.minutes} min drive
                <Text style={styles.heroSplitNote}> · approx</Text>
              </Text>
            </View>
            <View style={styles.heroSplitItem}>
              <CrossingGlyph size={15} color={color.onCobalt} strokeWidth={2.2} />
              <Text style={[styles.heroSplitText, styles.heroSplitStrong, tabular]}>
                {waitMinutes} min border
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      <View style={styles.heroActions}>
        {/*
          Navigate hands off to the platform maps app (see directions.ts) —
          the primary action on cobalt is a white fill with navy text, so the
          hero keeps a single focal point. Watch is the outline secondary.
        */}
        {lat !== null && lng !== null && (
          <Button
            variant="inverse"
            label="Navigate"
            grow
            icon={(tint) => <NavigateGlyph size={16} color={tint} />}
            onPress={() => openDirections({ lat, lng })}
            accessibilityLabel={`Navigate to ${best.port.displayName}`}
          />
        )}
        <Button
          variant="ghostOnCobalt"
          label={watching ? 'Watching' : 'Watch'}
          selected={watching}
          grow
          icon={(tint) => <BellGlyph size={16} color={tint} />}
          onPress={() => prefs.toggleWatch(best.port.id)}
          accessibilityLabel={
            watching
              ? `Stop watching ${best.port.displayName}`
              : `Watch ${best.port.displayName}`
          }
        />
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
  const t = useTheme();
  const { color } = t;
  const styles = useStyles();
  const closed = row.primary?.status === 'closed';
  const live = row.freshness === 'live';
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
  // Lifted for the same reason as the hero's: the whole card tints, not just
  // the body inside its padding.
  const [bodyPressed, setBodyPressed] = useState(false);
  const wait = row.primary?.status === 'open' ? row.primary.waitMinutes : null;

  // The pin sits BESIDE the tap-to-detail Pressable, not inside it: on web
  // both render as real <button> elements and nested buttons are invalid
  // HTML (React logs a hydration error). Siblings under one card View keep
  // the visuals identical and the roles legal on every platform.
  return (
    <View style={[styles.row, bodyPressed && styles.rowPressed]}>
      <Pressable
        style={styles.rowBody}
        onPressIn={() => setBodyPressed(true)}
        onPressOut={() => setBodyPressed(false)}
        onPress={() => router.push(`/port/${row.port.id}`)}
        role="button"
        aria-label={
          (noTotal
            ? `${row.port.displayName}, ${noTotalReason(row.primary).toLowerCase()}`
            : `${row.port.displayName}, about ${row.totalMinutes} minutes total, ${spokenFreshness(row.freshness)}`) +
          // The strip is drawn with unlabelled Views inside this Pressable,
          // whose label REPLACES its children — unspoken, the booth split
          // would exist for sighted users only.
          (row.booths ? `. ${spokenBooths(row.booths)}` : '')
        }
      >
        {/*
          The card's 4px status bar carries wait severity, so the total itself
          stays in ink — status colour lives in exactly one place per row. It
          wears the severity scale only for a LIVE reading, the same rule the
          map pins follow: a reading nobody stands behind can't wear the live
          green. `lineStrong` when not live or not numeric (the badge and the
          `~` say which), `line` when the lane is closed (a state, not a
          severity — the lock on the right says so).
        */}
        <View
          style={[
            styles.statusBar,
            {
              backgroundColor:
                wait !== null && live ? waitColor(wait) : closed ? color.line : color.lineStrong,
            },
          ]}
        />

        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.port.displayName}
          </Text>
          {noTotal ? (
            <Text style={styles.rowSub}>{noTotalReason(row.primary)}</Text>
          ) : (
            // The two halves of the total, so the loud number reads as their
            // sum. The border half wears its severity as TEXT ink (the AA pair
            // of the bar's dot colour) while live, and plain `muted` once not.
            <Text style={[styles.rowSub, tabular]} numberOfLines={1}>
              {row.drive.minutes} min drive +{' '}
              <Text style={live ? { color: waitTextColor(row.primary!.waitMinutes!, t.status) } : undefined}>
                {row.primary!.waitMinutes} min border
              </Text>
            </Text>
          )}
          {row.booths && <BoothStrip booths={row.booths} live={live} />}
          <View style={styles.chipRow}>
            {isBest && <Chip label="BEST" tone="good" />}
            {behind !== null && <Chip label={`+${behind} min`} tone="bad" />}
            {/* Freshness rides in the chip row rather than beside the number:
                the reference layout has no badge at all, and dropping it would
                let an hours-old figure read as live. */}
            <FreshnessBadge freshness={row.freshness} />
            {readyBeats && <Chip label={`READY ${laneStatusLabel(row.ready)}`} tone="good" />}
          </View>
        </View>

        <View style={styles.rowTotalCol}>
          {closed ? (
            // A closed lane is a state with its own glyph and word (v2 §07),
            // not a severity and not a zero.
            <View style={styles.rowClosed}>
              <LockGlyph size={16} color={color.muted} strokeWidth={2.2} />
              <Text style={styles.rowClosedText}>Closed</Text>
            </View>
          ) : noTotal ? (
            // Em dash, never a zero. Decorative, so it may sit in `inkMuted`.
            <Text style={[styles.rowTotalNum, { color: color.inkMuted }]}>—</Text>
          ) : (
            /*
              The list is sorted by total, the header says so, and this is
              that number — the sort key is the loud one. A `~` marks a total
              resting on a reading that is not live, the same mark the map
              pins and the Plan table use, and the number steps down to
              `muted` — still readable, visibly not current.
            */
            <Text
              style={[styles.rowTotalNum, { color: numberInk(row.freshness, t) }, tabular]}
              numberOfLines={1}
              maxFontSizeMultiplier={DISPLAY_MAX_FONT_SCALE}
            >
              {live ? '' : '~'}
              {row.totalMinutes}
              <Text style={styles.rowTotalUnit}>m</Text>
            </Text>
          )}
        </View>
      </Pressable>

      {/* 44pt, 24px glyph. Pinned is the colour of the glyph and the tile
          behind it — glyphs are never filled in. */}
      <IconButton
        selected={isPinned}
        onPress={() => prefs.togglePin(row.port.id)}
        accessibilityLabel={
          isPinned ? `Unpin ${row.port.displayName}` : `Pin ${row.port.displayName}`
        }
      >
        <PushpinGlyph size={22} color={isPinned ? color.accent : color.muted} />
      </IconButton>
    </View>
  );
}

/**
 * Booth staffing, inline on a crossing card: one pill per booth CBP reports
 * for this crossing's plaza, plus the count in words.
 *
 * THREE states, because `maxLanes` is a whole-plaza figure while `lanesOpen`
 * is per lane (see `booths.ts`). The accent is a booth on the lane this row is
 * ranked on; the lighter blue is a booth open on SENTRI or Ready; `line` is a
 * booth nobody is working. Rendering only the first and last — the obvious
 * two-state meter — would paint Hidalgo as two booths of twelve when seven
 * are staffed.
 *
 * It states a fact and stops, the same rule the detail screen's meter follows:
 * no arrow (nothing here stores a previous booth count, so a trend would be
 * drawn from no data) and no severity colour on the count (status colours are
 * for wait severity; a staffing fraction is not one).
 */
function BoothStrip({ booths, live }: { booths: BoothBreakdown; live: boolean }) {
  const { color } = useTheme();
  const styles = useStyles();
  const { max, onLane, onOther } = booths;
  /*
    The accent means "current reading" across the app — it is the one live bar
    on the TypicalCard for exactly this reason — so a booth count that is no
    longer live cannot wear it. The ramp steps down to ink greys and the count
    takes the `~` every non-live number in the app takes. The big step stays
    between this lane and the others, which is the distinction the row is
    ranked on; open-vs-closed is the finer one either way.
  */
  const onLaneInk = live ? color.accent : color.muted;
  const onOtherInk = live ? color.cobaltOutline : color.lineStrong;

  return (
    <View style={styles.boothStrip}>
      {/* Decorative: the count beside it is the accessible version, and the
          row's aria-label speaks both. */}
      <View style={styles.boothTrack} aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[
              styles.boothPill,
              {
                backgroundColor:
                  i < onLane ? onLaneInk : i < onLane + onOther ? onOtherInk : color.line,
              },
            ]}
          />
        ))}
      </View>
      {/*
        Names the LANE, not just the fraction. "2/12 booths" is read as two of
        twelve booths being staffed — the very error the three colours are
        drawn to correct — so the count has to say which of the twelve it is
        counting. The word is always "standard" because the ranking is always
        on the standard lane; it is the label's job to make that visible.
      */}
      <Text style={[styles.boothCount, tabular]} numberOfLines={1}>
        {live ? '' : '~'}
        {onLane}/{max} standard
      </Text>
    </View>
  );
}

/**
 * The strip in words. Names the plaza total separately from this lane's share,
 * so a screen reader gets the distinction the three colours carry — "2 of 12"
 * alone would hand back the same wrong reading the colours exist to prevent.
 */
function spokenBooths({ max, onLane, onOther }: BoothBreakdown): string {
  const lane = `${onLane} of ${max} booths open on this lane`;
  return onOther > 0 ? `${lane}, ${onOther} more open on other lanes` : lane;
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
  online,
  originIsFallback,
}: {
  ingestAge: number | null;
  /** Ingest age within the live threshold; otherwise the line drops "Live". */
  feedLive: boolean;
  hasWaits: boolean;
  showingCached: boolean;
  online: boolean;
  originIsFallback: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap, gap: 4 }}>
      {!online && hasWaits ? (
        <Text style={styles.sourceStrong}>
          Offline — showing the last data we saved. Alerts wait for the connection.
        </Text>
      ) : showingCached ? (
        <Text style={styles.errorText}>
          Can’t reach the server — showing the last data we saved.
        </Text>
      ) : null}
      {hasWaits ? (
        <Text style={[styles.sourceText, tabular]}>
          {feedLive && online ? 'Live from CBP' : 'From CBP'} · updated {formatAge(ingestAge)}
        </Text>
      ) : null}
      <Text style={styles.sourceText}>
        Drive times are straight-line approximations, not routed ETAs
        {originIsFallback ? ', from a starting point nobody has set — tap it to fix' : ''}.
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ color, status }) => ({
  header: {
    minHeight: 44, paddingHorizontal: space.gutter, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Wordmark: the brand sheet's lowercase lockup, set in the app's own type.
  wordmark: { fontSize: 22, lineHeight: 26, fontFamily: font.bold, color: color.ink, letterSpacing: -0.9 },
  tagline: { fontSize: 12, lineHeight: 16, fontFamily: font.regular, color: color.muted },

  sectionBlock: { marginHorizontal: space.gutter, marginTop: space.sectionGap },

  // Hero surface: the one cobalt per viewport. Radius 24, padding 20.
  hero: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.cobalt, borderRadius: radius.hero,
    padding: space.heroPad, gap: 12,
  },
  heroPressed: { backgroundColor: color.cobaltPress },
  // Eyebrow, then the pill beneath it — ALWAYS stacked. Side by side, the
  // pair only fit while the age was short: a wrapping row made the hero jump
  // height the moment "9 min ago" became "10 min ago", and the long offline
  // pill squeezed the eyebrow onto four lines at 375pt. A fixed stack costs
  // one line and never moves.
  heroTopRow: { alignItems: 'flex-start', gap: 8 },
  heroName: { fontSize: 20, lineHeight: 26, fontFamily: font.bold, color: color.onCobalt, letterSpacing: -0.4 },
  heroTotalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  // Wait hero (§3): 48/48/700, −0.04em. Colour from numberInkOnCobalt. See
  // tightLineHeightFor for iOS.
  heroTotalNum: { ...type.waitHero },
  // Units one step down: 16/500 in cobalt-light, sat on the number's baseline.
  heroUnit: { fontSize: 16, lineHeight: 20, fontFamily: font.medium, color: color.cobaltLight, paddingBottom: 4 },
  // The advantage: a callout on the hero in the hero's own inks — it is a
  // comparison, not a severity, so it borrows no status colour.
  heroAdvantage: {
    alignSelf: 'flex-start', backgroundColor: color.surfaceOnCobalt,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4,
  },
  heroAdvantageText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.onCobalt },
  heroSplit: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', columnGap: 12, rowGap: 4,
  },
  heroSplitItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroSplitText: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: color.cobaltLight },
  heroSplitStrong: { color: color.onCobalt },
  heroSplitNote: { fontFamily: font.medium },
  heroApprox: { ...caption, color: color.cobaltLight },
  heroActions: { flexDirection: 'row', gap: 12, marginTop: 4 },

  listHeader: {
    marginTop: space.sectionGap,
    paddingHorizontal: space.gutter,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  listHeaderNote: { ...caption, color: color.muted },

  list: { marginTop: 8, paddingHorizontal: space.gutter, gap: 12 },
  // Crossing card: surface, 1px line, radius 16, padding 14 16 (the pin button
  // brings its own 44pt target to the right edge).
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 12, paddingLeft: space.cardPad, paddingRight: 4,
  },
  // Cards get the inset fill when pressed, not a scale.
  rowPressed: { backgroundColor: color.inset },
  // The card's navigable area; the pin button is its sibling (see PortRow).
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBar: { width: 4, alignSelf: 'stretch', borderRadius: radius.pill },
  rowName: { ...type.cardTitle, color: color.ink },
  rowSub: { ...type.metadata, color: color.muted },
  chipRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  /*
    The track is capped rather than allowed to flex: at 375pt this column is
    ~187px wide, and a 12-booth plaza (Hidalgo) with the detail screen's 8px
    pills would eat all of it and push the count off the card. Capped, the
    pills divide the 92px between them, so a 3-booth crossing draws fat pills
    and a 12-booth one thin ones — the strip always reads as one full plaza,
    which is what makes the fraction legible at a glance.
  */
  boothStrip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boothTrack: { flexDirection: 'row', gap: 2, width: 84 },
  boothPill: { flex: 1, height: 6, borderRadius: radius.pill },
  boothCount: { ...caption, color: color.muted },
  // Right column: the door-to-door total, which is what the list is sorted by.
  rowTotalCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 44 },
  rowTotalNum: { ...type.metric, color: color.inkHero },
  // "m", one step down from its number: 13/500 in muted.
  rowTotalUnit: { fontSize: 13, fontFamily: font.medium, color: color.muted, letterSpacing: 0 },
  rowClosed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowClosedText: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.muted },

  retry: { alignSelf: 'flex-start', marginTop: 4 },
  emptyText: { ...type.body, color: color.muted, paddingVertical: 20, textAlign: 'center' },
  sourceText: { ...caption, color: color.muted },
  sourceStrong: { ...caption, fontFamily: font.semibold, color: color.ink },
  errorText: { ...caption, fontFamily: font.semibold, color: status.heavy.ink },
}));
