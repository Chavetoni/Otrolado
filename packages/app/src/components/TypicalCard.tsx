import { StyleSheet, Text, View } from 'react-native';
import type { LaneType, Port, TypicalCell } from '@otrolado/shared';
import { useTypical } from '../queries';
import { color, font, radius, space, tabular } from '../theme';

/**
 * "Typical waits" for the crossing: CBP's own previous-year hourly averages
 * (the typical_waits import), drawn for today's weekday and the selected lane.
 *
 * This is a climatology, not a forecast, and the presentation keeps that
 * distinction load-bearing rather than decorative:
 *   - every render path carries the CBP-previous-year attribution;
 *   - bars are a single cobalt, never the green/amber/red severity scale —
 *     year-old averages must not speak the same color language as live waits;
 *   - hours CBP has no history for are gaps, not zeros.
 * Our own model replaces this card's data source once enough history exists;
 * the copy says so instead of promising a curve it can't draw.
 */

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};
const BAR_MAX_HEIGHT = 64;
/** Floor for the y-scale so a 3-minute night doesn't render as a wall of full bars. */
const SCALE_FLOOR_MINUTES = 15;

/**
 * The clock at the crossing, not on the phone: a user checking from afar
 * should see the bridge's "now". feed_tz matches civil time everywhere in the
 * pilot (see CLAUDE.md on Arizona before widening). Falls back to device time
 * if the zone string ever fails to parse.
 */
function portNow(tz: string): { month: number; dow: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
      month: 'numeric',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const dow = WEEKDAY_TO_ISO[get('weekday')];
    const hour = Number(get('hour'));
    const month = Number(get('month'));
    // Some engines ignore hourCycle and emit "24" at midnight; the route and
    // importer both bound hour to 0–23, so reject it here too rather than let
    // the "now" highlight silently vanish for an hour.
    if (dow && Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(month)) {
      return { month, dow, hour };
    }
  } catch {
    // fall through
  }
  const d = new Date();
  return { month: d.getMonth() + 1, dow: ((d.getDay() + 6) % 7) + 1, hour: d.getHours() };
}

function formatHour(h: number): string {
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

export function TypicalCard({ port, lane }: { port: Port; lane: LaneType }) {
  const now = portNow(port.feedTz);
  const typical = useTypical(port.id, now.month);

  const dayName = DAY_NAMES[now.dow - 1] ?? '';
  // "Last year" is a decaying claim: our copy is frozen at import time while
  // CBP's window rolls, so the vintage is anchored to the import date the API
  // reports rather than hardcoded. If the importer is forgotten for a year,
  // this line ages visibly instead of quietly becoming false.
  const importedAt = typical.data?.importedAt ? new Date(typical.data.importedAt) : null;
  const vintage = importedAt
    ? `the year before our ${MONTH_NAMES[importedAt.getMonth()]} ${importedAt.getFullYear()} import`
    : 'a previous year';
  const attribution =
    `CBP average for ${MONTH_NAMES[now.month - 1]} ${dayName}s, from ${vintage} — ` +
    'a pattern, not a prediction. Live forecasts arrive once enough history is collected.';

  let body: React.ReactNode;
  const laneEntry = typical.data?.lanes.find((l) => l.mode === 'passenger' && l.lane === lane);
  const cells = laneEntry?.cells.filter((c) => c.dow === now.dow);

  if (typical.isLoading) {
    body = <Text style={styles.note}>Loading typical patterns…</Text>;
  } else if (typical.error && !typical.data) {
    // Only when there is nothing cached: a failed background refetch must not
    // replace hour-old (staleTime) bars that are still perfectly good.
    body = <Text style={styles.note}>Typical patterns couldn’t be loaded right now.</Text>;
  } else if (!cells || cells.length === 0) {
    // Three absences, three different owners — never blame CBP for our own
    // import scope: no lanes at all means the importer hasn't covered this
    // crossing (it only runs for routable ports); a missing lane is CBP's
    // gap; a lane with no cells for this month/day is also CBP's gap.
    const imported = (typical.data?.lanes.length ?? 0) > 0;
    body = (
      <Text style={styles.note}>
        {!imported
          ? 'Typical-wait history hasn’t been imported for this crossing yet.'
          : !laneEntry
            ? 'CBP has no typical-wait history for this lane here this month.'
            : `CBP has no typical-wait history for ${dayName}s here this month.`}
      </Text>
    );
  } else {
    body = <TypicalChart cells={cells} nowHour={now.hour} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>TYPICAL WAITS · {dayName.toUpperCase()}S</Text>
      {body}
      <Text style={styles.attribution}>{attribution}</Text>
    </View>
  );
}

function TypicalChart({ cells, nowHour }: { cells: readonly TypicalCell[]; nowHour: number }) {
  const byHour = new Map(cells.map((c) => [c.hour, c.avgWaitMinutes]));
  const peak = Math.max(...byHour.values());
  const scaleMax = Math.max(peak, SCALE_FLOOR_MINUTES);
  const peakHour = [...byHour.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const nowTypical = byHour.get(nowHour);

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.chartRow}>
        {Array.from({ length: 24 }, (_, h) => {
          const v = byHour.get(h);
          return (
            <View key={h} style={styles.barSlot}>
              {v !== undefined && (
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(2, Math.round((v / scaleMax) * BAR_MAX_HEIGHT)),
                      backgroundColor: h === nowHour ? color.cobalt : color.cobaltLight,
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>12a</Text>
        <Text style={styles.axisText}>6a</Text>
        <Text style={styles.axisText}>12p</Text>
        <Text style={styles.axisText}>6p</Text>
        <Text style={styles.axisText}>11p</Text>
      </View>
      <Text style={styles.peakLine}>
        {nowTypical !== undefined && (
          <>
            Typically <Text style={[styles.peakStrong, tabular]}>{nowTypical} min</Text> at this
            hour ·{' '}
          </>
        )}
        busiest near <Text style={styles.peakStrong}>{formatHour(peakHour)}</Text> at around{' '}
        <Text style={[styles.peakStrong, tabular]}>{peak} min</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.cardLg, padding: 16, gap: 8,
  },
  cardLabel: {
    fontSize: 11, fontFamily: font.semibold, letterSpacing: 1.1, color: color.muted,
  },
  chartRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    height: BAR_MAX_HEIGHT, marginTop: 4,
  },
  barSlot: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 10, fontFamily: font.regular, color: color.muted },
  peakLine: { fontSize: 12, fontFamily: font.regular, color: color.navy, lineHeight: 18 },
  peakStrong: { fontFamily: font.semibold },
  note: { fontSize: 13, fontFamily: font.regular, color: color.muted, lineHeight: 19 },
  attribution: { fontSize: 11, fontFamily: font.regular, color: color.muted, lineHeight: 16 },
});
