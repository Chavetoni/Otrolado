import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LEGEND } from './map-pin';
import { color, font } from '../theme';

/**
 * The overlays that sit on top of the inline map: the prototype's mode chip
 * (top-right) and wait-scale legend (bottom-right).
 *
 * Shared by the native and web maps. Both render react-native-web/RN Views for
 * their overlays even though the basemaps underneath are completely different
 * implementations, so this is the one copy of the chrome.
 */

export function ModeChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      {/*
        "total min" states what the pin numbers ARE. Without it a pin reading
        "41m" is indistinguishable from a raw wait, which is the number the
        product deliberately does not rank on.
      */}
      <Text style={styles.chipText}>{label} · total min</Text>
    </View>
  );
}

/**
 * `bottom` is raised by whatever chrome the caller floats beneath the map —
 * the full screen's source-note card would otherwise cover the legend.
 */
export function Legend({ bottom = LEGEND_BOTTOM }: { bottom?: number }) {
  return (
    <View style={[styles.legend, { bottom }]}>
      {LEGEND.map((entry) => (
        <View key={entry.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: entry.color }]} />
          <Text style={styles.legendText}>{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const LEGEND_BOTTOM = 8;

/**
 * The card's "tap to open" affordance.
 *
 * A static map that silently does something when tapped is a guess the user
 * has to make. It is also the accessible target: the basemap tap it mirrors is
 * a raw map gesture with no role or label of its own.
 */
export function ExpandHint({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.expand}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Open the full map"
    >
      <Text style={styles.expandText}>⤢  Expand</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  expand: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1000,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expandText: { fontSize: 10, fontFamily: font.bold, color: color.navy },

  chip: {
    position: 'absolute',
    top: 10,
    right: 10,
    // In style, not as a prop: react-native-web 0.21 deprecates the prop form.
    pointerEvents: 'none',
    // Clears Leaflet's panes on web, which top out at 800.
    zIndex: 1000,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { fontSize: 10, fontFamily: font.bold, color: color.navy },

  legend: {
    position: 'absolute',
    right: 10,
    pointerEvents: 'none',
    zIndex: 1000,
    flexDirection: 'row',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Hairline keeps the pale non-live tints (est./stale) visible on the
  // legend's near-white background; invisible on the saturated scale dots.
  legendDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.border,
  },
  legendText: { fontSize: 9.5, fontFamily: font.semibold, color: color.secondary },
});
