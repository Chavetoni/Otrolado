import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pressedScale, SectionLabel, Toggle } from '../../src/components/ui';
import {
  ArrowDownGlyph,
  ArrowUpGlyph,
  BellGlyph,
  ChevronRightGlyph,
  ClockGlyph,
  LockGlyph,
  WarningGlyph,
} from '../../src/components/glyphs';
import { formatAge, formatClock } from '../../src/freshness-ui';
import { ALERT_RULES, type AlertRuleId } from '../../src/alerts';
import { prefs, usePrefs } from '../../src/prefs';
import { usePorts, useWaits } from '../../src/queries';
import { formatMinutes, tripLaneLabel } from '../../src/trip';
import { useAgedWaits } from '../../src/useFreshness';
import { useSavedTrip, type SavedTripView } from '../../src/useSavedTrip';
import { color, font, radius, space, status, tabular } from '../../src/theme';
import { caption, type } from '../../src/typography';

/**
 * Alerts: rules, what they watch, and what has fired.
 *
 * WHAT AN ALERT IS HERE
 *
 * Foreground only. There is no account to hang a rule on and no push queue to
 * deliver from, so the app evaluates these rules itself against each feed poll
 * (see `useAlertWatch`, mounted in the tabs layout so it keeps running on every
 * tab) and lists hits below. Your phone will not buzz.
 *
 * That limit is stated at the TOP of the screen, in the same weight as the
 * feature itself. The reference layout puts a green "Push notifications on"
 * banner in this slot; there is no push, so a green tick there would promise
 * delivery that cannot happen — and silent non-delivery, a user who believes
 * they will be told and is not, is the characteristic failure of an alerts
 * product. The banner states the real state and can be expanded for why.
 *
 * A rule that cannot be evaluated at all would be shown disabled with the
 * reason rather than as a switch that moves and does nothing. As of the
 * "another crossing is faster" rule replacing `reroute`, all four run.
 */
function eventClock(at: string): string {
  const d = new Date(at);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? formatClock(at) : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${formatClock(at)}`;
}

/**
 * One icon per rule, from the family, so the list scans without reading four
 * titles: falling for "another crossing is faster", a clock for time to
 * leave, a lock for closure, rising for a spike.
 */
function RuleIcon({ id }: { id: AlertRuleId }) {
  const tint = color.cobalt;
  return (
    <View style={styles.ruleIcon}>
      {id === 'faster' ? (
        <ArrowDownGlyph size={20} color={tint} />
      ) : id === 'time_to_leave' ? (
        <ClockGlyph size={20} color={tint} />
      ) : id === 'closure' ? (
        <LockGlyph size={20} color={tint} />
      ) : (
        <ArrowUpGlyph size={20} color={tint} />
      )}
    </View>
  );
}

/** Activity icons follow the event's tone, not its rule. */
function EventIcon({ tone }: { tone: 'good' | 'bad' | 'warn' }) {
  const tint =
    tone === 'good' ? status.clear.ink : tone === 'bad' ? status.heavy.ink : status.moderate.ink;
  const bg =
    tone === 'good' ? status.clear.tint : tone === 'bad' ? status.heavy.tint : status.moderate.tint;
  return (
    <View style={[styles.eventIcon, { backgroundColor: bg }]}>
      {tone === 'good' ? (
        <ArrowDownGlyph size={18} color={tint} />
      ) : tone === 'bad' ? (
        <WarningGlyph size={18} color={tint} />
      ) : (
        <ClockGlyph size={18} color={tint} />
      )}
    </View>
  );
}

export default function Alerts() {
  const insets = useSafeAreaInsets();
  const { rules, watchlist, activity } = usePrefs();
  const ports = usePorts();
  const waits = useWaits();
  // "Feed checked X ago" must keep counting while the app sits open offline —
  // the server's ingestAgeSeconds is frozen at fetch time.
  const aged = useAgedWaits(waits);
  // The same re-solved view the watcher fires from, so the rule row can never
  // claim a nudge the watcher is not actually going to produce.
  const savedTrip = useSavedTrip();

  const [limitOpen, setLimitOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  /** Only crossings in scope can be watched — the same filter the list uses. */
  const watchable = useMemo(
    () => (ports.data?.ports ?? []).filter((p) => p.routable && p.lat !== null),
    [ports.data],
  );
  const watched = useMemo(
    () => watchable.filter((p) => watchlist.includes(p.id)),
    [watchable, watchlist],
  );

  return (
    <ScrollView
      style={{ backgroundColor: color.mist }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: space.tabBarClearance,
      }}
    >
      <View style={{ paddingHorizontal: space.gutter, gap: 2 }}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>Get notified when it matters.</Text>
      </View>

      {/*
        The delivery banner. Where the reference layout puts a green "Push
        notifications on", this states what is actually true. Amber, not red:
        it is a capability limit, not a fault — and not green, because green
        here would read as "you're covered".
      */}
      <Pressable
        // Pressed: the scale, never a darker amber — a status tint is not
        // touch feedback.
        style={({ pressed }) => [styles.limitCard, pressedScale(pressed)]}
        onPress={() => setLimitOpen((o) => !o)}
        role="button"
        aria-expanded={limitOpen}
      >
        <BellGlyph size={20} color={status.moderate.ink} />
        <Text style={styles.limitTitle}>Alerts only run while the app is open</Text>
        <View style={limitOpen && styles.chevronOpen}>
          <ChevronRightGlyph size={18} color={status.moderate.ink} />
        </View>
      </Pressable>
      {limitOpen && (
        <Text style={styles.limitBody}>
          Rules are evaluated on this phone against each feed poll, not on a server, so
          nothing arrives while Otrolado is closed. Push notifications need an account to
          attach rules to and a delivery queue to send them from — neither exists yet, and
          we would rather say so than show a switch that quietly delivers nothing.
        </Text>
      )}

      {/* Watchlist summary, with the full picker behind "Manage". */}
      <View style={styles.watchCard}>
        <View style={styles.watchHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: color.infoInk }]}>Watching</Text>
            <Text style={[styles.watchCount, tabular]}>
              {watched.length === 1 ? '1 crossing' : `${watched.length} crossings`}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.manageBtn, pressed && styles.manageBtnPressed, pressedScale(pressed)]}
            onPress={() => setManageOpen((o) => !o)}
            role="button"
            aria-expanded={manageOpen}
          >
            <Text style={styles.manageText}>{manageOpen ? 'Done' : 'Manage'}</Text>
          </Pressable>
        </View>

        {manageOpen ? (
          watchable.length === 0 ? (
            <Text style={styles.helpText}>
              {ports.isPlaceholderData && ports.fetchStatus === 'fetching'
                ? 'Loading crossings…'
                : 'Can’t reach the server.'}
            </Text>
          ) : (
            <>
              <Text style={styles.helpText}>
                Spike and closure alerts only fire for these. Watching all eleven would be
                noise.
              </Text>
              <View style={styles.chipWrap}>
                {watchable.map((p) => {
                  const on = watchlist.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => prefs.toggleWatch(p.id)}
                      role="checkbox"
                      aria-checked={on}
                      style={({ pressed }) => [
                        on ? styles.watchChipOn : styles.watchChipOff,
                        pressed && (on ? styles.watchChipOnPressed : styles.watchChipOffPressed),
                      ]}
                    >
                      <Text
                        style={[
                          styles.watchChipText,
                          { color: on ? color.surface : color.muted },
                        ]}
                      >
                        {p.displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )
        ) : watched.length === 0 ? (
          <Text style={styles.helpText}>
            None yet — tap Manage, or use Watch on a crossing.
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            {watched.map((p) => (
              <View key={p.id} style={styles.watchChipQuiet}>
                <Text style={styles.watchChipQuietText}>{p.displayName}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <SectionLabel style={styles.sectionLabel}>Alert rules</SectionLabel>
      <View style={styles.rulesCard}>
        {ALERT_RULES.map((rule, i) => (
          <View
            key={rule.id}
            style={[styles.ruleRow, i < ALERT_RULES.length - 1 && styles.ruleDivider]}
          >
            <RuleIcon id={rule.id} />
            <View style={{ flex: 1, gap: 2 }}>
              {/* An unavailable rule reads in the disabled ink — never opacity. */}
              <Text style={[styles.ruleName, !rule.available && { color: color.inkMuted }]}>
                {rule.name}
              </Text>
              <Text style={styles.ruleDesc}>{rule.desc}</Text>
              {rule.blockedReason && (
                <Text style={styles.ruleBlocked}>{rule.blockedReason}</Text>
              )}
              {/* Both trip-shaped rules say what they are actually armed on;
                  a toggle that is ON with no trip behind it is the "switch
                  that does nothing" this screen exists to prevent. */}
              {(rule.id === 'time_to_leave' || rule.id === 'faster') && rule.available && (
                <TripRuleLine view={savedTrip} />
              )}
              {(rule.id === 'spike' || rule.id === 'closure') &&
                rule.available &&
                watchlist.length === 0 && (
                <Text style={styles.ruleBlocked}>
                  Watching no crossings yet — pick some above.
                </Text>
              )}
            </View>
            <Toggle
              label={rule.name}
              value={rules[rule.id]}
              disabled={!rule.available}
              onChange={() => prefs.toggleRule(rule.id)}
            />
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: space.gutter, marginTop: space.sectionGap, gap: 8 }}>
        <View style={styles.activityHead}>
          <SectionLabel>Recent</SectionLabel>
          {activity.length > 0 && (
            <Pressable
              onPress={() => prefs.clearActivity()}
              role="button"
              aria-label="Clear recent alerts"
              hitSlop={{ left: 8, right: 8 }}
              style={styles.inlineLink}
            >
              {({ pressed }) => (
                <Text style={[styles.clearText, pressed && styles.linkPressed]}>Clear</Text>
              )}
            </Pressable>
          )}
        </View>

        {activity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing has fired yet</Text>
            <Text style={styles.emptyBody}>
              {watchlist.length === 0
                ? 'Pick a crossing to watch and leave the app open. Changes show up here.'
                : 'The app compares each feed poll against the last one. A spike or a closure at a watched crossing will land here.'}
            </Text>
          </View>
        ) : (
          activity.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <EventIcon tone={e.tone} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventBody}>{e.body}</Text>
              </View>
              {/* Activity survives relaunch, so an entry from another day
                  says which day — "3:12 PM" alone reads as today. */}
              <Text style={[styles.eventTime, tabular]}>{eventClock(e.at)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={[styles.footnote, tabular]}>
        {aged.data
          ? `Feed checked ${formatAge(aged.data.ingestAgeSeconds)} · rules re-run on every poll.`
          : 'No feed data loaded, so nothing is being checked right now.'}
      </Text>
    </ScrollView>
  );
}

/**
 * What the trip-shaped rules are actually armed on, in one line.
 *
 * Read from `useSavedTrip` — the same view the watcher fires from — rather
 * than `prefs.trip`, because a trip saved yesterday is non-null in prefs but
 * expired for the watcher. Gating on the raw pref showed the toggle ON with
 * nothing behind it: the "switch that moves and does nothing" this screen
 * exists to prevent. Every state names what is (or is not) being watched.
 */
function TripRuleLine({ view }: { view: SavedTripView | null }) {
  if (!view) {
    return <Text style={styles.ruleBlocked}>Tap a crossing on Plan to set a trip</Text>;
  }
  if (view.expired) {
    return (
      <Text style={styles.ruleBlocked}>
        Yesterday’s trip has expired — set a new one on Plan
      </Text>
    );
  }
  const { trip, status: tripStatus } = view;
  const laneLabel = tripLaneLabel(trip.lane);
  if (!tripStatus) {
    return <Text style={styles.ruleBlocked}>Checking the line…</Text>;
  }
  if (!tripStatus.via) {
    return (
      <Text style={styles.ruleBlocked}>
        {trip.viaName} has no open {laneLabel} lane reported — can’t be updated
      </Text>
    );
  }
  const { via, departureHasPassed } = tripStatus;
  // `~` marks a leave time solved from a wait that is not live, matching how
  // approximate times read everywhere else; the verdict itself is named so
  // stale never reads as merely estimated.
  const live = via.freshness === 'live';
  return (
    <Text style={styles.ruleBlocked}>
      {trip.viaName} · across by{' '}
      <Text style={tabular}>{formatMinutes(trip.targetMinutes)}</Text> · {laneLabel} — leave by{' '}
      <Text style={tabular}>
        {live ? '' : '~'}
        {formatMinutes(via.leaveMinutes)}
      </Text>
      {live ? '' : ` (${via.freshness})`}
      {departureHasPassed ? ' · departure has passed' : ''}
    </Text>
  );
}

const TILE = 36;

const styles = StyleSheet.create({
  title: { ...type.screenTitle, color: color.navy },
  subtitle: { ...type.body, color: color.muted },

  // Capability limit: amber, one row, expandable. See the module comment for
  // why this is not the reference layout's green "push is on".
  limitCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: status.moderate.tint, borderRadius: radius.banner,
    paddingVertical: 14, paddingHorizontal: space.cardPad,
  },
  limitTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: status.moderate.ink },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  limitBody: {
    ...type.body, fontSize: 13, lineHeight: 19, color: color.muted,
    paddingHorizontal: space.gutter, marginTop: 8,
  },

  watchCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.infoTint, borderRadius: radius.card,
    padding: space.cardPad, gap: 12,
  },
  watchHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  watchCount: { ...type.metric, color: color.navy },
  // 44pt tall inside the card's own padding, so the whole target is real
  // (iOS only hit-tests slop that lands inside the parent's bounds).
  manageBtn: {
    backgroundColor: color.surface, borderRadius: radius.pill,
    paddingHorizontal: 16, minHeight: space.hitMin, justifyContent: 'center',
  },
  manageBtnPressed: { backgroundColor: color.mist },
  manageText: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: color.cobalt },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Filter chips: active navy fill, inactive white with a 1px line border.
  // Both carry the 1px border (the active one in its own fill) so both sit on
  // the 4pt grid at the same height — v1's 7/13-plus-border trick is gone.
  // 12 + 16 + 12 + 2 = 42pt, and the 2pt of row gap reaches the 44 floor.
  watchChipOn: {
    paddingHorizontal: 12, paddingVertical: 12,
    borderRadius: radius.pill, backgroundColor: color.navy,
    borderWidth: 1, borderColor: color.navy,
  },
  watchChipOff: {
    paddingHorizontal: 12, paddingVertical: 12,
    borderRadius: radius.pill, backgroundColor: color.surface,
    borderWidth: 1, borderColor: color.line,
  },
  watchChipOnPressed: { backgroundColor: color.navyTint, borderColor: color.navyTint },
  watchChipOffPressed: { backgroundColor: color.mist },
  watchChipText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold },
  // Summary chips are not controls — they read as labels so nobody taps one
  // expecting it to toggle. Managing happens behind the button.
  watchChipQuiet: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: color.surface,
  },
  watchChipQuietText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.cobalt },

  sectionLabel: { paddingHorizontal: space.gutter, marginTop: space.sectionGap, marginBottom: 8 },
  rulesCard: {
    marginHorizontal: space.gutter,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, overflow: 'hidden',
  },
  ruleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: space.cardPad, paddingVertical: 14,
  },
  ruleIcon: {
    width: TILE, height: TILE, borderRadius: radius.sm, backgroundColor: color.infoTint,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleDivider: { borderBottomWidth: 1, borderBottomColor: color.line },
  ruleName: { ...type.cardTitle, color: color.navy },
  ruleDesc: { ...type.metadata, fontFamily: font.regular, color: color.muted },
  ruleBlocked: { ...type.metadata, color: color.muted },

  helpText: { fontSize: 12, lineHeight: 17, fontFamily: font.regular, color: color.infoInk },

  activityHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearText: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold, color: color.cobalt },
  // A text link's 44pt touch height, held by its own padding and given back
  // with a negative margin, so the frame overflows the row and iOS hit-tests
  // it (hitSlop past the parent's bounds it clips).
  inlineLink: { paddingVertical: 14, marginVertical: -14, justifyContent: 'center' },
  linkPressed: { color: color.cobaltDeep },

  emptyCard: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, padding: space.cardPad, gap: 4,
  },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.navy },
  emptyBody: { ...type.metadata, fontFamily: font.regular, color: color.muted },

  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: space.cardPad,
  },
  eventIcon: {
    width: TILE, height: TILE, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  eventTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.navy },
  eventBody: { ...type.metadata, fontFamily: font.regular, color: color.muted },
  eventTime: { ...type.metadata, color: color.muted },

  footnote: {
    ...caption, color: color.muted,
    paddingHorizontal: space.gutter, marginTop: space.sectionGap,
  },
});
