import { StyleSheet, View } from 'react-native';
import { radius } from '../theme';

/**
 * Two-segment drive/wait proportion bar — the hero's one bespoke component
 * (design system v2 §10): it reads at a glance which half of the total is the
 * problem. Segment widths are proportional to the actual minutes via flex
 * weights, not measured pixels, so it resizes for free. Segments are pills,
 * 8px tall, 3px apart.
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
  height = 8,
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
    // Decorative: the split beside it states both numbers in words, and the
    // hero's own label speaks them. A label here was never read anyway — a
    // non-accessible View's label is ignored on iOS.
    <View style={[styles.track, { height }]} aria-hidden>
      <View style={[styles.segment, { flex: driveWeight, backgroundColor: driveColor }]} />
      <View style={styles.gap} />
      <View style={[styles.segment, { flex: waitWeight, backgroundColor: waitColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', width: '100%' },
  segment: { height: '100%', borderRadius: radius.pill },
  gap: { width: 3 },
});
