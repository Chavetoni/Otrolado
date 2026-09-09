import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PinGlyph } from './glyphs';
import type { Origin } from '../useOrigin';
import { color, font, radius, status } from '../theme';

/**
 * "Starting near McAllen, TX" — the origin, stated and tappable.
 *
 * Every ranking, total and leave-by in the app is measured from one point, so
 * the point belongs on screen next to the numbers it produces rather than
 * buried in a permission dialog the user answered once. Tapping opens the
 * picker (`app/origin.tsx`).
 *
 * The eyebrow line is the source, in the source's own words: a real fix says
 * "Starting near", a place the user picked says "Starting from" (we are not
 * guessing — they told us), and the fallback says "Approximate start" and
 * pairs with the amber dot, because a ranking measured from a point nobody
 * supplied is the one case a user should want to fix.
 */
export function OriginChip({ origin }: { origin: Origin }) {
  const eyebrow =
    origin.source === 'chosen'
      ? 'Starting from'
      : origin.source === 'gps'
        ? 'Starting near'
        : 'Approximate start';
  const dot = origin.isFallback ? status.moderate.dot : status.clear.dot;

  return (
    <Pressable
      style={styles.chip}
      onPress={() => router.push('/origin')}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow} ${origin.label}. Change starting point`}
    >
      <View style={styles.iconWrap}>
        <PinGlyph size={15} color={color.cobalt} />
        <View style={[styles.dot, { backgroundColor: dot }]} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.label} numberOfLines={1}>
          {origin.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 200,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingLeft: 11,
    paddingRight: 14,
    paddingVertical: 7,
  },
  iconWrap: { position: 'relative' },
  // A 6px status dot on the pin's shoulder: fallback vs. real start, without
  // a second line of text in a chip this small.
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: color.surface,
  },
  eyebrow: { fontSize: 9.5, fontFamily: font.semibold, color: color.muted, letterSpacing: 0.4 },
  label: { fontSize: 12.5, fontFamily: font.bold, color: color.navy, letterSpacing: -0.2 },
});
