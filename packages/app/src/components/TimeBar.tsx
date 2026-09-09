import { StyleSheet, View } from 'react-native';
import { radius } from '../theme';

/**
 * Two-segment drive/wait bar. Segment widths are proportional to the actual
 * minutes via flex weights, not measured pixels, so it resizes for free.
 *
 * Weights are floored at 2 rather than the true minute count so a 0-minute
 * leg (e.g. "no delay") still renders a visible sliver — the displayed
 * numbers next to the bar stay exact; only the proportion is floored.
 */
export function TimeBar({
  driveMinutes,
  waitMinutes,
  driveColor,
  waitColor,
  height = 6,
}: {
  driveMinutes: number;
  waitMinutes: number;
  driveColor: string;
  waitColor: string;
  height?: number;
}) {
  const driveWeight = Math.max(driveMinutes, 2);
  const waitWeight = Math.max(waitMinutes, 2);
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.segment, { flex: driveWeight, backgroundColor: driveColor }]} />
      <View style={styles.gap} />
      <View style={[styles.segment, { flex: waitWeight, backgroundColor: waitColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', width: '100%' },
  segment: { height: '100%', borderRadius: radius.bar },
  gap: { width: 3 },
});
