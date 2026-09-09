import { StyleSheet, Text, View } from 'react-native';
import type { LaneType, Port, TypicalCell } from '@otrolado/shared';
import { formatHour, typicalSpread } from '../typical';
import { useTypicalNow } from '../useTypicalNow';
import { color, font, radius, space, tabular } from '../theme';

/**
 * "Typical waits" for the crossing: CBP's own previous-year hourly averages
 * (the typical_waits import), drawn for today's weekday and the selected lane.
 *
 * This is a climatology, not a forecast, and the presentation keeps that
 * distinction load-bearing rather than decorative:
 *   - every render path carries the CBP-previous-year attribution;
 *   - bars are neutral (`line`) with only the current hour in cobalt, never
 *     the green/amber/red severity scale — year-old averages must not speak
 *     the same color language as live waits;
 *   - hours CBP has no history for are gaps, not zeros.
 * Our own model replaces this card's data source once enough history exists;
 * the copy says so instead of promising a curve it can't draw.
 *
 * The numbers come from `useTypicalNow` rather than being computed here, so
 * this card and the live-wait card above it can never quote different figures
 * for the same hour.
 */
const BAR_MAX_HEIGHT = 64;
/** Floor for the y-scale so a 3-minute night doesn't render as a wall of full bars. */
const SCALE_FLOOR_MINUTES = 15;

export function TypicalCard({ port, lane }: { port: Port; lane: LaneType }) {
  const typical = useTypicalNow(port, lane);

  let body: React.ReactNode;
  if (typical.isLoading) {
    body = <Text style={styles.note}>Loading typical patterns…</Text>;
  } else if (typical.failed) {
    // Only when there is nothing cached: a failed background refetch must not
    // replace hour-old (staleTime) bars that are still perfectly good.
    body = <Text style={styles.note}>Typical patterns couldn’t be loaded right now.</Text>;
  } else if (typical.cells.length === 0) {
    body = (
      <Text style={styles.note}>
        {typical.notImported
          ? 'Typical-wait history hasn’t been imported for this crossing yet.'
          : typical.laneMissing
            ? 'CBP has no typical-wait history for this lane here this month.'
            : `CBP has no typical-wait history for ${typical.dayName}s here this month.`}
      </Text>
    );
  } else {
    body = <TypicalChart cells={typical.cells} nowHour={typical.hour} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>
        TYPICAL {typical.dayName.toUpperCase()} WAITS
      </Text>
      {body}
      <Text style={styles.attribution}>{typical.attribution}</Text>
    </View>
  );
}

function TypicalChart({ cells, nowHour }: { cells: readonly TypicalCell[]; nowHour: number }) {
  const byHour = new Map(cells.map((c) => [c.hour, c.avgWaitMinutes]));
  const peak = Math.max(...byHour.values());
  const scaleMax = Math.max(peak, SCALE_FLOOR_MINUTES);
  const peakHour = [...byHour.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const nowTypical = byHour.get(nowHour);
  // The middle bulk of the day, not its extremes — see `typicalSpread`.
  const spread = typicalSpread(cells);

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
                      // Design-system bar chart: `line` fill, current hour in cobalt.
                      backgroundColor: h === nowHour ? color.cobalt : color.line,
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
      {spread && (
        // "Most hours", not "most waits": these are hourly averages, and
        // claiming a distribution of individual queue times would describe
        // data we do not have.
        <Text style={styles.spreadLine}>
          Most hours fall between{' '}
          <Text style={[styles.peakStrong, tabular]}>
            {spread.low}–{spread.high} min
          </Text>
        </Text>
      )}
      <Text style={styles.peakLine}>
        {nowTypical !== undefined && (
          <>
            Typically <Text style={[styles.peakStrong, tabular]}>{nowTypical} min</Text> at this
            hour ·{' '}
          </>
        )}
        busiest near <Text style={[styles.peakStrong, tabular]}>{formatHour(peakHour)}</Text> at around{' '}
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
  bar: { borderRadius: radius.bar },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 10, fontFamily: font.regular, color: color.muted },
  spreadLine: { fontSize: 13.5, fontFamily: font.regular, color: color.navy },
  peakLine: { fontSize: 12, fontFamily: font.regular, color: color.navy, lineHeight: 18 },
  peakStrong: { fontFamily: font.semibold },
  note: { fontSize: 13, fontFamily: font.regular, color: color.muted, lineHeight: 19 },
  attribution: { fontSize: 11, fontFamily: font.regular, color: color.muted, lineHeight: 16 },
});
