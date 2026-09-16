import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';
import { ExpandHint, Legend, LEGEND_BOTTOM, MODE_CHIP_TOP, ModeChip } from './MapChrome';
import { PIN, pinAnchorY, pinCenterOffsetY, pinColor, pinLabel, pinName, pinShowsName, pinTextColor, pinZIndex } from './map-pin';
import { boundsOf, boundsToRegion } from '../map-bounds';
import type { RankedPort } from '../ranking';
import type { Origin } from '../useOrigin';
import { font, radius, space, tabular } from '../theme';
import { makeStyles, useTheme } from '../useTheme';

/**
 * The crossings map, in two variants.
 *
 * `card` is the prototype's inline map on the Crossings screen — a 260px card
 * between the "Fastest door-to-door" hero and the ranked list. There is no Map
 * tab (`tabsDef = [['home','Crossings'],['trips','Trips'],['alerts','Alerts']]`).
 *
 * `full` is the same map filling a pushed route, which is where panning and
 * zooming live. The split exists because the card sits inside the Home
 * ScrollView, and a pannable map there swallows the page scroll — so the card
 * is static and a tap on it opens the full screen instead.
 *
 * Two departures from the prototype's version, both forced by reality:
 *
 * - The basemap is the real platform map, not the prototype's hand-drawn SVG.
 *   That artwork is a picture of Laredo (I-35, Mines Rd, LAREDO / NUEVO
 *   LAREDO) with pin positions hardcoded in pixels; the pilot region is the
 *   Rio Grande Valley, so every one of those coordinates is wrong here.
 * - Only the top-ranked pin carries a name label. See `pinShowsName`.
 *
 * Rows are passed in, never re-derived, so the pins and the list beside them
 * cannot disagree about a crossing.
 */

/** The prototype's map card: `height:260px`. */
const MAP_HEIGHT = 260;

export interface CrossingsMapProps {
  readonly rows: readonly RankedPort[];
  readonly origin: Origin;
  /** "Vehicle" / "Walk" — the chip reads "<mode> · wait". */
  readonly modeLabel: string;
  /** `card` (default) is static and tappable; `full` pans and zooms. */
  readonly variant?: 'card' | 'full';
  /**
   * Card only: a tap on the basemap. Pin taps open that crossing instead and
   * never reach this — react-native-maps does not raise the map's own onPress
   * for a tap that a Marker handled.
   */
  readonly onExpand?: () => void;
  /**
   * Space the caller floats its own chrome in at the bottom of the map. The
   * legend lifts clear of it rather than hiding behind it.
   */
  readonly insetBottom?: number;
  /**
   * Full screen only: the status-bar inset. The map runs edge to edge under
   * the bar there, and the mode chip at `top: 10` sat on the Wi-Fi and battery
   * icons.
   */
  readonly insetTop?: number;
}

export default function CrossingsMap({
  rows,
  origin,
  modeLabel,
  variant = 'card',
  onExpand,
  insetBottom = 0,
  insetTop = 0,
}: CrossingsMapProps) {
  const t = useTheme();
  const styles = useStyles();
  const region = useMemo(() => {
    const bounds = boundsOf(rows, origin);
    return bounds ? boundsToRegion(bounds) : null;
  }, [rows, origin]);

  if (!region) return null;

  const isCard = variant === 'card';

  return (
    <View style={isCard ? styles.card : styles.full}>
      <MapView
        /*
         * The basemap is told the app's scheme explicitly, and the view is
         * keyed on it. Both are needed:
         *
         * - Explicit, not "follow system": `useTheme` has an in-app override
         *   (Auto / Light / Dark). It is pushed to native too, but that call
         *   can be unavailable, so the map must not be the one surface that
         *   follows the phone while the chrome follows the app — dark chrome
         *   over a light map is exactly the failure this prevents.
         * - Keyed: iOS applies a changed `userInterfaceStyle`, but Android's
         *   react-native-maps reads it only at creation (`setUserInterfaceStyle`
         *   is a no-op stub), so without a remount a scheme change would leave
         *   the old basemap for the life of the mount. The cost is the full
         *   screen's pan position on a scheme change, which is rare.
         */
        key={t.scheme}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={t.scheme}
        /*
         * The card's framing is controlled, so it re-fits when the ranking
         * changes. The full screen seeds the region once and then leaves it
         * alone — a controlled region there would yank the map back every time
         * a poll landed, mid-gesture.
         */
        {...(isCard ? { region } : { initialRegion: region })}
        scrollEnabled={!isCard}
        zoomEnabled={!isCard}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        // Apple's "Legal" link must stay visible; lift it (and the logo) clear
        // of whatever the caller floats at the bottom.
        legalLabelInsets={{ top: 0, left: 0, bottom: insetBottom, right: 0 }}
        onPress={isCard ? onExpand : undefined}
      >
        {rows.map((row) => {
          const { lat, lng } = row.port;
          if (lat === null || lng === null) return null;
          const showName = pinShowsName(row);
          return (
            <Marker
              // `tracksViewChanges={false}` snapshots the pin view once, so a
              // scheme change would leave the old palette on screen; keying on
              // the scheme remounts the eleven markers instead, which is cheap.
              key={`${row.port.id}:${t.scheme}`}
              coordinate={{ latitude: lat, longitude: lng }}
              // The caret tip marks the crossing, not the bubble's centre.
              // `anchor` places it on Google Maps, `centerOffset` on Apple Maps.
              anchor={{ x: 0.5, y: pinAnchorY(showName) }}
              centerOffset={{ x: 0, y: pinCenterOffsetY(showName) }}
              zIndex={pinZIndex(row)}
              tracksViewChanges={false}
              onPress={() => router.push(`/port/${row.port.id}`)}
            >
              <View style={styles.pin}>
                <View style={[styles.pinBubble, { backgroundColor: pinColor(row, t) }]}>
                  <Text style={[styles.pinText, { color: pinTextColor(row, t) }, tabular]}>
                    {pinLabel(row)}
                  </Text>
                </View>
                <View style={[styles.pinCaret, { borderTopColor: pinColor(row, t) }]} />
                {showName && (
                  <Text style={styles.pinName} numberOfLines={1}>
                    {pinName(row)}
                  </Text>
                )}
              </View>
            </Marker>
          );
        })}

        {/*
          The origin dot. Hollow when location was denied and useOrigin handed
          back the Valley-central fallback — never a solid "you are here" that
          pretends to be GPS.
        */}
        <Marker
          key={`origin:${t.scheme}`}
          coordinate={{ latitude: origin.lat, longitude: origin.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          title={origin.isFallback ? 'Approximate starting point' : 'Your location'}
        >
          <View style={origin.isFallback ? styles.originFallbackDot : styles.originDot} />
        </Marker>
      </MapView>

      <ModeChip label={modeLabel} top={MODE_CHIP_TOP + insetTop} />
      <Legend bottom={LEGEND_BOTTOM + insetBottom} />
      {isCard && onExpand ? <ExpandHint onPress={onExpand} /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ color }) => {
  const frame = {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.line,
  };
  return {
    card: {
      ...frame,
      marginHorizontal: space.gutter,
      marginTop: space.sectionGap,
      height: MAP_HEIGHT,
    },
    full: { ...frame, flex: 1, borderRadius: 0, borderWidth: 0 },

    pin: { alignItems: 'center' },
    // No shadow — a `surface` hairline separates the bubble from the basemap.
    // A pill, like every other capsule in the system.
    pinBubble: {
      height: PIN.bubbleH,
      justifyContent: 'center',
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: color.surface,
    },
    // The colour is always overridden inline by `pinTextColor`; this is the
    // white-on-dot default it resolves to for the live scale.
    pinText: { fontSize: 13, fontFamily: font.bold, color: color.onCobalt },
    pinCaret: {
      width: 0,
      height: 0,
      borderLeftWidth: PIN.caretW / 2,
      borderRightWidth: PIN.caretW / 2,
      borderTopWidth: PIN.caretH,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
    },
    pinName: {
      marginTop: PIN.nameGap,
      height: PIN.nameH,
      fontSize: 9,
      lineHeight: PIN.nameH,
      fontFamily: font.semibold,
      color: color.ink,
      backgroundColor: color.overlay,
      borderRadius: radius.sm,
      paddingHorizontal: 6,
      overflow: 'hidden',
    },

    // A mark with nothing on top of it, so `accent` (cobalt in light; lifted
    // in dark, where bare cobalt is ~2:1 on the dark basemap). The halo is
    // `onAccent` — what sits on a small accent fill — so it stays white in
    // light (the basemap's ground) and inverts to navy on the lifted dot.
    originDot: {
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: color.accent, borderWidth: 2.5, borderColor: color.onAccent,
    },
    originFallbackDot: {
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: 'transparent', borderWidth: 2, borderColor: color.muted,
    },
  };
});
