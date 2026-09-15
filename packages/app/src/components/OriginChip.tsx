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
 * "Starting near" a town, or "Starting at" "Your location" when no town is
 * close enough to name; a place the user picked says "Starting from" (we are
 * not guessing — they told us); and the fallback says "Approximate start" and
 * pairs with the amber dot, because a ranking measured from a point nobody
 * supplied is the one case a user should want to fix.
 */
export function OriginChip({ origin }: { origin: Origin }) {
  const eyebrow =
    origin.source === 'chosen'
      ? 'Starting from'
      : origin.source === 'gps'
        ? origin.near
          ? 'Starting near'
          : 'Starting at'
        : 'Approximate start';
  const dot = origin.isFallback ? status.moderate.dot : status.clear.dot;

  return (
    <Pressable
      // A card-like control: pressed takes the mist fill, not a scale.
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={() => router.push('/origin')}
      role="button"
      aria-label={`${eyebrow} ${origin.label}. Change starting point`}
    >
      <View style={styles.iconWrap}>
        <PinGlyph size={16} color={color.cobalt} />
        <View style={[styles.dot, { backgroundColor: dot }]} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
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
    // Wide enough for the fallback's region name in full; the header row wraps
    // the chip onto its own line before this would truncate it.
    maxWidth: 240,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 14,
    // 44pt tall on its own, not via hitSlop — iOS clips slop at the header's
    // edge, and this chip sits at the top of it.
    minHeight: 44,
    paddingVertical: 4,
  },
  chipPressed: { backgroundColor: color.mist },
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
  // The source of the point, set like the v2 pill word: 10/600 spaced caps —
  // the smallest size the system uses, and only for a word, never a sentence.
  eyebrow: {
    fontSize: 10, lineHeight: 14, fontFamily: font.semibold, color: color.muted,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  label: { fontSize: 13, lineHeight: 17, fontFamily: font.bold, color: color.navy, letterSpacing: -0.2 },
});
