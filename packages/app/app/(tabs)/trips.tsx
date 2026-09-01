import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Badge, SectionLabel, SegmentedControl } from '../../src/components/ui';
import { freshnessBadge } from '../../src/freshness-ui';
import {
  DEFAULT_TRAVEL_MODE,
  TRAVEL_MODES,
  travelModeLabel,
  type UiTravelMode,
} from '../../src/modes';
import { rankPorts } from '../../src/ranking';
import { usePorts, useWaits } from '../../src/queries';
import { useAgedWaits } from '../../src/useFreshness';
import { prefs, usePrefs } from '../../src/prefs';
import {
  BUFFER_MINUTES,
  deltaText,
  formatMinutes,
  nowInMinutes,
  solveTrip,
  type PlanMode,
  type TripOption,
} from '../../src/trip';
import { useOrigin } from '../../src/useOrigin';
import { color, font, radius, space, tabular } from '../../src/theme';

/**
 * Trips: "what time do I leave to be across by X."
 *
 * WHAT THIS SCREEN IS ALLOWED TO CLAIM
 *
 * The plan is built from the wait CBP is reporting right now, held constant for
 * the length of the drive, on top of a straight-line drive estimate. Both of
 * those are approximations and both are disclosed on the card — the headline is
 * never presented as a routed, forecast answer.
 *
 * Planning a FUTURE day is not offered. It needs typical waits by day and hour,
 * which needs roughly six weeks of archive we have not collected. The prototype
 * gates future days behind Plus; that would be selling a capability that does
 * not exist, so they are disabled here with the data gap named instead.
 *
 * The stale rule from the handoff applies literally: once the underlying wait
 * goes stale the plan stops recomputing and says so, rather than quietly
 * drifting a leave-by time on numbers nobody is standing behind.
 */

const PLAN_MODES: readonly { value: PlanMode; label: string }[] = [
  { value: 'arrive', label: 'Arrive by' },
  { value: 'leave', label: 'Leave at' },
];

const STEP_MINUTES = 15;

/** Round up to the next quarter hour, then default an hour out. */
function defaultTarget(): number {
  const now = nowInMinutes();
  return Math.ceil((now + 60) / STEP_MINUTES) * STEP_MINUTES;
}

export default function Trips() {
  const insets = useSafeAreaInsets();
  const saved = usePrefs().trip;

  const [stage, setStage] = useState<'setup' | 'plan'>('setup');
  const [planMode, setPlanMode] = useState<PlanMode>('arrive');
  const [mode, setMode] = useState<UiTravelMode>(DEFAULT_TRAVEL_MODE);
  const [target, setTarget] = useState<number>(defaultTarget);

  const origin = useOrigin();
  const ports = usePorts();
  const waits = useWaits();
  // Freshness re-judged against the clock now, so a plan built on old cached
  // waits goes stale on screen — this is what arms the FrozenBanner offline.
  const aged = useAgedWaits(waits);

  const ranked = useMemo(
    () => rankPorts(ports.data?.ports ?? [], aged.data, origin, mode, 'northbound'),
    [ports.data, aged.data, origin, mode],
  );

  const plan = useMemo(
    () => solveTrip(ranked, planMode, target, nowInMinutes()),
    [ranked, planMode, target],
  );

  // Same first-load semantics as the Crossings screen: pending-but-not-paused
  // covers the persister-restore window too, where `isLoading` is still false
  // (fetchStatus 'idle') — otherwise this flashes the "no crossing reporting"
  // sentence before the first response lands.
  const loading = ports.isLoading || (waits.isPending && waits.fetchStatus !== 'paused');
  const loadError = ports.error ?? waits.error;

  return (
    <ScrollView
      style={{ backgroundColor: color.appBg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + space.tabBarClearance,
      }}
    >
      <View style={{ paddingHorizontal: space.gutter }}>
        <Text style={styles.title}>Trips</Text>
        <Text style={styles.subtitle}>
          {stage === 'setup'
            ? 'Pick a time. We work out when to leave and which bridge.'
            : 'Built from the wait reported right now.'}
        </Text>
      </View>

      {saved && stage === 'setup' && <SavedTripCard />}

      {stage === 'setup' ? (
        <>
          <View style={styles.card}>
            <SectionLabel>Starting from</SectionLabel>
            <View style={styles.radioRow}>
              <View style={[styles.radioOuter, { borderColor: color.navy }]}>
                <View style={styles.radioDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioName}>
                  {origin.isFallback ? 'Approximate location' : 'Current location'}
                </Text>
                <Text style={styles.radioSub}>
                  {origin.isFallback
                    ? 'Location permission not granted — using a point central to the valley'
                    : 'GPS at plan time — nothing saved'}
                </Text>
              </View>
            </View>
            <Text style={styles.privacyNote}>
              Used once to build this plan — never uploaded or stored off this device.
            </Text>
          </View>

          <View style={{ paddingHorizontal: space.gutter, marginTop: 10 }}>
            <SegmentedControl options={TRAVEL_MODES} value={mode} onChange={setMode} />
          </View>

          <View style={{ paddingHorizontal: space.gutter, marginTop: 10 }}>
            <SegmentedControl options={PLAN_MODES} value={planMode} onChange={setPlanMode} />
          </View>

          <DayChips />

          <TimeStepper
            label={planMode === 'arrive' ? 'Be across by' : 'Leaving at'}
            target={target}
            onChange={setTarget}
          />

          <Pressable
            style={styles.cta}
            onPress={() => setStage('plan')}
            disabled={!plan}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Build my plan</Text>
          </Pressable>

          {!plan && (
            <Text style={styles.ctaBlocked}>
              {loading
                ? 'Loading crossings…'
                : loadError
                  ? 'Can’t reach the server, so there is nothing to plan against.'
                  : 'No crossing is reporting an open standard lane for this mode right now.'}
            </Text>
          )}

          <Text style={styles.footnote}>
            Uses the wait reported right now, held for the length of the drive. There is no
            forecast yet.
          </Text>
        </>
      ) : plan ? (
        <>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>
                Today · {planMode === 'arrive' ? 'across by' : 'leave at'}{' '}
                {formatMinutes(target)}
              </Text>
              <Text style={styles.summarySub}>
                {travelModeLabel(mode)} · northbound
              </Text>
            </View>
            <Pressable
              onPress={() => setStage('setup')}
              style={styles.editButton}
              accessibilityRole="button"
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>

          {plan.worstFreshness === 'stale' && <FrozenBanner />}

          <PlanCard
            headline={
              plan.planMode === 'arrive'
                ? `Leave by ${formatMinutes(plan.best.leaveMinutes)}`
                : `Across by ${formatMinutes(plan.best.acrossMinutes)}`
            }
            sub={
              plan.planMode === 'arrive'
                ? `with a ${BUFFER_MINUTES}-min buffer`
                : `about ${plan.best.acrossMinutes - plan.best.leaveMinutes} min door-to-door`
            }
            option={plan.best}
            departureHasPassed={plan.departureHasPassed}
            onSave={() =>
              prefs.saveTrip({
                planMode: plan.planMode,
                targetMinutes: plan.targetMinutes,
                mode,
                fromCurrentLocation: !origin.isFallback,
                viaPortId: plan.best.port.id,
                viaName: plan.best.port.displayName,
                leaveMinutes: plan.best.leaveMinutes,
                savedAt: new Date().toISOString(),
              })
            }
            isSaved={saved?.viaPortId === plan.best.port.id && saved.targetMinutes === target}
          />

          {plan.alternatives.length > 0 && (
            <View style={{ paddingHorizontal: space.gutter, marginTop: 18, gap: 8 }}>
              <SectionLabel>Other options</SectionLabel>
              {plan.alternatives.map((alt) => {
                // Same verdict badge as everywhere else — an estimated
                // alternative under a live best must not read as live.
                const altBadge = freshnessBadge(alt.freshness);
                return (
                  <View key={alt.port.id} style={styles.altRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.altName} numberOfLines={1}>
                        {alt.port.displayName}
                      </Text>
                      <Text style={styles.altSub}>
                        {plan.planMode === 'arrive'
                          ? `Leave by ${formatMinutes(alt.leaveMinutes)}`
                          : `Across by ${formatMinutes(alt.acrossMinutes)}`}{' '}
                        · {alt.waitMinutes} min in line
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.altDelta}>
                        {deltaText(alt, plan.best, plan.planMode)}
                      </Text>
                      {altBadge && (
                        <Badge label={altBadge.label} bg={altBadge.bg} fg={altBadge.fg} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.footnote}>
            Drive times are straight-line approximations, not routed ETAs. The line is
            assumed to hold at its current length — we have no forecast yet, so a plan more
            than an hour out is a rough guide.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

/** The saved trip, surfaced on setup so it is not buried behind a rebuild. */
function SavedTripCard() {
  const saved = usePrefs().trip;
  if (!saved) return null;
  return (
    <View style={styles.savedCard}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.savedLabel}>SAVED TRIP</Text>
        <Text style={styles.savedTitle}>
          Leave by {formatMinutes(saved.leaveMinutes)} via {saved.viaName}
        </Text>
        <Text style={styles.savedSub}>
          For {formatMinutes(saved.targetMinutes)} · alerts you {15} min ahead while the app
          is open
        </Text>
      </View>
      <Pressable
        onPress={() => prefs.clearTrip()}
        style={styles.editButton}
        accessibilityRole="button"
      >
        <Text style={styles.editText}>Clear</Text>
      </Pressable>
    </View>
  );
}

/**
 * Future days, rendered and disabled.
 *
 * Shown rather than hidden because the shape of the feature is real and the
 * reason it is off is worth stating: this is a data gap with a known fix
 * (keep collecting), not a missing button.
 */
function DayChips() {
  // Real short weekday names from today's date — a hardcoded Tue–Fri row is
  // wrong six days a week, and a disabled feature still has to tell the truth
  // about which days it is declining to plan.
  const labels = useMemo(() => {
    const out = ['Today'];
    for (let i = 1; i <= 4; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }
    return out;
  }, []);
  return (
    <>
      <View style={styles.dayRow}>
        {labels.map((label, i) => (
          <View
            key={label}
            style={[
              styles.dayChip,
              i === 0
                ? { backgroundColor: color.navyTint, borderColor: color.navy }
                : { backgroundColor: color.card, borderColor: color.border },
            ]}
          >
            <Text
              style={[
                styles.dayText,
                {
                  color: i === 0 ? color.navy : color.tertiary,
                  fontFamily: i === 0 ? font.extrabold : font.semibold,
                },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.dayNote}>
        Planning ahead needs typical waits by day and hour — about six weeks of history we
        haven’t collected yet.
      </Text>
    </>
  );
}

function TimeStepper({
  label,
  target,
  onChange,
}: {
  label: string;
  target: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepperCard}>
      <View style={{ flex: 1, gap: 2 }}>
        <SectionLabel>{label}</SectionLabel>
        <Text style={[styles.stepperTime, tabular]}>{formatMinutes(target)}</Text>
        <Text style={styles.stepperSub}>today</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Pressable
          style={styles.stepButton}
          onPress={() => onChange(target + STEP_MINUTES)}
          accessibilityRole="button"
          accessibilityLabel="Later"
        >
          <Text style={styles.stepGlyph}>▲</Text>
        </Pressable>
        <Pressable
          style={styles.stepButton}
          onPress={() => onChange(target - STEP_MINUTES)}
          accessibilityRole="button"
          accessibilityLabel="Earlier"
        >
          <Text style={styles.stepGlyph}>▼</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The handoff's rule, applied literally: a leave-by time freezes behind a
 * banner rather than drifting on numbers we no longer stand behind.
 */
function FrozenBanner() {
  return (
    <View style={styles.frozen}>
      <Text style={styles.frozenTitle}>Plan frozen — the feed went stale</Text>
      <Text style={styles.frozenBody}>
        The wait behind this plan is older than we’re willing to build advice on. Times
        below are the last we could stand behind, not a live recommendation.
      </Text>
    </View>
  );
}

function PlanCard({
  headline,
  sub,
  option,
  departureHasPassed,
  onSave,
  isSaved,
}: {
  headline: string;
  sub: string;
  option: TripOption;
  departureHasPassed: boolean;
  onSave: () => void;
  isSaved: boolean;
}) {
  const badge = freshnessBadge(option.freshness);
  const steps = [
    { t: formatMinutes(option.leaveMinutes), d: 'set off', dot: color.card, line: true, flex: 3 },
    { t: formatMinutes(option.atBridgeMinutes), d: 'at the bridge', dot: color.goldOnDark, line: true, flex: 3 },
    { t: `~${option.waitMinutes} min`, d: 'in line', dot: color.goldOnDark, line: true, flex: 2 },
    { t: formatMinutes(option.acrossMinutes), d: 'across', dot: '#4CC98A', line: false, flex: 1.4 },
  ];

  return (
    <View style={styles.planCard}>
      <View style={styles.planHead}>
        <Text style={styles.planLabel}>RECOMMENDED</Text>
        <Text style={styles.planVia} numberOfLines={1}>
          via {option.port.displayName}
        </Text>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[styles.planHeadline, tabular]}>{headline}</Text>
        <Text style={styles.planSub}>{sub}</Text>
      </View>

      {departureHasPassed && (
        <View style={styles.passedRow}>
          <Text style={styles.passedText}>
            That departure has already passed. Pick a later time, or expect to arrive after
            your target.
          </Text>
        </View>
      )}

      {badge && (
        <Text style={styles.planStale}>
          {badge.label} · this crossing’s wait is not currently live
        </Text>
      )}

      <View style={styles.timeline}>
        {steps.map((s) => (
          <View key={s.d} style={{ flex: s.flex, gap: 3, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.dot, { backgroundColor: s.dot }]} />
              {s.line && <View style={styles.connector} />}
            </View>
            <Text style={[styles.stepTime, tabular]} numberOfLines={1}>
              {s.t}
            </Text>
            <Text style={styles.stepDesc} numberOfLines={1}>
              {s.d}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.planApprox}>
        {option.driveMinutes} min drive (approx) + {option.waitMinutes} min line as reported
        now
      </Text>

      <Pressable
        style={[styles.saveCta, isSaved && { backgroundColor: color.greenPressed }]}
        onPress={onSave}
        accessibilityRole="button"
      >
        <Text style={styles.saveCtaText}>
          {isSaved ? 'Saved · alerts on while the app is open' : 'Save trip · alert me when to leave'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push(`/port/${option.port.id}`)}
        accessibilityRole="button"
      >
        <Text style={styles.planLink}>See this crossing’s lanes →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontFamily: font.extrabold, color: color.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontFamily: font.regular, color: color.secondary, marginTop: 2 },

  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: radius.button, paddingHorizontal: 13, paddingVertical: 11,
    borderColor: color.navy,
  },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.navy },
  radioName: { fontSize: 13.5, fontFamily: font.bold, color: color.ink },
  radioSub: { fontSize: 11, fontFamily: font.regular, color: color.secondary },
  privacyNote: { fontSize: 10.5, fontFamily: font.regular, color: color.tertiary, lineHeight: 15 },

  dayRow: { flexDirection: 'row', gap: 6, paddingHorizontal: space.gutter, marginTop: 10 },
  dayChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5,
  },
  dayText: { fontSize: 12 },
  dayNote: {
    fontSize: 10.5, fontFamily: font.regular, color: color.tertiary,
    paddingHorizontal: space.gutter, marginTop: 7, textAlign: 'center', lineHeight: 15,
  },

  stepperCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  stepperTime: { fontSize: 22, fontFamily: font.extrabold, color: color.ink },
  stepperSub: { fontSize: 11.5, fontFamily: font.regular, color: color.tertiary },
  stepButton: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: color.chipBg,
    alignItems: 'center', justifyContent: 'center',
  },
  stepGlyph: { fontSize: 9, color: color.navy, fontFamily: font.bold },

  cta: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.green, borderRadius: radius.button,
    paddingVertical: 14, alignItems: 'center',
  },
  ctaText: { fontSize: 14, fontFamily: font.bold, color: color.card },
  ctaBlocked: {
    fontSize: 11.5, fontFamily: font.semibold, color: color.redOnTint,
    paddingHorizontal: space.gutter, marginTop: 8, textAlign: 'center',
  },
  footnote: {
    fontSize: 10.5, fontFamily: font.regular, color: color.tertiary,
    paddingHorizontal: space.gutter, marginTop: 12, lineHeight: 15,
  },

  savedCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.greenTint, borderRadius: radius.card,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  savedLabel: { fontSize: 9.5, fontFamily: font.bold, letterSpacing: 0.8, color: color.green },
  savedTitle: { fontSize: 13.5, fontFamily: font.bold, color: color.ink },
  savedSub: { fontSize: 11, fontFamily: font.regular, color: color.secondary },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: space.gutter, marginTop: space.sectionGap,
  },
  summaryTitle: { fontSize: 13.5, fontFamily: font.bold, color: color.ink },
  summarySub: { fontSize: 11, fontFamily: font.regular, color: color.secondary },
  editButton: {
    backgroundColor: color.chipBg, borderRadius: radius.segmentInner,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  editText: { fontSize: 11, fontFamily: font.bold, color: color.navy },

  frozen: {
    marginHorizontal: space.gutter, marginTop: 12,
    backgroundColor: color.goldBadgeBg, borderRadius: radius.card, padding: 14, gap: 4,
  },
  frozenTitle: { fontSize: 13, fontFamily: font.bold, color: color.goldBadgeText },
  frozenBody: { fontSize: 11.5, fontFamily: font.regular, color: color.goldBadgeText, lineHeight: 16 },

  planCard: {
    marginHorizontal: space.gutter, marginTop: 12,
    backgroundColor: color.navy, borderRadius: radius.cardLg, padding: 16, gap: 12,
  },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  planLabel: { fontSize: 10.5, fontFamily: font.bold, letterSpacing: 1, color: color.navySubtle },
  planVia: { fontSize: 11, fontFamily: font.bold, color: '#CDEDDD', flexShrink: 1 },
  planHeadline: { fontSize: 26, fontFamily: font.extrabold, color: color.card },
  planSub: { fontSize: 13, fontFamily: font.semibold, color: '#B9CCE4' },
  planStale: { fontSize: 10.5, fontFamily: font.semibold, color: color.goldOnDark },
  passedRow: { backgroundColor: 'rgba(192,57,43,.28)', borderRadius: 10, padding: 10 },
  passedText: { fontSize: 11.5, fontFamily: font.semibold, color: '#FFD9D2', lineHeight: 16 },

  timeline: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  connector: { flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,.25)' },
  stepTime: { fontSize: 10, fontFamily: font.bold, color: color.card },
  stepDesc: { fontSize: 9, fontFamily: font.regular, color: color.navySubtle },
  planApprox: { fontSize: 10.5, fontFamily: font.regular, color: color.navySubtle },

  saveCta: {
    backgroundColor: color.green, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  saveCtaText: { fontSize: 13.5, fontFamily: font.bold, color: color.card },
  planLink: { fontSize: 11.5, fontFamily: font.semibold, color: color.navySubtle, textAlign: 'center' },

  altRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: color.card, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.card, padding: space.cardPad,
  },
  altName: { fontSize: 13.5, fontFamily: font.bold, color: color.ink },
  altSub: { fontSize: 11.5, fontFamily: font.regular, color: color.secondary },
  altDelta: { fontSize: 11, fontFamily: font.bold, color: color.navy },
});
