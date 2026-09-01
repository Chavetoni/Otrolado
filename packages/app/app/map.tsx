import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import CrossingsMap from '../src/components/CrossingsMap';
import { formatAge } from '../src/freshness-ui';
import {
  DEFAULT_TRAVEL_MODE,
  isUiTravelMode,
  travelModeLabel,
  type UiTravelMode,
} from '../src/modes';
import { rankPorts } from '../src/ranking';
import { usePorts, useWaits } from '../src/queries';
import { useAgedWaits } from '../src/useFreshness';
import { useOrigin } from '../src/useOrigin';
import { color, dropShadow, font, radius, space, tabular } from '../src/theme';

/**
 * The full-screen map, reached by tapping the inline card on Crossings.
 *
 * A pushed route rather than a fourth tab: the prototype's tab bar is three
 * tabs, and panning belongs on a surface that is not inside a scroll view.
 *
 * Mode arrives as a param so the map opens showing what Crossings was showing.
 * Direction does not — Home hides the map southbound, where there is no
 * official feed to draw.
 */

export default function FullScreenMap() {
  const insets = useSafeAreaInsets();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  // A hand-edited or stale URL must not crash the screen or silently rank a
  // mode nobody asked for.
  const mode: UiTravelMode = isUiTravelMode(modeParam) ? modeParam : DEFAULT_TRAVEL_MODE;

  const origin = useOrigin();
  const ports = usePorts();
  const waits = useWaits();
  // Re-aged to now, so the footer's "updated X ago" keeps counting offline.
  const aged = useAgedWaits(waits);

  const ranked = useMemo(
    () => rankPorts(ports.data?.ports ?? [], aged.data, origin, mode, 'northbound'),
    [ports.data, aged.data, origin, mode],
  );

  const ingestAge = aged.data?.ingestAgeSeconds ?? null;
  const loadError = ports.error ?? waits.error;

  /*
   * The source note floats over the map, so its height is measured rather than
   * guessed — it grows a line when the origin is a fallback or the server is
   * unreachable, and the legend has to clear whatever it actually is.
   */
  const footerOffset = Math.max(insets.bottom, 16);
  const [footerHeight, setFooterHeight] = useState(0);

  return (
    <View style={styles.screen}>
      <CrossingsMap
        rows={ranked}
        origin={origin}
        modeLabel={travelModeLabel(mode)}
        variant="full"
        insetBottom={footerHeight > 0 ? footerOffset + footerHeight : 0}
      />

      <View style={[styles.backWrap, { top: insets.top + 10 }]}>
        {/*
          Opened by a deep link or a browser refresh, this screen is the first
          entry in the stack and there is nothing to pop — `router.back()` alone
          throws "GO_BACK was not handled by any navigator" and the button dies.
          Fall back to the tab the label promises.
        */}
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>‹  Crossings</Text>
        </Pressable>
      </View>

      <View
        style={[styles.footer, { bottom: footerOffset }]}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      >
        {loadError && ranked.length === 0 ? (
          <Text style={styles.footerError}>
            Can’t reach the server — no crossings to show yet.
          </Text>
        ) : null}
        {/* Same sentence, trigger and placement as Home's SourceNote: pins on
            screen during an outage are the last saved data, and must say so. */}
        {loadError && ranked.length > 0 ? (
          <Text style={styles.footerError}>
            Can’t reach the server — showing the last data we saved.
          </Text>
        ) : null}
        {waits.data !== undefined ? (
          <Text style={[styles.footerText, tabular]}>
            Live from CBP · updated {formatAge(ingestAge)}
          </Text>
        ) : null}
        <Text style={styles.footerText}>
          Drive times are straight-line approximations, not routed ETAs
          {origin.isFallback ? ', from an approximate starting point' : ''}. Pin locations
          are hand-placed.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.appBg },

  // The map fills the screen, so the back control floats over it rather than
  // sitting in a header bar that would eat 56px of map.
  backWrap: { position: 'absolute', left: space.gutter, zIndex: 1000 },
  back: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...dropShadow({ y: 3, blur: 10, color: color.ink, opacity: 0.15, elevation: 4 }),
  },
  backText: { fontSize: 13, fontFamily: font.bold, color: color.navy },

  footer: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    zIndex: 1000,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingHorizontal: space.cardPad,
    paddingVertical: 10,
    gap: 3,
  },
  footerText: { fontSize: 10.5, fontFamily: font.regular, color: color.tertiary },
  footerError: { fontSize: 11.5, fontFamily: font.semibold, color: color.redOnTint },
});
