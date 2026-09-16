import { Pressable, StyleSheet, Text, View } from 'react-native';
import { legend } from './map-pin';
import { ExpandGlyph } from './glyphs';
import { pressedScale } from './ui';
import { font, radius } from '../theme';
import { makeStyles, useTheme } from '../useTheme';

/**
 * The overlays that sit on top of the inline map: the prototype's mode chip
 * (top-right) and wait-scale legend (bottom-right).
 *
 * Shared by the native and web maps. Both render react-native-web/RN Views for
 * their overlays even though the basemaps underneath are completely different
 * implementations, so this is the one copy of the chrome.
 *
 * Overlays are the one place a translucent surface (`overlay`) is used: they
 * float over map imagery, not the page, so the hairline-and-surface rule has
 * nothing to separate them from. Still no shadow.
 */

export function ModeChip({ label, top = MODE_CHIP_TOP }: { label: string; top?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.chip, { top }]}>
      {/*
        "wait" states what the pin numbers ARE. Without it a pin reading "41m"
        is indistinguishable from the door-to-door total shown elsewhere in
        the app, which this number deliberately is not.
      */}
      <Text style={styles.chipText}>{label} · wait</Text>
    </View>
  );
}

/**
 * `bottom` is raised by whatever chrome the caller floats beneath the map —
 * the full screen's source-note card would otherwise cover the legend.
 */
export function Legend({ bottom = LEGEND_BOTTOM }: { bottom?: number }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.legend, { bottom }]}>
      {legend(t).map((entry) => (
        <View key={entry.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: entry.color }]} />
          <Text style={styles.legendText}>{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const LEGEND_BOTTOM = 8;
export const MODE_CHIP_TOP = 10;

/**
 * The card's "tap to open" affordance.
 *
 * A static map that silently does something when tapped is a guess the user
 * has to make. It is also the accessible target: the basemap tap it mirrors is
 * a raw map gesture with no role or label of its own.
 */
export function ExpandHint({ onPress }: { onPress: () => void }) {
  const { color } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      // Pressed: the chip goes fully opaque and takes the 0.97 scale. A
      // colour shift on a 10px chip over map imagery would not read.
      style={({ pressed }) => [styles.expand, pressed && styles.expandPressed, pressedScale(pressed)]}
      hitSlop={10}
      role="button"
      aria-label="Open the full map"
    >
      <ExpandGlyph size={13} color={color.accent} strokeWidth={2.4} />
      <Text style={styles.expandText}>Expand</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ color }) => ({
  expand: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  expandPressed: { backgroundColor: color.surface },
  expandText: { fontSize: 10, fontFamily: font.semibold, color: color.accent, letterSpacing: 0.3 },

  chip: {
    position: 'absolute',
    right: 10,
    // In style, not as a prop: react-native-web 0.21 deprecates the prop form.
    pointerEvents: 'none',
    // Clears Leaflet's panes on web, which top out at 800.
    zIndex: 1000,
    backgroundColor: color.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipText: { fontSize: 10, fontFamily: font.semibold, color: color.ink, letterSpacing: 0.3 },

  legend: {
    position: 'absolute',
    right: 10,
    pointerEvents: 'none',
    zIndex: 1000,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: color.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Hairline keeps the pale non-live tints (est./stale) visible on the
  // legend's overlay background; invisible on the saturated scale dots.
  legendDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.line,
  },
  legendText: { fontSize: 10, fontFamily: font.semibold, color: color.muted },
}));
