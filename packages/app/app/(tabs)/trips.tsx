import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import type { Direction } from '@otrolado/shared';
import { rankPorts, type RankedPort } from '../../src/ranking';
import { usePorts, useWaits } from '../../src/queries';
import { useAgedWaits } from '../../src/useFreshness';
import { prefs } from '../../src/prefs';
import { useSavedTrip, type SavedTripView } from '../../src/useSavedTrip';
import { LEAVE_LEAD_MINUTES } from '../../src/alerts';
import { formatAge, spokenFreshness } from '../../src/freshness-ui';
import {
  Button,
  FreshnessBadge,
  Notice,
  pressedScale,
  SectionLabel,
  SegmentedControl,
  Skeleton,
} from '../../src/components/ui';
import { AppIcon } from '../../src/components/AppIcon';
import { OriginChip } from '../../src/components/OriginChip';
import {
  BellGlyph,
  CalendarGlyph,
  CarGlyph,
  ClockGlyph,
  MinusGlyph,
  NavigateGlyph,
  PlusGlyph,
  StarGlyph,
  WalkGlyph,
} from '../../src/components/glyphs';
import { openDirections } from '../../src/directions';
import {
  clampToDay,
  formatMinutes,
  laneOf,
  minutesLate,
  nowInMinutes,
  planOptions,
  solveTrip,
  tripLaneLabel,
  tripLaneMode,
  type TripLane,
  type TripOption,
} from '../../src/trip';
import { useOrigin } from '../../src/useOrigin';
import { DIRECTIONS } from '../../src/modes';
import {
  DISPLAY_MAX_FONT_SCALE,
  font,
  radius,
  space,
  tabular,
  waitColor,
} from '../../src/theme';
import { makeStyles, useTheme } from '../../src/useTheme';
import { caption, type } from '../../src/typography';

/**
 * Plan: "I need to be across by X — when do I leave, and which bridge."
 *
 * THE RECOMMENDATION IS THE SCREEN. One card answers the question — which
 * crossing, and the time to leave for it — and the rest of the field sits
 * beneath it as compact alternatives. The previous dense table made every row
 * equally loud, which is the wrong shape for a question that has one answer.
 *
 * BEST IS A LIVE ROW. The recommendation is the first option that is
 * plannable, still ahead, AND live. A recommendation built on a number nobody
 * currently stands behind is not a recommendation, so if every usable option
 * is estimated or stale there is no recommendation at all — the alternatives
 * still render, marked, and the notice says how many.
 *
 * ONE LANE PER PLAN. Travel mode and lane type are separate controls (a
 * vehicle can go Standard, Ready or SENTRI; walking has one lane), but they
 * resolve to a single `TripLane` that EVERY option is solved on. That is what
 * keeps the leave-by times comparable — a SENTRI option beside a general one
 * would be two different questions.
 *
 * NO SAFETY BUFFER, AND NO RANGE. leave-by = target − drive − wait, exactly.
 * The reference layout adds "includes a 10 min safety buffer" and quotes
 * "about 59–69 min"; that interval is a constant added to one number, dressed
 * in the visual language of a measured band. There is no measured spread to
 * draw on until the archive matures, so the screen states the arithmetic it
 * actually did and tells the user to add their own slack.
 *
 * THE CLOCK, NOT THE MOUNT. Tab screens stay mounted, so nothing here may be
 * anchored to when the component first rendered: the quick picks follow the
 * current hour, and on focus a target that has slipped into the past is reset
 * to the default an hour out. Open at 8am, come back at 5pm, and the screen
 * asks about 6pm — not 9am with every option "too late".
 *
 * REMINDERS. Tapping a crossing sets it as the reminder (tap again to clear);
 * `useSavedTrip` re-solves it on every poll and the Alerts tab's
 * time-to-leave rule fires on that, so a nudge is never computed from the
 * figure at save time. The saved trip is always visible in a strip below,
 * regardless of what the screen is currently showing, so a reminder can never
 * be armed and forgotten.
 */

const STEP_MINUTES = 15;
/** Extra touch height above and below the 32pt time picks — see `picks`. */
const PICK_PAD = 6;

/** Travel mode. Cargo is out of scope (see `modes.ts`). */
type PlanMode = 'vehicle' | 'walking';
/** Vehicle lane types. Pedestrians have exactly one lane, so this is hidden for them. */
type PlanLaneType = 'standard' | 'ready' | 'sentri';

const LANE_TYPES: readonly { value: PlanLaneType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ready', label: 'Ready Lane' },
  { value: 'sentri', label: 'SENTRI' },
];

/**
 * The two controls collapse to the one lane the solver understands. Splitting
 * them is a presentation choice — "Vehicle + SENTRI" is how a traveller thinks
 * about it — but the solver must still see a single lane, or the leave-by
 * column stops being comparable.
 */
function toTripLane(mode: PlanMode, laneType: PlanLaneType): TripLane {
  if (mode === 'walking') return 'walking';
  return laneType === 'standard' ? 'general' : laneType;
}

/** Round up to the next quarter hour, then default an hour out. */
function defaultTarget(): number {
  return clampToDay(Math.ceil((nowInMinutes() + 60) / STEP_MINUTES) * STEP_MINUTES);
}

/**
 * Five picks at half-hour steps around the coming hour. Anchored to the clock
 * — recomputed when the hour changes — not to the selection or to mount time,
 * so the pills neither slide under the finger that tapped one nor go stale on
 * a tab that has sat mounted all day.
 */
function quickPicks(nowMinutes: number): readonly number[] {
  const anchor = clampToDay(Math.ceil((nowMinutes + 60) / 60) * 60);
  const picks = [-60, -30, 0, 30, 60].map((d) => anchor + d).filter((t) => t >= 0 && t < 24 * 60);
  return Array.from(new Set(picks));
}

/** "6:00" and "PM" separately, for the two type sizes in the time card. */
function splitClock(minutes: number): { readonly hm: string; readonly ampm: string } {
  const [hm, ampm] = formatMinutes(minutes).split(' ') as [string, string];
  return { hm, ampm };
}

/** "15 min" / "1 hr 20 min" — how long until a departure. */
function formatCountdown(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * One of four sentences per crossing, matching `laneStatusLabel` in ranking.ts:
 *  - plan:   the lane is open with a number; solved.
 *  - closed: CBP says the lane is closed.
 *  - silent: the lane exists but has not reported (update_pending, or open
 *            with no figure).
 *  - none:   this crossing has no such lane (`not_available`, or the ranked
 *            row has no lane in that slot). Not a feed failure — with SENTRI
 *            selected, a bridge without a SENTRI lane must not look like CBP
 *            is down.
 */
type RowState =
  | { readonly kind: 'plan'; readonly option: TripOption; readonly lateBy: number | null }
  | { readonly kind: 'closed' }
  | { readonly kind: 'silent' }
  | { readonly kind: 'none'; readonly laneLabel: string };

interface Row {
  readonly ranked: RankedPort;
  readonly state: RowState;
}

function unplannableState(r: RankedPort, lane: TripLane): RowState {
  const l = laneOf(r, lane);
  // "No such lane" only when CBP says so (N/A → not_available). A missing slot
  // means the crossing has not appeared in the feed for the snapshot window,
  // which is silence, not a statement about what lanes it has.
  if (l === null) return { kind: 'silent' };
  if (l.status === 'not_available') return { kind: 'none', laneLabel: tripLaneLabel(lane) };
  if (l.status === 'closed') return { kind: 'closed' };
  return { kind: 'silent' };
}

export default function Plan() {
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  const styles = useStyles();
  const [target, setTarget] = useState<number>(defaultTarget);
  // Northbound first and default — see DIRECTIONS in modes.ts. There is no
  // southbound feed, so a southbound plan would be arithmetic on invented waits.
  const [direction, setDirection] = useState<Direction>('northbound');
  const [planMode, setPlanMode] = useState<PlanMode>('vehicle');
  const [laneType, setLaneType] = useState<PlanLaneType>('standard');
  const [dayNote, setDayNote] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const lane = toTripLane(planMode, laneType);
  const now = nowInMinutes();
  const nowHour = Math.floor(now / 60);
  const picks = useMemo(() => quickPicks(nowHour * 60), [nowHour]);

  // Runs once per focus (empty deps), not once per stepper tap — snapping the
  // dial back under a finger that is still on it would be worse than the past
  // target it corrects. The functional updater reads the live value.
  useFocusEffect(
    useCallback(() => {
      setTarget((t) => (t < nowInMinutes() ? defaultTarget() : t));
    }, []),
  );

  const origin = useOrigin();
  const ports = usePorts();
  const waits = useWaits();
  // Freshness re-judged against the clock now, so stale options read as stale
  // even when the app has been sitting on cached waits.
  const aged = useAgedWaits(waits);
  const savedView = useSavedTrip();
  const saved = savedView !== null && !savedView.expired ? savedView : null;

  const mode = tripLaneMode(lane);
  const ranked = useMemo(
    () => rankPorts(ports.data?.ports ?? [], aged.data, origin, mode, 'northbound'),
    [ports.data, aged.data, origin, mode],
  );

  const rows = useMemo<Row[]>(() => {
    const plan = solveTrip(ranked, target, lane);
    const solved = plan
      ? planOptions(plan).map<Row>((option) => ({
          ranked: ranked.find((r) => r.port.id === option.port.id)!,
          state: { kind: 'plan', option, lateBy: minutesLate(option, now) },
        }))
      : [];
    const rest = ranked
      .filter((r) => !solved.some((row) => row.ranked === r))
      .map<Row>((r) => ({ ranked: r, state: unplannableState(r, lane) }))
      // Closed and silent lanes are still this lane's story; "no such lane"
      // is not, so it goes last.
      .sort((a, b) => Number(a.state.kind === 'none') - Number(b.state.kind === 'none'));
    return [...solved, ...rest];
  }, [ranked, target, now, lane]);

  // With no waits document there is nothing honest to say per crossing: the
  // bundled port directory means `rows` is never empty, and eleven cards
  // reading "not reporting" would blame CBP for our own missing fetch.
  const noWaits = aged.data === undefined;
  const loading = noWaits && waits.isPending && waits.fetchStatus !== 'paused';
  const offline = noWaits && waits.fetchStatus === 'paused';
  const loadError = ports.error ?? waits.error;

  const plannable = rows.flatMap((r) => (r.state.kind === 'plan' ? [r.state.option] : []));
  const nonLiveCount = plannable.filter((o) => o.freshness !== 'live').length;
  const allStale = plannable.length > 0 && plannable.every((o) => o.freshness === 'stale');

  // The recommendation: plannable, still ahead, and live.
  const bestIndex = rows.findIndex(
    (r) => r.state.kind === 'plan' && r.state.lateBy === null && r.state.option.freshness === 'live',
  );
  const best = bestIndex >= 0 ? rows[bestIndex] : null;
  const others = rows.filter((_, i) => i !== bestIndex);

  const reminderFor = (row: Row): boolean =>
    saved !== null &&
    saved.trip.viaPortId === row.ranked.port.id &&
    saved.trip.targetMinutes === target &&
    saved.trip.lane === lane;

  const toggleReminder = (row: Row): void => {
    if (row.state.kind !== 'plan') return;
    if (reminderFor(row)) {
      prefs.clearTrip();
      return;
    }
    prefs.saveTrip({
      targetMinutes: target,
      lane,
      viaPortId: row.ranked.port.id,
      viaName: row.ranked.port.displayName,
      savedAt: new Date().toISOString(),
    });
  };

  const { hm, ampm } = splitClock(target);

  return (
    <ScrollView
      style={{ backgroundColor: color.page }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: space.tabBarClearance,
      }}
    >
      {/* Wraps the chip under the lockup when the two cannot share the line — see Home. */}
      <View style={styles.header}>
        <View style={styles.lockup}>
          {/* The official icon, a step smaller than Crossings' — Plan's
              lockup is secondary to the screen title under it. */}
          <AppIcon size={36} />
          <View>
            <Text style={styles.wordmark}>otrolado</Text>
            <Text style={styles.tagline} numberOfLines={1}>
              A faster way across
            </Text>
          </View>
        </View>
        <OriginChip origin={origin} />
      </View>

      <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap, gap: 2 }}>
        <Text style={styles.title}>Plan a trip</Text>
        <Text style={styles.subtitle}>Know when to leave. Arrive on time.</Text>
      </View>

      <View style={styles.controls}>
        <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} />
      </View>

      {direction === 'southbound' ? (
        <Notice title="No official data heading south" style={styles.block}>
          Mexico publishes no federal wait-time feed, so there is no wait to subtract from
          your arrival time. A leave-by for a southbound trip would be arithmetic on a
          number we invented.
        </Notice>
      ) : (
        <>
          {/*
            The day row. Deliberately NOT a dropdown: a chevron promises a menu
            of days, and there is only one. Tomorrow needs typical waits by
            hour, which needs history still being collected — so the row states
            that inline rather than opening a picker with a disabled item, and
            it is never gated behind a payment for a capability that does not
            exist.
          */}
          <Pressable
            style={({ pressed }) => [styles.dayCard, pressed && styles.cardPressed]}
            onPress={() => setDayNote((o) => !o)}
            role="button"
            aria-expanded={dayNote}
            accessibilityHint="Why only today is available"
          >
            <CalendarGlyph size={20} color={color.accent} />
            <Text style={styles.dayText}>Today</Text>
            <Text style={styles.dayNoteInline}>only day available</Text>
          </Pressable>
          {dayNote && (
            <Text style={styles.dayNote}>
              A plan for tomorrow needs typical waits by hour — about six weeks of history
              we’re still collecting. Rather than guess one, the app plans today only.
            </Text>
          )}

          {/* Time card */}
          <View style={styles.timeCard}>
            <Text style={styles.eyebrow}>I need to be across by</Text>
            <View style={styles.controlRow}>
              <StepButton
                onPress={() => setTarget((t) => clampToDay(t - STEP_MINUTES))}
                accessibilityLabel="15 minutes earlier"
              >
                <MinusGlyph size={22} color={color.ink} />
              </StepButton>
              <View style={styles.clock}>
                <Text style={[styles.clockTime, tabular]} maxFontSizeMultiplier={DISPLAY_MAX_FONT_SCALE}>
                  {hm}
                </Text>
                <Text style={styles.clockAmPm}>{ampm}</Text>
              </View>
              <StepButton
                onPress={() => setTarget((t) => clampToDay(t + STEP_MINUTES))}
                accessibilityLabel="15 minutes later"
              >
                <PlusGlyph size={22} color={color.ink} />
              </StepButton>
            </View>
            <View style={styles.picks}>
              {picks.map((t) => {
                const on = t === target;
                return (
                  <Pressable
                    key={t}
                    style={({ pressed }) => [
                      styles.pick,
                      on && styles.pickOn,
                      pressed && (on ? styles.pickOnPressed : styles.pickPressed),
                    ]}
                    onPress={() => setTarget(t)}
                    // 32pt pills, 6pt apart: grow to 44 vertically (the row is
                    // padded to hold it — iOS clips slop at the parent's edge),
                    // and only half the gap sideways, so neighbours never overlap.
                    hitSlop={{ top: PICK_PAD, bottom: PICK_PAD, left: 3, right: 3 }}
                    role="button"
                    aria-selected={on}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn, tabular]}>
                      {splitClock(t).hm}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Travel mode and lane type, as two labelled controls. Selected is
              the `selectedFill` every toggled control in the app shares. */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Travel mode</Text>
            <View style={styles.buttonRow}>
              <Button
                variant="tertiary"
                label="Vehicle"
                grow
                selected={planMode === 'vehicle'}
                onPress={() => setPlanMode('vehicle')}
                icon={(c) => <CarGlyph size={17} color={c} />}
              />
              <Button
                variant="tertiary"
                label="Walking"
                grow
                selected={planMode === 'walking'}
                onPress={() => setPlanMode('walking')}
                icon={(c) => <WalkGlyph size={17} color={c} />}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Lane type</Text>
            {planMode === 'walking' ? (
              // Not a disabled row of chips: CBP publishes one pedestrian lane,
              // so there is no choice being withheld — there is no choice.
              <Text style={styles.fieldNote}>
                Pedestrian crossings have a single lane. Ready Lane and SENTRI are vehicle
                programmes.
              </Text>
            ) : (
              <View style={styles.buttonRow}>
                {LANE_TYPES.map((l) => (
                  <Button
                    key={l.value}
                    variant="tertiary"
                    label={l.label}
                    grow
                    selected={laneType === l.value}
                    onPress={() => setLaneType(l.value)}
                  />
                ))}
              </View>
            )}
          </View>

          {noWaits || rows.length === 0 ? (
            loading ? (
              <View style={styles.otherList} accessible role="progressbar" aria-label="Loading crossings">
                <Skeleton width="100%" height={168} round={radius.card} />
                <Skeleton width="100%" height={76} round={radius.card} />
                <Skeleton width="100%" height={76} round={radius.card} />
              </View>
            ) : (
              <Text style={styles.empty}>
                {offline
                  ? 'Offline with nothing cached — there is nothing to plan against.'
                  : loadError || noWaits
                    ? 'Can’t reach the server, so there is nothing to plan against.'
                    : 'No crossing offers this lane right now.'}
              </Text>
            )
          ) : (
            <>
              {best ? (
                <RecommendedCard
                  row={best}
                  now={now}
                  reminder={reminderFor(best)}
                  onToggleReminder={() => toggleReminder(best)}
                />
              ) : (
                <NoRecommendation
                  hasPlannable={plannable.length > 0}
                  allStale={allStale}
                />
              )}

              {/* A non-live option is non-live because OUR data has aged
                  (options exist only when CBP says the lane is open), so the
                  copy owns that rather than blaming the crossing. */}
              {nonLiveCount > 0 && (
                <Text style={styles.notice} role="alert">
                  {nonLiveCount === 1
                    ? '1 leave-by time isn’t live · marked ~'
                    : `${nonLiveCount} leave-by times aren’t live · marked ~`}
                </Text>
              )}

              {others.length > 0 && (
                <SectionLabel style={styles.sectionLabel}>Other crossings</SectionLabel>
              )}
              <View style={styles.otherList}>
                {others.map((row) => (
                  <AlternativeCard
                    key={row.ranked.port.id}
                    row={row}
                    laneLabel={tripLaneLabel(lane)}
                    reminder={reminderFor(row)}
                    onPress={() => toggleReminder(row)}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {saved && <ReminderStrip view={saved} onClear={() => prefs.clearTrip()} />}

      {howOpen && (
        <View style={styles.how}>
          <Text style={styles.howText}>
            <Text style={styles.howLead}>Leave by = your time − drive − wait. </Text>
            The wait is what CBP reports right now for the chosen lane (times marked ~ use the
            last figure we have), held for the length of the drive — there is no forecast yet,
            so a plan more than an hour out is a rough guide. No slack is added; add your own.
          </Text>
          <Text style={styles.howText}>
            <Text style={styles.howLead}>Drive times are straight-line, </Text>
            not routed — they ignore roads, bridges and traffic.{' '}
            {origin.isFallback
              ? 'No starting point is set, so a point central to the valley stands in — tap the chip above to set one.'
              : origin.source === 'chosen'
                ? 'Measured from the town you picked.'
                : 'Your location is read from the phone when the plan is built and never leaves it.'}
          </Text>
          <Text style={styles.howText}>
            <Text style={styles.howLead}>Tap a crossing </Text>
            to be nudged {LEAVE_LEAD_MINUTES} min before its leave-by while the app is open. Tap
            again to clear.
          </Text>
        </View>
      )}

      <View style={styles.footnote}>
        {/* Every number's age, the origin's provenance and the drive's
            approximation, in that order — none of the three drops out when
            another is bad. */}
        <Text style={[styles.footText, tabular]}>
          {[
            allStale
              ? 'Feed stale — last times we could stand behind'
              : aged.data
                ? `Feed checked ${formatAge(aged.data.ingestAgeSeconds)}`
                : null,
            origin.isFallback
              ? 'from an unset starting point'
              : origin.source === 'gps' && !origin.near
                ? 'from your location'
                : `from ${origin.label}`,
            'drive times approx.',
          ]
            .filter((part): part is string => part !== null)
            .join(' · ')}
        </Text>
        <Pressable
          onPress={() => setHowOpen((o) => !o)}
          role="button"
          aria-expanded={howOpen}
          hitSlop={{ left: 8, right: 8 }}
          style={styles.inlineLink}
        >
          {({ pressed }) => (
            <Text style={[styles.footLink, pressed && styles.footLinkPressed]}>How this works</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** The ±15 min stepper: a 44pt tertiary circle. Pressed, the border goes `ink`. */
function StepButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed, pressedScale(pressed)]}
      onPress={onPress}
      role="button"
      aria-label={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

/**
 * The recommendation. One crossing, one departure time, and the two numbers
 * that produced it.
 *
 * "About N min total" carries the same hedge as the Crossings hero and for the
 * same reason: half the total is a straight-line drive estimate. What it does
 * NOT carry is a range, because there is no measured spread to quote — see the
 * module comment.
 */
function RecommendedCard({
  row,
  now,
  reminder,
  onToggleReminder,
}: {
  row: Row;
  now: number;
  reminder: boolean;
  onToggleReminder: () => void;
}) {
  const { color, status } = useTheme();
  const styles = useStyles();
  if (row.state.kind !== 'plan') return null;
  const { option } = row.state;
  const { lat, lng } = row.ranked.port;
  const until = option.leaveMinutes - now;
  const total = option.driveMinutes + option.waitMinutes;

  return (
    <View style={styles.recCard}>
      <View style={styles.recBar} />
      <View style={{ flex: 1, gap: 10 }}>
        <View style={styles.recHead}>
          <StarGlyph size={15} color={status.clear.ink} strokeWidth={2.2} />
          <Text style={[type.eyebrow, { color: status.clear.ink }]}>Recommended</Text>
        </View>
        <Text style={styles.recName}>{row.ranked.port.displayName}</Text>

        {/* The answer, at metric size: the time to leave. */}
        <View style={styles.recLeaveRow}>
          <ClockGlyph size={20} color={color.accent} />
          <Text style={styles.recLeaveLabel}>Leave by</Text>
          <Text style={[styles.recLeave, tabular]} maxFontSizeMultiplier={DISPLAY_MAX_FONT_SCALE}>
            {formatMinutes(option.leaveMinutes)}
          </Text>
        </View>
        <View style={styles.recCountdown}>
          <Text style={[styles.recCountdownText, tabular]}>
            {until <= 0 ? 'Leave now' : `Leave in ${formatCountdown(until)}`}
          </Text>
        </View>

        <View style={{ gap: 2 }}>
          <Text style={[styles.recTotal, tabular]}>About {total} min total</Text>
          <Text style={[styles.recSplit, tabular]}>
            {option.driveMinutes} min drive · approx +{' '}
            {/* On the green card: `ink`, not a status text ink — those are for
                WHITE, and moderate/heavy on this tint fall under 4.5:1. */}
            <Text style={{ color: color.ink, fontFamily: font.semibold }}>
              {option.waitMinutes} min border
            </Text>
          </Text>
        </View>

        <View style={styles.recActions}>
          {lat !== null && lng !== null && (
            <Button
              label="Navigate"
              size="sm"
              grow
              icon={(c) => <NavigateGlyph size={16} color={c} />}
              onPress={() => openDirections({ lat, lng })}
              accessibilityLabel={`Navigate to ${row.ranked.port.displayName}`}
            />
          )}
          <Button
            variant="tertiary"
            label={reminder ? 'Reminder on' : 'Remind me'}
            size="sm"
            grow
            selected={reminder}
            icon={(c) => <BellGlyph size={16} color={c} />}
            onPress={onToggleReminder}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * There is no recommendation. Two different reasons, two different sentences —
 * "nothing can be planned" and "nothing is live enough to recommend" are not
 * the same problem and would be fixed differently.
 */
function NoRecommendation({
  hasPlannable,
  allStale,
}: {
  hasPlannable: boolean;
  allStale: boolean;
}) {
  const styles = useStyles();
  return (
    <Notice
      title={hasPlannable ? 'No recommendation right now' : 'Nothing to plan through'}
      style={styles.block}
    >
        {!hasPlannable
          ? 'No crossing has this lane open with a reported wait, so there is no departure time to compute.'
          : allStale
            ? 'Every leave-by below rests on a stale reading. They are listed and marked, but none is current enough to recommend.'
            : 'Every option is either not live or already past its departure. They are listed below with what is wrong.'}
    </Notice>
  );
}

/**
 * An alternative crossing. Three states, and the late one is the point:
 * "too late" told a user their plan failed without telling them by how much,
 * and six minutes late is a different decision from ninety.
 *
 * A row with no answer (closed, silent, no such lane) is not pressable and
 * says so in ink, not opacity: its name steps down to `muted` and its bar to
 * `lineStrong`, while the verdict keeps full weight — the verdict is the
 * information.
 */
function AlternativeCard({
  row,
  laneLabel,
  reminder,
  onPress,
}: {
  row: Row;
  /** The lane the whole plan is solved on — what a closure is a closure OF. */
  laneLabel: string;
  reminder: boolean;
  onPress: () => void;
}) {
  const { color, status } = useTheme();
  const styles = useStyles();
  const { ranked, state } = row;
  const plannable = state.kind === 'plan';
  const live = state.kind === 'plan' && state.option.freshness === 'live';
  const late = state.kind === 'plan' ? state.lateBy : null;

  const total =
    state.kind === 'plan' ? state.option.driveMinutes + state.option.waitMinutes : null;

  let verdict: string;
  // Explicitly typed: inference from the first assignment would pin the union
  // to that one style's literal colour and reject the other three.
  let verdictStyle: StyleProp<TextStyle> = styles.altVerdict;
  if (state.kind === 'closed') {
    verdict = `${laneLabel} lane closed`;
    verdictStyle = styles.altVerdictBad;
  } else if (state.kind === 'silent') {
    verdict = 'Not reporting a wait';
    verdictStyle = styles.altVerdictMuted;
  } else if (state.kind === 'none') {
    verdict = `No ${state.laneLabel} lane here`;
    verdictStyle = styles.altVerdictMuted;
  } else if (late !== null) {
    // The honest arithmetic: leaving now, holding this wait, you land this
    // far past the target. Hedged, because both inputs are approximations.
    verdict = `Leave now · about ${late} min late`;
    verdictStyle = styles.altVerdictLate;
  } else {
    verdict = `Leave by ${live ? '' : '~'}${formatMinutes(state.option.leaveMinutes)}`;
  }

  return (
    <Pressable
      // `plannable` guard: a disabled row must not look pressable.
      style={({ pressed }) => [styles.altCard, pressed && plannable && styles.cardPressed]}
      onPress={onPress}
      disabled={!plannable}
      role="button"
      aria-selected={reminder}
      aria-disabled={!plannable}
      // "~" is a glyph for the eye; the ear gets the word, and the verdict.
      aria-label={`${ranked.port.displayName}. ${verdict.replace('~', 'about ')}${
        state.kind === 'plan' && !live ? `, ${spokenFreshness(state.option.freshness)}` : ''
      }${reminder ? '. Reminder set' : ''}`}
    >
      <View
        style={[
          styles.altBar,
          {
            backgroundColor:
              state.kind === 'closed'
                ? color.line
                : late !== null
                  ? status.moderate.dot
                  : plannable && live
                    ? waitColor(state.option.waitMinutes)
                    : color.lineStrong,
          },
        ]}
      />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={styles.altNameRow}>
          <Text style={[styles.altName, !plannable && { color: color.muted }]} numberOfLines={1}>
            {ranked.port.displayName}
          </Text>
          {state.kind === 'plan' && <FreshnessBadge freshness={state.option.freshness} />}
        </View>
        {total !== null ? (
          <Text style={[styles.altTotal, tabular]}>
            About {total} min total · {ranked.drive.minutes} min drive
          </Text>
        ) : (
          <Text style={[styles.altTotal, tabular]}>{ranked.drive.minutes} min drive</Text>
        )}
        <Text style={[verdictStyle, tabular]}>
          {verdict}
          {reminder && <Text style={styles.altReminder}> · reminder set</Text>}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The saved trip, always visible while it is for today. States, in the order
 * they are checked: still loading → cannot be planned through → departure has
 * passed → a leave-by (marked ~ when the figure behind it is not live).
 */
function ReminderStrip({ view, onClear }: { view: SavedTripView; onClear: () => void }) {
  const { color } = useTheme();
  const styles = useStyles();
  const { trip, status: tripStatus } = view;
  const via = tripStatus?.via ?? null;
  const laneName = tripLaneLabel(trip.lane);

  let verdict: string;
  if (tripStatus === null) verdict = 'checking the line…';
  else if (via === null) verdict = `can’t be updated — no open ${laneName} lane reported`;
  else if (tripStatus.departureHasPassed) verdict = 'departure has passed';
  // Estimated and stale stay distinct here as they do on the badges — a stale
  // figure must never read as merely approximate.
  else if (via.freshness === 'live') verdict = `leave by ${formatMinutes(via.leaveMinutes)}`;
  else verdict = `leave by ~${formatMinutes(via.leaveMinutes)} (${via.freshness})`;

  return (
    <View style={styles.reminder}>
      <Text style={[styles.reminderText, tabular]}>
        <Text style={styles.reminderStrong}>Reminder</Text>
        {` · ${trip.viaName} · across by ${formatMinutes(trip.targetMinutes)} · ${laneName} — `}
        <Text style={via !== null && !tripStatus?.departureHasPassed ? styles.reminderStrong : undefined}>
          {verdict}
        </Text>
      </Text>
      <Pressable
        onPress={onClear}
        style={({ pressed }) => [styles.inlineLink, pressedScale(pressed)]}
        role="button"
        aria-label="Clear reminder"
        hitSlop={{ left: 8, right: 8 }}
      >
        {({ pressed }) => (
          <Text style={[styles.reminderClear, pressed && { color: color.accentPressed }]}>Clear</Text>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ color, status }) => ({
  header: {
    paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignItems: 'center', columnGap: 12, rowGap: 10,
  },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 19, lineHeight: 23, fontFamily: font.bold, color: color.ink, letterSpacing: -0.8 },
  tagline: { fontSize: 12, lineHeight: 16, fontFamily: font.regular, color: color.muted },

  title: { ...type.screenTitle, color: color.ink },
  subtitle: { ...type.body, color: color.muted },

  controls: { paddingHorizontal: space.gutter, marginTop: space.sectionGap },

  dayCard: {
    marginHorizontal: space.gutter, marginTop: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: space.cardPad,
  },
  // Shared by the day row and the alternative cards: surface → inset.
  cardPressed: { backgroundColor: color.inset },
  dayText: { flex: 1, ...type.cardTitle, color: color.ink },
  dayNoteInline: { ...type.metadata, color: color.muted },
  dayNote: {
    fontSize: 12, lineHeight: 17, fontFamily: font.regular, color: color.muted,
    paddingHorizontal: space.gutter, marginTop: 8,
  },

  timeCard: {
    marginTop: 12, marginHorizontal: space.gutter,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, padding: space.cardPad, gap: 12,
  },
  eyebrow: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: color.ink, textAlign: 'center' },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // A tertiary circle at the 44pt hit floor.
  stepBtn: {
    width: space.hitMin, height: space.hitMin, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: color.lineStrong, backgroundColor: color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnPressed: { borderColor: color.ink, backgroundColor: color.inset },
  clock: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  // The wait-hero token, in `accent`: this is the one number the user sets.
  clockTime: { ...type.waitHero, color: color.accent },
  // Unit weight: 500, one step down from its number (v2 §03).
  clockAmPm: { fontSize: 16, lineHeight: 20, fontFamily: font.medium, color: color.muted, paddingBottom: 5 },
  // Padded by PICK_PAD to hold the pills' 44pt touch height, pulled back by
  // the same so the layout is unchanged.
  picks: {
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    paddingVertical: PICK_PAD, marginVertical: -PICK_PAD,
  },
  pick: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.inset },
  pickOn: { backgroundColor: color.selectedFill },
  // The off pill is already inset, so it steps to line — the next shade in the
  // same family.
  pickPressed: { backgroundColor: color.line },
  pickOnPressed: { backgroundColor: color.selectedFillPressed },
  pickText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.muted },
  pickTextOn: { color: color.onSelected },

  field: { paddingHorizontal: space.gutter, marginTop: space.sectionGap, gap: 8 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.ink },
  fieldNote: { ...type.metadata, fontFamily: font.regular, color: color.muted },
  buttonRow: { flexDirection: 'row', gap: 8 },

  // Recommendation: a green-tinted card with a status rail, so it reads as
  // the answer without becoming a second cobalt surface.
  recCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    flexDirection: 'row', gap: 12,
    backgroundColor: status.clear.tint, borderRadius: radius.card,
    padding: space.cardPad,
  },
  recBar: { width: 4, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: status.clear.dot },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recName: { fontSize: 18, lineHeight: 24, fontFamily: font.bold, color: color.ink, letterSpacing: -0.36 },
  recLeaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recLeaveLabel: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.ink },
  recLeave: { ...type.metric, color: color.accent },
  recCountdown: {
    alignSelf: 'flex-start', backgroundColor: color.surface,
    // On a tint: the edge only draws in dark — see `surfaceEdge`.
    borderWidth: 1, borderColor: color.surfaceEdge,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5,
  },
  recCountdownText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: status.clear.ink },
  recTotal: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.ink },
  // On the green tint `muted` is 4.4:1; the tint's own ink is 7.4:1.
  recSplit: { ...type.metadata, color: status.clear.ink },
  recActions: { flexDirection: 'row', gap: 8, marginTop: 2 },

  notice: {
    marginHorizontal: space.gutter, marginTop: 12,
    fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: status.moderate.ink,
    backgroundColor: status.moderate.tint, borderRadius: radius.pill,
    paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start',
  },

  sectionLabel: { paddingHorizontal: space.gutter, marginTop: space.sectionGap },
  otherList: { marginTop: 8, paddingHorizontal: space.gutter, gap: 8 },
  altCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: space.cardPad,
  },
  altBar: { width: 4, alignSelf: 'stretch', borderRadius: radius.pill },
  altNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altName: { ...type.cardTitle, color: color.ink, flexShrink: 1 },
  altTotal: { ...type.metadata, color: color.muted },
  altVerdict: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: color.ink },
  // Status as TEXT on white takes the status `text` ink, never the dot colour.
  altVerdictLate: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: status.moderate.text },
  altVerdictBad: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: status.heavy.text },
  altVerdictMuted: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: color.muted },
  altReminder: { fontFamily: font.semibold, color: color.accent },

  empty: {
    fontSize: 13, lineHeight: 19, fontFamily: font.semibold, color: color.muted,
    paddingHorizontal: space.gutter, paddingVertical: 24, textAlign: 'center',
  },

  block: { marginHorizontal: space.gutter, marginTop: space.sectionGap },

  reminder: {
    paddingTop: space.sectionGap, paddingHorizontal: space.gutter,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  reminderText: { ...caption, color: color.muted, flexShrink: 1 },
  reminderStrong: { fontFamily: font.semibold, color: color.ink },
  reminderClear: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.accent },

  how: { paddingHorizontal: space.gutter, paddingTop: 12, gap: 6 },
  howText: { fontSize: 12, lineHeight: 17, fontFamily: font.regular, color: color.muted },
  howLead: { fontFamily: font.semibold, color: color.ink },

  footnote: {
    paddingTop: 12, paddingHorizontal: space.gutter,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  footText: { ...caption, color: color.muted, flexShrink: 1 },
  footLink: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.accent },
  footLinkPressed: { color: color.accentPressed },
  // A text link's 44pt touch height, held by its own padding and given back
  // with a negative margin: the frame overflows the row, so iOS hit-tests it
  // (hitSlop past the parent's bounds it would clip).
  inlineLink: { paddingVertical: 14, marginVertical: -14, justifyContent: 'center' },
}));
