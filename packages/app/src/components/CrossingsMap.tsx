import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';
import { ExpandHint, Legend, LEGEND_BOTTOM, ModeChip } from './MapChrome';
import { PIN, pinAnchorY, pinColor, pinLabel, pinName, pinShowsName, pinTextColor, pinZIndex } from './map-pin';
import { boundsOf, boundsToRegion } from '../map-bounds';
import type { RankedPort } from '../ranking';
import type { Origin } from '../useOrigin';
import { color, dropShadow, font, radius, space, tabular } from '../theme';

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
  /** "Vehicle" / "Walk" — the chip reads "<mode> · total min". */
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
}

export default function CrossingsMap({
  rows,
  origin,
  modeLabel,
  variant = 'card',
  onExpand,
  insetBottom = 0,
}: CrossingsMapProps) {
  const region = useMemo(() => {
    const bounds = boundsOf(rows, origin);
    return bounds ? boundsToRegion(bounds) : null;
  }, [rows, origin]);

  if (!region) return null;

  const isCard = variant === 'card';

  return (
    <View style={isCard ? styles.card : styles.full}>
      <MapView
        style={StyleSheet.absoluteFill}
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
        onPress={isCard ? onExpand : undefined}
      >
        {rows.map((row) => {
          const { lat, lng } = row.port;
          if (lat === null || lng === null) return null;
          const showName = pinShowsName(row);
          return (
            <Marker
              key={row.port.id}
              coordinate={{ latitude: lat, longitude: lng }}
              // The caret tip marks the crossing, not the bubble's centre.
              anchor={{ x: 0.5, y: pinAnchorY(showName) }}
              zIndex={pinZIndex(row)}
              tracksViewChanges={false}
              onPress={() => router.push(`/port/${row.port.id}`)}
            >
              <View style={styles.pin}>
                <View style={[styles.pinBubble, { backgroundColor: pinColor(row) }]}>
                  <Text style={[styles.pinText, { color: pinTextColor(row) }, tabular]}>
                    {pinLabel(row)}
                  </Text>
                </View>
                <View style={[styles.pinCaret, { borderTopColor: pinColor(row) }]} />
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
          coordinate={{ latitude: origin.lat, longitude: origin.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          title={origin.isFallback ? 'Approximate starting point' : 'Your location'}
        >
          <View style={origin.isFallback ? styles.originFallbackDot : styles.originDot} />
        </Marker>
      </MapView>

      <ModeChip label={modeLabel} />
      <Legend bottom={LEGEND_BOTTOM + insetBottom} />
      {isCard && onExpand ? <ExpandHint onPress={onExpand} /> : null}
    </View>
  );
}

const surface = {
  borderRadius: radius.cardLg,
  overflow: 'hidden' as const,
  borderWidth: 1,
  borderColor: color.border,
  backgroundColor: color.trackBg,
};

const styles = StyleSheet.create({
  card: {
    ...surface,
    marginHorizontal: space.gutter,
    marginTop: space.sectionGap,
    height: MAP_HEIGHT,
  },
  full: { ...surface, flex: 1, borderRadius: 0, borderWidth: 0 },

  pin: { alignItems: 'center' },
  pinBubble: {
    height: PIN.bubbleH,
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
    ...dropShadow({ y: 2, blur: 6, color: color.ink, opacity: 0.25, elevation: 3 }),
  },
  pinText: { fontSize: 13, fontFamily: font.extrabold, color: color.card },
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
    fontFamily: font.bold,
    color: color.bodyMuted,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 5,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },

  originDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: color.navy, borderWidth: 2.5, borderColor: color.card,
  },
  originFallbackDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'transparent', borderWidth: 2, borderColor: color.tabInactive,
  },
});
