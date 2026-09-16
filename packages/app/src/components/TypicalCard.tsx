import { useState } from 'react';
import { Text, View } from 'react-native';
import type { LaneType, Port, TypicalCell } from '@otrolado/shared';
import { formatHour, typicalSpread } from '../typical';
import { useTypicalNow } from '../useTypicalNow';
import { font, radius, space, tabular } from '../theme';
import { makeStyles, useTheme } from '../useTheme';
import { caption, type } from '../typography';
import { SectionLabel, Skeleton } from './ui';

/**
 * "Typical waits" for the crossing: CBP's own previous-year hourly averages
 * (the typical_waits import), drawn for today's weekday and the selected lane.
 *
 * This is a climatology, not a forecast, and the presentation keeps that
 * distinction load-bearing rather than decorative (design system v2 §08):
 *   - every render path carries the CBP-previous-year attribution;
 *   - RECORDED bars are solid `lineStrong` — they carry data and must be
 *     visible on the card — never the green/amber/red severity scale, so
 *     year-old averages cannot speak the same colour language as live waits;
 *   - the ONE `accent` bar (cobalt in light, lifted in dark — a mark with
 *     nothing on top of it) is the current READING, and only when it is live. It
 *     stands at the current hour IN FRONT OF that hour's typical bar, never
 *     in place of it: replacing the typical value made a quiet morning look
 *     like the usual curve while the banner above said "unusually quiet".
 *     Layered, the grey typical bar shows as shoulders beside a busier live
 *     bar and rises above a quieter one — the comparison the banner makes in
 *     words. When the reading is not live there is no accent bar at all — a
 *     NOW marker alone says which hour it is;
 *   - a forecast, when one exists, will be OUTLINED (`forecastLine` on
 *     `forecastFill`), never filled: prediction must never look like
 *     measurement. There is none yet, and the card says so;
 *   - hours CBP has no history for are gaps, not zeros.
 *
 * The numbers come from `useTypicalNow` rather than being computed here, so
 * this card and the live-wait card above it can never quote different figures
 * for the same hour.
 */
const BAR_MAX_HEIGHT = 64;
/** Floor for the y-scale so a 3-minute night doesn't render as a wall of full bars. */
const SCALE_FLOOR_MINUTES = 15;
const SLOT_GAP = 2;
/** Room above the bars for the NOW pill, which is centred on the chart's top edge. */
const NOW_PILL_H = 16;

export function TypicalCard({
  port,
  lane,
  liveMinutes = null,
}: {
  port: Port;
  lane: LaneType;
  /**
   * The current reading for this lane, ONLY while it is live and open. The
   * caller gates it (see port/[id].tsx): an aged figure drawn as the accent
   * "right now" bar would be a verdict on a number nobody stands behind.
   */
  liveMinutes?: number | null;
}) {
  const styles = useStyles();
  const typical = useTypicalNow(port, lane);

  let body: React.ReactNode;
  if (typical.isLoading) {
    body = (
      <View style={{ gap: 8, marginTop: NOW_PILL_H / 2 }}>
        <Skeleton width="100%" height={BAR_MAX_HEIGHT} round={radius.sm} />
        <Skeleton width={180} height={11} round={6} />
      </View>
    );
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
    body = <TypicalChart cells={typical.cells} nowHour={typical.hour} liveMinutes={liveMinutes} />;
  }

  return (
    <View style={styles.card}>
      <SectionLabel>{`Typical ${typical.dayName} waits`}</SectionLabel>
      {body}
      <Text style={styles.attribution}>{typical.attribution}</Text>
    </View>
  );
}

function TypicalChart({
  cells,
  nowHour,
  liveMinutes,
}: {
  cells: readonly TypicalCell[];
  nowHour: number;
  liveMinutes: number | null;
}) {
  const { color } = useTheme();
  const styles = useStyles();
  const byHour = new Map(cells.map((c) => [c.hour, c.avgWaitMinutes]));
  const peak = Math.max(...byHour.values());
  // One scale for both series, so the accent bar and its grey neighbours are
  // comparable by eye — which is the whole point of drawing it there.
  const scaleMax = Math.max(peak, liveMinutes ?? 0, SCALE_FLOOR_MINUTES);
  const peakHour = [...byHour.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const nowTypical = byHour.get(nowHour);
  // The middle bulk of the day, not its extremes — see `typicalSpread`.
  const spread = typicalSpread(cells);

  // RN lays the 24 slots out with flex; the NOW marker is absolutely
  // positioned, so the slot pitch has to be measured rather than assumed.
  const [rowWidth, setRowWidth] = useState(0);
  const slotWidth = rowWidth > 0 ? (rowWidth - SLOT_GAP * 23) / 24 : 0;
  const nowCenter = nowHour * (slotWidth + SLOT_GAP) + slotWidth / 2;

  const barHeight = (minutes: number): number =>
    Math.max(2, Math.round((minutes / scaleMax) * BAR_MAX_HEIGHT));

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.plot}>
        {/* Two gridlines in `inset`; the number above the chart is the scale, so no y labels. */}
        <View style={[styles.gridline, { bottom: BAR_MAX_HEIGHT / 3 }]} />
        <View style={[styles.gridline, { bottom: (BAR_MAX_HEIGHT * 2) / 3 }]} />

        <View style={styles.chartRow} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
          {Array.from({ length: 24 }, (_, h) => {
            const v = byHour.get(h);
            const withLive = h === nowHour && liveMinutes !== null;
            return (
              <View key={h} style={styles.barSlot}>
                {v !== undefined && (
                  <View
                    style={[styles.bar, { height: barHeight(v), backgroundColor: color.lineStrong }]}
                  />
                )}
                {withLive && (
                  <View style={[styles.bar, styles.liveBar, { height: barHeight(liveMinutes) }]} />
                )}
              </View>
            );
          })}
        </View>
        {/* One baseline in line-strong, directly under the bars (no gap) so
            the bars stand on it and the NOW rule crosses it. */}
        <View style={styles.axis} />

        {/* The NOW marker: a 1.5px rule to the axis and a pill on the top edge. */}
        {slotWidth > 0 && (
          <>
            <View style={[styles.nowRule, { left: nowCenter - 0.75 }]} />
            <View style={[styles.nowPill, { left: nowCenter }]}>
              <Text style={styles.nowPillText}>NOW</Text>
            </View>
          </>
        )}
      </View>
      <View style={styles.axisRow}>
        <Text style={[styles.axisText, tabular]}>12a</Text>
        <Text style={[styles.axisText, tabular]}>6a</Text>
        <Text style={[styles.axisText, tabular]}>12p</Text>
        <Text style={[styles.axisText, tabular]}>6p</Text>
        <Text style={[styles.axisText, tabular]}>11p</Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color.lineStrong }]} />
          <Text style={styles.legendText}>Typical · CBP, previous year</Text>
        </View>
        {liveMinutes !== null && (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: color.accent }]} />
            <Text style={[styles.legendText, { color: color.ink }]}>Right now</Text>
          </View>
        )}
      </View>

      {spread && (
        // "Most hours", not "most waits": these are hourly averages, and
        // claiming a distribution of individual queue times would describe
        // data we do not have.
        <Text style={styles.spreadLine}>
          Most hours fall between{' '}
          <Text style={[styles.strong, tabular]}>
            {spread.low}–{spread.high} min
          </Text>
        </Text>
      )}
      <Text style={styles.peakLine}>
        {nowTypical !== undefined && (
          <>
            Typically <Text style={[styles.strong, tabular]}>{nowTypical} min</Text> at this
            hour ·{' '}
          </>
        )}
        busiest near <Text style={[styles.strong, tabular]}>{formatHour(peakHour)}</Text> at around{' '}
        <Text style={[styles.strong, tabular]}>{peak} min</Text>
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ color }) => ({
  card: {
    marginHorizontal: space.gutter, marginTop: space.sectionGap,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.card, padding: space.cardPad, gap: 8,
  },
  plot: { position: 'relative', paddingTop: NOW_PILL_H / 2 + 6, marginTop: 4 },
  // The live reading, layered in front of this hour's typical bar and
  // narrower than it, so the typical value stays visible around or above it.
  liveBar: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%',
    backgroundColor: color.accent,
  },
  gridline: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: color.inset },
  chartRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SLOT_GAP,
    height: BAR_MAX_HEIGHT,
  },
  barSlot: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  // 6px top radius, square feet.
  bar: { borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar },
  // Runs 2px past the baseline, as the sheet draws it (bottom:-2px).
  nowRule: {
    position: 'absolute', top: NOW_PILL_H / 2, bottom: -2, width: 1.5,
    backgroundColor: color.accent,
  },
  nowPill: {
    position: 'absolute', top: 0, height: NOW_PILL_H,
    transform: [{ translateX: -19 }],
    backgroundColor: color.accent, borderRadius: radius.pill,
    paddingHorizontal: 7, justifyContent: 'center',
  },
  nowPillText: { fontSize: 9, lineHeight: 12, fontFamily: font.semibold, color: color.onAccent, letterSpacing: 0.9 },
  axis: { height: 1, backgroundColor: color.lineStrong },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11, lineHeight: 14, fontFamily: font.medium, color: color.muted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  legendText: { ...type.metadata, color: color.muted },
  spreadLine: { ...type.body, color: color.ink, marginTop: 2 },
  peakLine: { fontSize: 12, lineHeight: 18, fontFamily: font.regular, color: color.ink },
  strong: { fontFamily: font.semibold },
  note: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, color: color.muted },
  attribution: { ...caption, color: color.muted },
}));
