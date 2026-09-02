import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionLabel, Toggle } from '../../src/components/ui';
import { formatAge, formatClock } from '../../src/freshness-ui';
import { ALERT_RULES } from '../../src/alerts';
import { prefs, usePrefs } from '../../src/prefs';
import { usePorts, useWaits } from '../../src/queries';
import { useAgedWaits } from '../../src/useFreshness';
import { color, font, radius, space, status } from '../../src/theme';

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
 * That limit is stated at the top of the screen in the same weight as the
 * feature itself, because the failure mode of an alerts product is silent
 * non-delivery — a user who believes they will be told and is not. A rule that
 * cannot be evaluated at all is shown disabled with the reason rather than as
 * a switch that moves and does nothing.
 */
export default function Alerts() {
  const insets = useSafeAreaInsets();
  const { rules, watchlist, activity, trip } = usePrefs();
  const ports = usePorts();
  const waits = useWaits();
  // "Feed checked X ago" must keep counting while the app sits open offline —
  // the server's ingestAgeSeconds is frozen at fetch time.
  const aged = useAgedWaits(waits);

  /** Only crossings in scope can be watched — the same filter the list uses. */
  const watchable = useMemo(
    () => (ports.data?.ports ?? []).filter((p) => p.routable && p.lat !== null),
    [ports.data],
  );

  return (
    <ScrollView
      style={{ backgroundColor: color.mist }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: space.tabBarClearance,
      }}
    >
      <View style={{ paddingHorizontal: space.gutter }}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          Checked against the feed every minute the app is open.
        </Text>
      </View>

      <View style={styles.limitCard}>
        <Text style={styles.limitTitle}>These don’t reach a closed app yet</Text>
        <Text style={styles.limitBody}>
          Rules run in the app, not on a server, so they only fire while it’s open. Push
          notifications need an account to attach rules to and a delivery queue to send
          them — neither exists yet.
        </Text>
      </View>

      <View style={styles.rulesCard}>
        {ALERT_RULES.map((rule, i) => (
          <View
            key={rule.id}
            style={[styles.ruleRow, i < ALERT_RULES.length - 1 && styles.ruleDivider]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.ruleName, !rule.available && { color: color.muted }]}>
                {rule.name}
              </Text>
              <Text style={styles.ruleDesc}>{rule.desc}</Text>
              {rule.blockedReason && (
                <Text style={styles.ruleBlocked}>{rule.blockedReason}</Text>
              )}
              {rule.id === 'time_to_leave' && rule.available && !trip && (
                <Text style={styles.ruleBlocked}>
                  Nothing to nudge you about — save a trip on the Trips tab first.
                </Text>
              )}
              {(rule.id === 'spike' || rule.id === 'closure') &&
                rule.available &&
                watchlist.length === 0 && (
                <Text style={styles.ruleBlocked}>
                  Watching no crossings yet — pick some below.
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

      <View style={{ paddingHorizontal: space.gutter, marginTop: 18, gap: 8 }}>
        <SectionLabel>Crossings you watch</SectionLabel>
        <Text style={styles.helpText}>
          Spike and closure alerts only fire for these. Watching all eleven would be noise.
        </Text>
        <View style={styles.watchWrap}>
          {watchable.map((p) => {
            const on = watchlist.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => prefs.toggleWatch(p.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[
                  styles.watchChip,
                  on
                    ? { backgroundColor: color.navy, borderColor: color.navy }
                    : { backgroundColor: color.surface, borderColor: color.line },
                ]}
              >
                <Text
                  style={[
                    styles.watchChipText,
                    {
                      color: on ? color.surface : color.muted,
                      fontFamily: font.semibold,
                    },
                  ]}
                >
                  {p.displayName}
                </Text>
              </Pressable>
            );
          })}
          {watchable.length === 0 && (
            <Text style={styles.helpText}>
              {ports.isLoading ? 'Loading crossings…' : 'Can’t reach the server.'}
            </Text>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: space.gutter, marginTop: 20, gap: 8 }}>
        <View style={styles.activityHead}>
          <SectionLabel>Activity</SectionLabel>
          {activity.length > 0 && (
            <Pressable onPress={() => prefs.clearActivity()} accessibilityRole="button">
              <Text style={styles.clearText}>Clear</Text>
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
            <View
              key={e.id}
              style={[
                styles.eventRow,
                {
                  borderLeftColor:
                    e.tone === 'bad'
                      ? status.heavy.dot
                      : e.tone === 'good'
                        ? status.clear.dot
                        : status.moderate.dot,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventBody}>{e.body}</Text>
              </View>
              <Text style={styles.eventTime}>{formatClock(e.at)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.footnote}>
        {aged.data
          ? `Feed checked ${formatAge(aged.data.ingestAgeSeconds)} · rules re-run on every poll.`
          : 'No feed data loaded, so nothing is being checked right now.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontFamily: font.bold, color: color.navy, letterSpacing: -0.48 },
  subtitle: { fontSize: 12, fontFamily: font.regular, color: color.muted, marginTop: 2 },

  // Notice banner: a capability limit is information, not a warning.
  limitCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.infoTint, borderRadius: radius.banner,
    paddingVertical: 13, paddingHorizontal: 15, gap: 5,
  },
  limitTitle: { fontSize: 13, fontFamily: font.semibold, color: color.infoInk },
  limitBody: { fontSize: 13, fontFamily: font.regular, color: color.infoInk, lineHeight: 19 },

  rulesCard: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, overflow: 'hidden',
  },
  ruleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 15, paddingVertical: 13,
  },
  ruleDivider: { borderBottomWidth: 1, borderBottomColor: color.line },
  ruleName: { fontSize: 14, fontFamily: font.semibold, color: color.navy },
  ruleDesc: { fontSize: 11.5, fontFamily: font.regular, color: color.muted },
  ruleBlocked: { fontSize: 10.5, fontFamily: font.regular, color: color.muted, lineHeight: 15 },

  helpText: { fontSize: 11, fontFamily: font.regular, color: color.muted, lineHeight: 15 },
  watchWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  // Filter chips: active navy fill, inactive white with a line border.
  watchChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1,
  },
  watchChipText: { fontSize: 12 },

  activityHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearText: { fontSize: 11, fontFamily: font.semibold, color: color.cobalt },

  emptyCard: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, padding: 16, gap: 5,
  },
  emptyTitle: { fontSize: 13.5, fontFamily: font.semibold, color: color.navy },
  emptyBody: { fontSize: 11.5, fontFamily: font.regular, color: color.muted, lineHeight: 16 },

  eventRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderLeftWidth: 3,
    borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 15,
  },
  eventTitle: { fontSize: 13.5, fontFamily: font.semibold, color: color.navy },
  eventBody: { fontSize: 11.5, fontFamily: font.regular, color: color.muted, lineHeight: 16 },
  eventTime: { fontSize: 10.5, fontFamily: font.regular, color: color.muted },

  footnote: {
    fontSize: 10.5, fontFamily: font.regular, color: color.muted,
    paddingHorizontal: space.gutter, marginTop: 16, lineHeight: 15,
  },
});
